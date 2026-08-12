import { db, financialRecords, leases, properties, units, charges, paymentAllocations } from "@odyssey/db";
import { and, eq, isNull, gte, lte } from "drizzle-orm";
import { logAction } from "./audit";
import { FinancialRecordCreateInput } from "@odyssey/validation";

export async function listFinancialRecords(orgId: string) {
  return db.select({
    id: financialRecords.id,
    propertyId: financialRecords.propertyId,
    unitId: financialRecords.unitId,
    type: financialRecords.type,
    amount: financialRecords.amount, // in cents
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
    amount: Math.round(input.amount * 100), // convert dollars to cents
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
  scheduledRent: number; // in cents
  recordedRent: number;  // in cents
  outstandingRent: number; // in cents
  totalIncome: number;   // in cents
  totalExpenses: number; // in cents
  netOperatingIncome: number; // in cents
  notes: string;
}

export async function getPortfolioFinancialSummary(
  orgId: string,
  startDate?: Date,
  endDate?: Date
): Promise<PortfolioSummary> {
  const start = startDate || new Date(new Date().setDate(new Date().getDate() - 30));
  const end = endDate || new Date();

  // 1. Scheduled Rent (obligation billed amount from charges)
  const chargeRecords = await db.select()
    .from(charges)
    .where(and(
      eq(charges.orgId, orgId),
      gte(charges.dueDate, start),
      lte(charges.dueDate, end),
      isNull(charges.archivedAt)
    ));
  const scheduledRent = chargeRecords.reduce((sum, c) => sum + c.amount, 0);

  // 2. Collected Rent (payment allocations matched to charges in timeframe)
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

  // 3. Outstanding Rent Balance
  const outstandingRent = chargeRecords.reduce((sum, c) => sum + c.balance, 0);

  // 4. Expenses (Avoiding double counting historical summaries if transactions exist)
  const allExpenses = await db.select()
    .from(financialRecords)
    .where(and(
      eq(financialRecords.orgId, orgId),
      gte(financialRecords.date, start),
      lte(financialRecords.date, end),
      eq(financialRecords.type, "expense"),
      isNull(financialRecords.archivedAt)
    ));

  // Partition expenses into transaction-level vs summary-level
  const transactionExpenses = allExpenses.filter(e => !e.notes?.startsWith("[Historical Summary]"));
  const summaryExpenses = allExpenses.filter(e => e.notes?.startsWith("[Historical Summary]"));

  // Check if we have any transaction-level records
  let totalExpenses = 0;
  if (transactionExpenses.length > 0) {
    totalExpenses = transactionExpenses.reduce((sum, e) => sum + e.amount, 0);
  } else {
    totalExpenses = summaryExpenses.reduce((sum, e) => sum + e.amount, 0);
  }

  const totalIncome = collectedRent;
  const netOperatingIncome = totalIncome - totalExpenses;

  return {
    scheduledRent,
    recordedRent: collectedRent,
    outstandingRent,
    totalIncome,
    totalExpenses,
    netOperatingIncome,
    notes: "Operational view — not accounting",
  };
}

export async function getPortfolioCashFlowTrends(orgId: string) {
  const trends: any[] = [];
  const now = new Date();

  // Fetch active leases to project future rents
  const activeLeases = await db.select({
    monthlyRent: leases.monthlyRent,
    startDate: leases.startDate,
    endDate: leases.endDate,
  })
  .from(leases)
  .where(and(eq(leases.orgId, orgId), eq(leases.status, "active"), isNull(leases.archivedAt)));

  // Fetch all payment allocations
  const allAllocations = await db.select({
    amount: paymentAllocations.amount,
    dueDate: charges.dueDate,
  })
  .from(paymentAllocations)
  .innerJoin(charges, eq(paymentAllocations.chargeId, charges.id))
  .where(and(eq(charges.orgId, orgId), isNull(charges.archivedAt)));

  // Fetch all expenses
  const allExpenses = await db.select()
    .from(financialRecords)
    .where(and(eq(financialRecords.orgId, orgId), eq(financialRecords.type, "expense"), isNull(financialRecords.archivedAt)));

  for (let m = 0; m < 9; m++) {
    const monthOffset = m - 6; // -6 to 2
    const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthLabel = targetDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

    // Collected Rent (actual received allocation due in this month)
    const collected = allAllocations
      .filter((a) => {
        const d = new Date(a.dueDate);
        return d >= startOfMonth && d <= endOfMonth;
      })
      .reduce((sum, a) => sum + a.amount, 0);

    // Projected Rent (scheduled rent based on active leases for this month)
    const projected = activeLeases
      .filter((l) => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);
        return startOfMonth <= end && endOfMonth >= start;
      })
      .reduce((sum, l) => sum + l.monthlyRent, 0);

    // Filter expenses in month
    const monthExpenses = allExpenses.filter((e) => {
      const d = new Date(e.date);
      return d >= startOfMonth && d <= endOfMonth;
    });

    const txExpenses = monthExpenses.filter(e => !e.notes?.startsWith("[Historical Summary]"));
    const sumExpenses = monthExpenses.filter(e => e.notes?.startsWith("[Historical Summary]"));

    let finalExpenses = 0;
    if (txExpenses.length > 0) {
      finalExpenses = txExpenses.reduce((sum, e) => sum + e.amount, 0);
    } else {
      finalExpenses = sumExpenses.reduce((sum, e) => sum + e.amount, 0);
    }

    // Projected Expenses for future months
    if (monthOffset > 0 && finalExpenses === 0) {
      const pastExpenses = allExpenses.filter((e) => new Date(e.date) < now && !e.notes?.startsWith("[Historical Summary]"));
      const avgPast = pastExpenses.length > 0 
        ? Math.round(pastExpenses.reduce((sum, e) => sum + e.amount, 0) / 6) 
        : 0;
      finalExpenses = avgPast || 510000; // default average
    }

    trends.push({
      month: monthLabel,
      collected: collected / 100,
      projected: projected / 100,
      expenses: finalExpenses / 100,
    });
  }

  return trends;
}
