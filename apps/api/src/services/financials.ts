import { db, financialRecords, leases, properties, units, payments } from "@hearthlane/db";
import { and, eq, isNull, gte, lte } from "drizzle-orm";
import { logAction } from "./audit";
import { FinancialRecordCreateInput } from "@hearthlane/validation";

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
    type: "expense", // enforce expense type for Odyssey
    amount: Math.round(input.amount * 100), // convert dollars to cents
    date: new Date(input.date),
    category: input.category,
    notes: input.notes || null,
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

  // 1. Calculate scheduled rent from active leases
  const activeLeases = await db.select({
    monthlyRent: leases.monthlyRent,
  })
  .from(leases)
  .where(and(
    eq(leases.orgId, orgId),
    eq(leases.status, "active"),
    isNull(leases.archivedAt)
  ));

  const scheduledRent = activeLeases.reduce((sum, l) => sum + l.monthlyRent, 0);

  // 2. Fetch payments in range to compute recorded collected rent
  const rangePayments = await db.select()
    .from(payments)
    .where(and(
      eq(payments.orgId, orgId),
      gte(payments.dueDate, start),
      lte(payments.dueDate, end),
      isNull(payments.archivedAt)
    ));

  let collectedRent = 0;
  for (const p of rangePayments) {
    collectedRent += p.amountReceived;
  }

  // 3. Fetch all expenses in range
  const records = await db.select()
    .from(financialRecords)
    .where(and(
      eq(financialRecords.orgId, orgId),
      gte(financialRecords.date, start),
      lte(financialRecords.date, end),
      eq(financialRecords.type, "expense"),
      isNull(financialRecords.archivedAt)
    ));

  const totalExpenses = records.reduce((sum, r) => sum + r.amount, 0);
  const totalIncome = collectedRent;
  const netOperatingIncome = totalIncome - totalExpenses;

  return {
    scheduledRent,
    recordedRent: collectedRent,
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

  // Fetch all payments (to get collected rent)
  const allPayments = await db.select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), isNull(payments.archivedAt)));

  // Fetch all expenses (financial records with type = expense)
  const allExpenses = await db.select()
    .from(financialRecords)
    .where(and(eq(financialRecords.orgId, orgId), eq(financialRecords.type, "expense"), isNull(financialRecords.archivedAt)));

  for (let m = 0; m < 9; m++) {
    const monthOffset = m - 6; // -6 to 2
    const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthLabel = targetDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

    // Collected Rent (actual received in this month)
    const collected = allPayments
      .filter((p) => {
        const d = new Date(p.dueDate);
        return d >= startOfMonth && d <= endOfMonth;
      })
      .reduce((sum, p) => sum + p.amountReceived, 0);

    // Projected Rent (scheduled rent based on active leases for this month)
    const projected = activeLeases
      .filter((l) => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);
        return startOfMonth <= end && endOfMonth >= start;
      })
      .reduce((sum, l) => sum + l.monthlyRent, 0);

    // Recorded Expenses
    const recordedExp = allExpenses
      .filter((e) => {
        const d = new Date(e.date);
        return d >= startOfMonth && d <= endOfMonth;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    // Projected Expenses for future months
    let finalExpenses = recordedExp;
    if (monthOffset > 0) {
      const pastExpenses = allExpenses.filter((e) => new Date(e.date) < now);
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
