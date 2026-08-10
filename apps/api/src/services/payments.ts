import { db, payments, tenants, properties, units } from "@hearthlane/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { PaymentCreateInput } from "@hearthlane/validation";

export async function listPayments(orgId: string) {
  return db.select({
    id: payments.id,
    tenantId: payments.tenantId,
    leaseId: payments.leaseId,
    propertyId: payments.propertyId,
    unitId: payments.unitId,
    amountDue: payments.amountDue,
    amountReceived: payments.amountReceived,
    dueDate: payments.dueDate,
    paidDate: payments.paidDate,
    status: payments.status,
    paymentMethod: payments.paymentMethod,
    memo: payments.memo,
    createdAt: payments.createdAt,
    tenantName: tenants.name,
    propertyNickname: properties.nickname,
    unitNumber: units.unitNumber,
  })
  .from(payments)
  .innerJoin(tenants, eq(payments.tenantId, tenants.id))
  .innerJoin(properties, eq(payments.propertyId, properties.id))
  .innerJoin(units, eq(payments.unitId, units.id))
  .where(and(eq(payments.orgId, orgId), isNull(payments.archivedAt)));
}

export async function createPayment(orgId: string, userId: string, input: PaymentCreateInput) {
  // convert amounts from dollars to cents for DB
  const amountDueCents = Math.round(input.amountDue * 100);
  const amountReceivedCents = Math.round(input.amountReceived * 100);

  const [payment] = await db.insert(payments).values({
    orgId,
    tenantId: input.tenantId,
    leaseId: input.leaseId,
    propertyId: input.propertyId,
    unitId: input.unitId,
    amountDue: amountDueCents,
    amountReceived: amountReceivedCents,
    dueDate: new Date(input.dueDate),
    paidDate: input.paidDate ? new Date(input.paidDate) : null,
    status: input.status,
    paymentMethod: input.paymentMethod || null,
    memo: input.memo || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "payment",
    entityId: payment.id,
    action: "create",
    newState: payment,
  });

  return payment;
}

export async function updatePayment(
  orgId: string,
  userId: string,
  id: string,
  input: Partial<PaymentCreateInput>
) {
  const [existing] = await db.select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.id, id), isNull(payments.archivedAt)));

  if (!existing) throw new Error("Payment record not found");

  const updateFields: any = {};
  if (input.tenantId !== undefined) updateFields.tenantId = input.tenantId;
  if (input.leaseId !== undefined) updateFields.leaseId = input.leaseId;
  if (input.propertyId !== undefined) updateFields.propertyId = input.propertyId;
  if (input.unitId !== undefined) updateFields.unitId = input.unitId;
  
  if (input.amountDue !== undefined) {
    updateFields.amountDue = Math.round(input.amountDue * 100);
  }
  if (input.amountReceived !== undefined) {
    updateFields.amountReceived = Math.round(input.amountReceived * 100);
  }
  
  if (input.dueDate !== undefined) updateFields.dueDate = new Date(input.dueDate);
  if (input.paidDate !== undefined) {
    updateFields.paidDate = input.paidDate ? new Date(input.paidDate) : null;
  }
  if (input.status !== undefined) updateFields.status = input.status;
  if (input.paymentMethod !== undefined) updateFields.paymentMethod = input.paymentMethod || null;
  if (input.memo !== undefined) updateFields.memo = input.memo || null;
  
  updateFields.updatedAt = new Date();

  const [updated] = await db.update(payments)
    .set(updateFields)
    .where(and(eq(payments.orgId, orgId), eq(payments.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "payment",
    entityId: id,
    action: "update",
    previousState: existing,
    newState: updated,
  });

  return updated;
}

export async function archivePayment(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.id, id), isNull(payments.archivedAt)));

  if (!existing) throw new Error("Payment record not found");

  const [archived] = await db.update(payments)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(payments.orgId, orgId), eq(payments.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "payment",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}
