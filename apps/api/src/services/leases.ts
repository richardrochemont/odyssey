import { db, leases, tenants, units, tasks, properties } from "@hearthlane/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { LeaseCreateInput, TenantCreateInput } from "@hearthlane/validation";

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

// Automatically check and generate a renewal review task if needed
export async function checkAndGenerateRenewalTask(
  orgId: string,
  userId: string,
  leaseId: string
): Promise<void> {
  const lease = await getLeaseDetails(orgId, leaseId);
  if (!lease) return;

  const msInDay = 24 * 60 * 60 * 1000;
  const daysUntilExpiry = Math.ceil((new Date(lease.endDate).getTime() - new Date().getTime()) / msInDay);

  if (daysUntilExpiry <= 90 && lease.status === "active") {
    // Check if task already exists
    const [existingTask] = await db.select()
      .from(tasks)
      .where(and(
        eq(tasks.orgId, orgId),
        eq(tasks.leaseId, leaseId),
        eq(tasks.type, "lease_renewal"),
        isNull(tasks.archivedAt)
      ));

    if (!existingTask) {
      // Create automatic renewal-review task
      const dueDate = new Date(lease.endDate);
      dueDate.setDate(dueDate.getDate() - 60); // Due 60 days before expiration

      // Ensure due date is not in the past
      const finalDueDate = dueDate.getTime() < Date.now() ? new Date() : dueDate;

      await db.insert(tasks).values({
        orgId,
        title: `Lease Renewal Review: ${lease.tenantName}`,
        description: `Automatic System Alert: Lease for ${lease.tenantName} in ${lease.propertyNickname} Unit ${lease.unitNumber} expires on ${new Date(lease.endDate).toLocaleDateString()}. Please initiate the renewal process.`,
        dueDate: finalDueDate,
        ownerId: userId,
        status: "todo",
        priority: "high",
        type: "lease_renewal",
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        tenantId: lease.primaryTenantId,
        leaseId: lease.id,
      });
    }
  }
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

  // Trigger automatic renewal check
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

  // Trigger automatic renewal check
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
