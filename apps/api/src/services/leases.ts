import { db, leases, tenants, units, properties } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { LeaseCreateInput, TenantCreateInput } from "@odyssey/validation";

// Tenants
export async function listTenants(orgId: string) {
  return db.select()
    .from(tenants)
    .where(and(eq(tenants.orgId, orgId), isNull(tenants.archivedAt)));
}

export async function getTenantDetails(orgId: string, id: string) {
  const [tenant] = await db.select()
    .from(tenants)
    .where(and(eq(tenants.orgId, orgId), eq(tenants.id, id), isNull(tenants.archivedAt)));

  if (!tenant) return null;

  // Fetch all leases for this tenant
  const tenantLeases = await db.select({
    id: leases.id,
    unitId: leases.unitId,
    startDate: leases.startDate,
    endDate: leases.endDate,
    monthlyRent: leases.monthlyRent,
    securityDeposit: leases.securityDeposit,
    status: leases.status,
    renewalOption: leases.renewalOption,
    notes: leases.notes,
    unitNumber: units.unitNumber,
    propertyNickname: properties.nickname,
  })
  .from(leases)
  .innerJoin(units, eq(leases.unitId, units.id))
  .innerJoin(properties, eq(units.propertyId, properties.id))
  .where(and(eq(leases.orgId, orgId), eq(leases.primaryTenantId, id), isNull(leases.archivedAt)));

  return {
    ...tenant,
    leases: tenantLeases,
  };
}

export async function createTenant(orgId: string, userId: string, input: TenantCreateInput) {
  const [tenant] = await db.insert(tenants).values({
    orgId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    notes: input.notes || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "tenant",
    entityId: tenant.id,
    action: "create",
    newState: tenant,
  });

  return tenant;
}

// Leases
export async function listLeases(orgId: string) {
  return db.select({
    id: leases.id,
    unitId: leases.unitId,
    primaryTenantId: leases.primaryTenantId,
    startDate: leases.startDate,
    endDate: leases.endDate,
    monthlyRent: leases.monthlyRent,
    securityDeposit: leases.securityDeposit,
    status: leases.status,
    renewalOption: leases.renewalOption,
    notes: leases.notes,
    tenantName: tenants.name,
    unitNumber: units.unitNumber,
    propertyNickname: properties.nickname,
    propertyId: properties.id,
  })
  .from(leases)
  .innerJoin(tenants, eq(leases.primaryTenantId, tenants.id))
  .innerJoin(units, eq(leases.unitId, units.id))
  .innerJoin(properties, eq(units.propertyId, properties.id))
  .where(and(eq(leases.orgId, orgId), isNull(leases.archivedAt)));
}

export async function getLeaseDetails(orgId: string, id: string) {
  const [lease] = await db.select({
    id: leases.id,
    unitId: leases.unitId,
    primaryTenantId: leases.primaryTenantId,
    startDate: leases.startDate,
    endDate: leases.endDate,
    monthlyRent: leases.monthlyRent,
    securityDeposit: leases.securityDeposit,
    status: leases.status,
    renewalOption: leases.renewalOption,
    notes: leases.notes,
    tenantName: tenants.name,
    tenantEmail: tenants.email,
    tenantPhone: tenants.phone,
    unitNumber: units.unitNumber,
    propertyNickname: properties.nickname,
    propertyId: properties.id,
  })
  .from(leases)
  .innerJoin(tenants, eq(leases.primaryTenantId, tenants.id))
  .innerJoin(units, eq(leases.unitId, units.id))
  .innerJoin(properties, eq(units.propertyId, properties.id))
  .where(and(eq(leases.orgId, orgId), eq(leases.id, id), isNull(leases.archivedAt)));

  return lease || null;
}

/**
 * @deprecated Task Center is manual-only. Retained as a compatibility no-op so
 * older callers cannot generate tasks during a rolling local upgrade.
 */
export async function checkAndGenerateRenewalTask(
  _orgId: string,
  _userId: string,
  _leaseId: string
): Promise<void> {
  return;
}

export async function createLease(orgId: string, userId: string, input: LeaseCreateInput) {
  const [lease] = await db.insert(leases).values({
    orgId,
    unitId: input.unitId,
    primaryTenantId: input.primaryTenantId,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    monthlyRent: Math.round(input.monthlyRent * 100),
    securityDeposit: Math.round(input.securityDeposit * 100),
    status: input.status,
    renewalOption: input.renewalOption,
    notes: input.notes || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "lease",
    entityId: lease.id,
    action: "create",
    newState: lease,
  });

  // If lease is active, check if unit needs occupied status
  if (lease.status === "active") {
    await db.update(units)
      .set({ status: "occupied", updatedAt: new Date() })
      .where(eq(units.id, lease.unitId));
  }

  // Compatibility no-op: Task Center tasks are manual-only.
  await checkAndGenerateRenewalTask(orgId, userId, lease.id);

  return lease;
}

export async function updateLease(
  orgId: string,
  userId: string,
  id: string,
  input: Partial<LeaseCreateInput>
) {
  const [existing] = await db.select()
    .from(leases)
    .where(and(eq(leases.orgId, orgId), eq(leases.id, id), isNull(leases.archivedAt)));

  if (!existing) throw new Error("Lease not found");

  const updateFields: any = {};
  if (input.startDate !== undefined) updateFields.startDate = new Date(input.startDate);
  if (input.endDate !== undefined) updateFields.endDate = new Date(input.endDate);
  if (input.monthlyRent !== undefined) updateFields.monthlyRent = Math.round(input.monthlyRent * 100);
  if (input.securityDeposit !== undefined) updateFields.securityDeposit = Math.round(input.securityDeposit * 100);
  if (input.status !== undefined) updateFields.status = input.status;
  if (input.renewalOption !== undefined) updateFields.renewalOption = input.renewalOption;
  if (input.notes !== undefined) updateFields.notes = input.notes || null;
  updateFields.updatedAt = new Date();

  const [updated] = await db.update(leases)
    .set(updateFields)
    .where(and(eq(leases.orgId, orgId), eq(leases.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "lease",
    entityId: id,
    action: "update",
    previousState: existing,
    newState: updated,
  });

  // Handle status update consequences (updating Unit occupancy)
  if (input.status === "active") {
    await db.update(units)
      .set({ status: "occupied", updatedAt: new Date() })
      .where(eq(units.id, updated.unitId));
  } else if (input.status === "ended") {
    await db.update(units)
      .set({ status: "vacant", updatedAt: new Date() })
      .where(eq(units.id, updated.unitId));
  }

  // Compatibility no-op: Task Center tasks are manual-only.
  await checkAndGenerateRenewalTask(orgId, userId, id);

  return updated;
}

export async function archiveLease(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(leases)
    .where(and(eq(leases.orgId, orgId), eq(leases.id, id), isNull(leases.archivedAt)));

  if (!existing) throw new Error("Lease not found");

  const [archived] = await db.update(leases)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leases.orgId, orgId), eq(leases.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "lease",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}
