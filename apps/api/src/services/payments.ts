import { db, payments, charges, paymentAllocations, tenants, properties, units } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { PaymentCreateInput } from "@odyssey/validation";
import { allocatePaymentToCharges } from "./imports";

export async function listPayments(orgId: string) {
  // We represent "payments" in the list view as charges (lease obligations)
  // joined with their allocated payment values, satisfying the Next.js UI data model.
  const list = await db.select({
    id: charges.id,
    tenantId: charges.tenantId,
    leaseId: charges.leaseId,
    propertyId: charges.propertyId,
    unitId: charges.unitId,
    amountDue: charges.amount, // obligation amount in cents
    dueDate: charges.dueDate,
    status: charges.status,
    memo: charges.notes,
    createdAt: charges.createdAt,
    tenantName: tenants.name,
    propertyNickname: properties.nickname,
    unitNumber: units.unitNumber,
  })
  .from(charges)
  .innerJoin(tenants, eq(charges.tenantId, tenants.id))
  .innerJoin(properties, eq(charges.propertyId, properties.id))
  .innerJoin(units, eq(charges.unitId, units.id))
  .where(and(eq(charges.orgId, orgId), isNull(charges.archivedAt)));

  // For each charge, compute the allocated cash received and clear dates
  const result = [];
  for (const item of list) {
    const allocations = await db.select({
      amount: paymentAllocations.amount,
      paidDate: payments.paidDate,
      method: payments.paymentMethod,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
    .where(and(eq(paymentAllocations.chargeId, item.id), isNull(paymentAllocations.archivedAt)));

    const amountReceived = allocations.reduce((sum, a) => sum + a.amount, 0);
    
    // Find the latest payment date
    let paidDate = null;
    let paymentMethod = null;
    if (allocations.length > 0) {
      const dates = allocations.map(a => new Date(a.paidDate || "").getTime()).filter(Boolean);
      if (dates.length > 0) {
        paidDate = new Date(Math.max(...dates));
      }
      paymentMethod = allocations[0].method;
    }

    result.push({
      ...item,
      amountReceived,
      paidDate,
      paymentMethod,
    });
  }

  return result;
}

export async function createPayment(orgId: string, userId: string, input: PaymentCreateInput) {
  const amountDueCents = Math.round(input.amountDue * 100);
  const amountReceivedCents = Math.round(input.amountReceived * 100);

  // 1. Create the Charge obligation
  const [charge] = await db.insert(charges).values({
    orgId,
    leaseId: input.leaseId,
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    unitId: input.unitId,
    type: "rent",
    amount: amountDueCents,
    dueDate: new Date(input.dueDate || Date.now()),
    balance: amountDueCents,
    status: "upcoming",
    notes: input.memo || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "charge",
    entityId: charge.id,
    action: "create",
    newState: charge,
  });

  let paymentRecord = null;

  // 2. If payment cash was received, record and allocate it
  if (amountReceivedCents > 0) {
    const [payment] = await db.insert(payments).values({
      orgId,
      tenantId: input.tenantId,
      leaseId: input.leaseId,
      propertyId: input.propertyId,
      unitId: input.unitId,
      amountReceived: amountReceivedCents,
      paidDate: input.paidDate ? new Date(input.paidDate) : new Date(),
      paymentMethod: input.paymentMethod || "cash",
      memo: input.memo || null,
      source: "manual",
      status: "paid",
    }).returning();

    paymentRecord = payment;

    // Apply allocation
    await allocatePaymentToCharges(orgId, payment.id, input.tenantId, amountReceivedCents);

    await logAction({
      orgId,
      userId,
      entityType: "payment",
      entityId: payment.id,
      action: "create",
      newState: payment,
    });
  }

  // To remain compatible with API router, return a simulated legacy payment record
  const [updatedCharge] = await db.select().from(charges).where(eq(charges.id, charge.id));
  
  return {
    id: charge.id,
    orgId,
    tenantId: charge.tenantId,
    leaseId: charge.leaseId,
    propertyId: charge.propertyId,
    unitId: charge.unitId,
    amountDue: charge.amount,
    amountReceived: amountReceivedCents,
    dueDate: charge.dueDate,
    paidDate: paymentRecord ? paymentRecord.paidDate : null,
    status: updatedCharge.status,
    paymentMethod: paymentRecord ? paymentRecord.paymentMethod : null,
    memo: charge.notes,
    createdAt: charge.createdAt,
    updatedAt: charge.updatedAt,
    archivedAt: charge.archivedAt,
  };
}

export async function updatePayment(
  orgId: string,
  userId: string,
  id: string,
  input: Partial<PaymentCreateInput>
) {
  // In charge-allocation system, updates to payments edit the charge row
  const [existingCharge] = await db.select()
    .from(charges)
    .where(and(eq(charges.orgId, orgId), eq(charges.id, id), isNull(charges.archivedAt)));

  if (!existingCharge) throw new Error("Obligation charge record not found");

  const updateFields: any = {};
  if (input.amountDue !== undefined) {
    updateFields.amount = Math.round(input.amountDue * 100);
    // Adjust balance to offset changes
    const allocated = existingCharge.amount - existingCharge.balance;
    updateFields.balance = Math.max(0, updateFields.amount - allocated);
    if (updateFields.balance === 0) {
      updateFields.status = "paid";
    } else if (updateFields.balance < updateFields.amount) {
      updateFields.status = "partial";
    } else {
      updateFields.status = "upcoming";
    }
  }
  
  if (input.dueDate !== undefined && input.dueDate !== null) {
    updateFields.dueDate = new Date(input.dueDate);
  }
  if (input.memo !== undefined) {
    updateFields.notes = input.memo || null;
  }
  if (input.status !== undefined) {
    updateFields.status = input.status;
  }

  updateFields.updatedAt = new Date();

  const [updated] = await db.update(charges)
    .set(updateFields)
    .where(and(eq(charges.orgId, orgId), eq(charges.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "charge",
    entityId: id,
    action: "update",
    previousState: existingCharge,
    newState: updated,
  });

  // If amountReceived is updated, insert a new payment record and re-allocate
  let newAmountReceived = 0;
  if (input.amountReceived !== undefined) {
    newAmountReceived = Math.round(input.amountReceived * 100);
    if (newAmountReceived > 0) {
      const [payment] = await db.insert(payments).values({
        orgId,
        tenantId: updated.tenantId,
        leaseId: updated.leaseId,
        propertyId: updated.propertyId,
        unitId: updated.unitId,
        amountReceived: newAmountReceived,
        paidDate: input.paidDate ? new Date(input.paidDate) : new Date(),
        paymentMethod: input.paymentMethod || "cash",
        source: "manual",
        status: "paid",
      }).returning();

      await allocatePaymentToCharges(orgId, payment.id, updated.tenantId, newAmountReceived);
    }
  }

  return {
    id: updated.id,
    orgId,
    tenantId: updated.tenantId,
    leaseId: updated.leaseId,
    propertyId: updated.propertyId,
    unitId: updated.unitId,
    amountDue: updated.amount,
    amountReceived: newAmountReceived,
    dueDate: updated.dueDate,
    paidDate: input.paidDate ? new Date(input.paidDate) : null,
    status: updated.status,
    paymentMethod: input.paymentMethod || null,
    memo: updated.notes,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    archivedAt: updated.archivedAt,
  };
}

export async function archivePayment(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(charges)
    .where(and(eq(charges.orgId, orgId), eq(charges.id, id), isNull(charges.archivedAt)));

  if (!existing) throw new Error("Record not found");

  const [archived] = await db.update(charges)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(charges.orgId, orgId), eq(charges.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "charge",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}
