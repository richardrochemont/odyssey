import { db, financialRecords, properties, units, charges, paymentAllocations } from "@odyssey/db";
import { and, eq, isNull, gte, lte } from "drizzle-orm";
import { logAction } from "./audit";
import { FinancialRecordCreateInput } from "@odyssey/validation";
import { getOrCalculatePropertyMonthCoverage } from "./monthlySummaries";

export async function listFinancialRecords(orgId: string) {
  return db.select({
    id: financialRecords.id,
    propertyId: financialRecords.propertyId,
    unitId: financialRecords.unitId,
    type: financialRecords.type,
    amount: financialRecords.amount,
    date: financialRecords.date,
    category: financialRecords.category,
    notes: financialRecords.notes,
    createdAt: financialRecords.createdAt,
    propertyNickname: properties.nickname,
    unitNumber: units.unitNumber,
  })
  .from(financialRecords)
  .innerJoin(properties, eq(financialRecords.propertyId, properties.id))
  .leftJoin(units, eq(financialRecords.unitId, units.id))
  .where(and(
    eq(financialRecords.orgId, orgId),
    eq(financialRecords.type, "expense"),
    isNull(financialRecords.archivedAt)
  ));
}

export async function createFinancialRecord(orgId: string, userId: string, input: FinancialRecordCreateInput) {
  const [record] = await db.insert(financialRecords).values({
    orgId,
    propertyId: input.propertyId,
    unitId: input.unitId || null,
    type: "expense",
    amount: Math.round(input.amount * 100),
    date: new Date(input.date),
    category: input.category,
    notes: input.notes || null,
    vendorId: input.vendorId || null,
    sourceTransactionRef: input.sourceTransactionRef || null,
    state: input.state || "approved",
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "financial_record",
    entityId: record.id,
    action: "create",
    newState: record,
  });

  return record;
}

export async function archiveFinancialRecord(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(financialRecords)
    .where(and(eq(financialRecords.orgId, orgId), eq(financialRecords.id, id), isNull(financialRecords.archivedAt)));

  if (!existing) throw new Error("Financial record not found");

  const [archived] = await db.update(financialRecords)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(financialRecords.orgId, orgId), eq(financialRecords.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "financial_record",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}

export interface PortfolioSummary {
  status: "no_data" | "summary_only" | "partial_detail" | "detail_complete" | "needs_review";
  scheduledRent: number | null; // in cents
  recordedRent: number | null;  // in cents
  outstandingRent: number | null; // in cents
  totalIncome: number | null;   // in cents
  totalExpenses: number | null; // in cents
  netOperatingIncome: number | null; // in cents
  notes: string;
}

export async function getPortfolioFinancialSummary(
  orgId: string,
  propertyId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<PortfolioSummary> {
  const now = new Date();
  const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
  const end = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;

  // If propertyId provided, evaluate exact month coverage
  if (propertyId) {
    const coverage = await getOrCalculatePropertyMonthCoverage(orgId, propertyId, monthStr);
    
    if (coverage.state === "no_data") {
      return {
        status: "no_data",
        scheduledRent: null,
        recordedRent: null,
        outstandingRent: null,
        totalIncome: null,
        totalExpenses: null,
        netOperatingIncome: null,
        notes: "No financial data available for this month.",
      };
    }

    if (coverage.state === "summary_only" || coverage.state === "partial_detail") {
      const s = coverage.summaryMetrics!;
      return {
        status: coverage.state,
        scheduledRent: s.scheduledRentCents,
        recordedRent: s.collectedRentCents,
        outstandingRent: Math.max(0, s.scheduledRentCents - s.collectedRentCents),
        totalIncome: s.collectedRentCents,
        totalExpenses: s.expenseCents,
        netOperatingIncome: s.collectedRentCents - s.expenseCents,
        notes: coverage.state === "partial_detail" 
          ? "Partial transaction details present. Summary baseline retained." 
          : "Historical summary active.",
      };
    }
  }

  // Aggregate across property/charges
  const chargeRecords = await db.select()
    .from(charges)
    .where(and(
      eq(charges.orgId, orgId),
      gte(charges.dueDate, start),
      lte(charges.dueDate, end),
      isNull(charges.archivedAt)
    ));
  const scheduledRent = chargeRecords.reduce((sum, c) => sum + c.amount, 0);

  const allocations = await db.select({ amount: paymentAllocations.amount })
    .from(paymentAllocations)
    .innerJoin(charges, eq(paymentAllocations.chargeId, charges.id))
    .where(and(
      eq(charges.orgId, orgId),
      gte(charges.dueDate, start),
      lte(charges.dueDate, end),
      isNull(charges.archivedAt)
    ));
  const collectedRent = allocations.reduce((sum, a) => sum + a.amount, 0);

  const outstandingRent = chargeRecords.reduce((sum, c) => sum + c.balance, 0);

  const allExpenses = await db.select()
    .from(financialRecords)
    .where(and(
      eq(financialRecords.orgId, orgId),
      gte(financialRecords.date, start),
      lte(financialRecords.date, end),
      eq(financialRecords.type, "expense"),
      isNull(financialRecords.archivedAt)
    ));

  const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);

  // If no charges and no expenses exist at all, return no_data
  if (chargeRecords.length === 0 && allExpenses.length === 0) {
    return {
      status: "no_data",
      scheduledRent: null,
      recordedRent: null,
      outstandingRent: null,
      totalIncome: null,
      totalExpenses: null,
      netOperatingIncome: null,
      notes: "No financial data available for this month.",
    };
  }

  return {
    status: "detail_complete",
    scheduledRent,
    recordedRent: collectedRent,
    outstandingRent,
    totalIncome: collectedRent,
    totalExpenses,
    netOperatingIncome: collectedRent - totalExpenses,
    notes: "Detailed ledger records",
  };
}

export async function getPortfolioCashFlowTrends(orgId: string) {
  const trends: any[] = [];
  const now = new Date();

  for (let m = 0; m < 6; m++) {
    const monthOffset = m - 5;
    const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthLabel = targetDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    const summary = await getPortfolioFinancialSummary(orgId, undefined, targetDate, new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59));

    trends.push({
      month: monthLabel,
      status: summary.status,
      collected: summary.recordedRent !== null ? summary.recordedRent / 100 : null,
      expenses: summary.totalExpenses !== null ? summary.totalExpenses / 100 : null,
      netIncome: summary.netOperatingIncome !== null ? summary.netOperatingIncome / 100 : null,
    });
  }

  return trends;
}
