import { db, monthlyFinancialSummaries, propertyMonthFinancialCoverages, financialRecords, payments } from "@odyssey/db";
import { and, eq, isNull, gte, lte } from "drizzle-orm";
import { logAction } from "./audit";

export async function getOrCalculatePropertyMonthCoverage(
  orgId: string,
  propertyId: string,
  month: string // YYYY-MM
) {
  // 1. Fetch persisted coverage override record if present
  const [existingCoverage] = await db.select()
    .from(propertyMonthFinancialCoverages)
    .where(and(
      eq(propertyMonthFinancialCoverages.orgId, orgId),
      eq(propertyMonthFinancialCoverages.propertyId, propertyId),
      eq(propertyMonthFinancialCoverages.month, month),
      isNull(propertyMonthFinancialCoverages.archivedAt)
    ))
    .limit(1);

  // 2. Fetch monthly summary record
  const [summary] = await db.select()
    .from(monthlyFinancialSummaries)
    .where(and(
      eq(monthlyFinancialSummaries.orgId, orgId),
      eq(monthlyFinancialSummaries.propertyId, propertyId),
      eq(monthlyFinancialSummaries.month, month),
      isNull(monthlyFinancialSummaries.archivedAt)
    ))
    .limit(1);

  // 3. Query transaction details in month
  const yearNum = parseInt(month.slice(0, 4), 10);
  const monthNum = parseInt(month.slice(5, 7), 10);
  const startOfMonth = new Date(yearNum, monthNum - 1, 1);
  const endOfMonth = new Date(yearNum, monthNum, 0, 23, 59, 59);

  // Payments in month
  const paymentRecords = await db.select()
    .from(payments)
    .where(and(
      eq(payments.orgId, orgId),
      eq(payments.propertyId, propertyId),
      gte(payments.paidDate, startOfMonth),
      lte(payments.paidDate, endOfMonth),
      isNull(payments.archivedAt)
    ));

  // Expenses in month
  const expenseRecords = await db.select()
    .from(financialRecords)
    .where(and(
      eq(financialRecords.orgId, orgId),
      eq(financialRecords.propertyId, propertyId),
      eq(financialRecords.type, "expense"),
      gte(financialRecords.date, startOfMonth),
      lte(financialRecords.date, endOfMonth),
      isNull(financialRecords.archivedAt)
    ));

  const hasSummary = !!summary;
  const hasDetails = paymentRecords.length > 0 || expenseRecords.length > 0;

  let calculatedState: "no_data" | "summary_only" | "partial_detail" | "detail_complete" | "needs_review" = "no_data";

  if (existingCoverage && existingCoverage.state === "detail_complete") {
    calculatedState = "detail_complete";
  } else if (existingCoverage && existingCoverage.state === "needs_review") {
    calculatedState = "needs_review";
  } else if (!hasSummary && !hasDetails) {
    calculatedState = "no_data";
  } else if (hasSummary && !hasDetails) {
    calculatedState = "summary_only";
  } else if (hasSummary && hasDetails) {
    calculatedState = "partial_detail";
  } else if (!hasSummary && hasDetails) {
    calculatedState = "needs_review"; // Detailed only, unattested
  }

  // Calculate detailed sums
  const detailedCollectedCents = paymentRecords.reduce((sum, p) => sum + p.amountReceived, 0);
  const detailedExpenseCents = expenseRecords.reduce((sum, e) => sum + e.amount, 0);

  return {
    state: calculatedState,
    coverageRecord: existingCoverage || null,
    summaryRecord: summary || null,
    hasSummary,
    hasDetails,
    summaryMetrics: summary ? {
      scheduledRentCents: summary.scheduledRentCents,
      collectedRentCents: summary.collectedRentCents,
      expenseCents: summary.expenseCents,
    } : null,
    detailedMetrics: hasDetails ? {
      collectedRentCents: detailedCollectedCents,
      expenseCents: detailedExpenseCents,
      paymentCount: paymentRecords.length,
      expenseCount: expenseRecords.length,
    } : null,
  };
}

export async function invalidateCoverageForMonth(
  orgId: string,
  propertyId: string,
  month: string,
  entityType: string,
  entityId: string,
  userId?: string
) {
  const [existing] = await db.select()
    .from(propertyMonthFinancialCoverages)
    .where(and(
      eq(propertyMonthFinancialCoverages.orgId, orgId),
      eq(propertyMonthFinancialCoverages.propertyId, propertyId),
      eq(propertyMonthFinancialCoverages.month, month),
      isNull(propertyMonthFinancialCoverages.archivedAt)
    ))
    .limit(1);

  if (existing && existing.state === "detail_complete") {
    const [updated] = await db.update(propertyMonthFinancialCoverages)
      .set({
        state: "needs_review",
        invalidatedAt: new Date(),
        invalidatedByEntityType: entityType,
        invalidatedByEntityId: entityId,
        updatedAt: new Date(),
      })
      .where(eq(propertyMonthFinancialCoverages.id, existing.id))
      .returning();

    if (userId) {
      await logAction({
        orgId,
        userId,
        entityType: "property_month_financial_coverage",
        entityId: existing.id,
        action: "coverage_invalidated",
        previousState: existing,
        newState: updated,
      });
    }
    return updated;
  }

  return null;
}

export async function attestCoverageForMonth(
  orgId: string,
  userId: string,
  userRole: string,
  propertyId: string,
  month: string,
  targetState: "detail_complete" | "needs_review",
  reason?: string
) {
  if (userRole !== "owner") {
    throw new Error("Only an authorized workspace Owner can attest financial coverage status");
  }

  const [existing] = await db.select()
    .from(propertyMonthFinancialCoverages)
    .where(and(
      eq(propertyMonthFinancialCoverages.orgId, orgId),
      eq(propertyMonthFinancialCoverages.propertyId, propertyId),
      eq(propertyMonthFinancialCoverages.month, month),
      isNull(propertyMonthFinancialCoverages.archivedAt)
    ))
    .limit(1);

  let result;
  if (existing) {
    [result] = await db.update(propertyMonthFinancialCoverages)
      .set({
        state: targetState,
        attestedByUserId: userId,
        attestedAt: new Date(),
        attestationReason: reason || null,
        invalidatedAt: null,
        invalidatedByEntityType: null,
        invalidatedByEntityId: null,
        updatedAt: new Date(),
      })
      .where(eq(propertyMonthFinancialCoverages.id, existing.id))
      .returning();
  } else {
    [result] = await db.insert(propertyMonthFinancialCoverages).values({
      orgId,
      propertyId,
      month,
      state: targetState,
      attestedByUserId: userId,
      attestedAt: new Date(),
      attestationReason: reason || null,
    }).returning();
  }

  await logAction({
    orgId,
    userId,
    entityType: "property_month_financial_coverage",
    entityId: result.id,
    action: targetState === "detail_complete" ? "attest_coverage_complete" : "rollback_coverage_needs_review",
    previousState: existing || null,
    newState: result,
  });

  return result;
}
