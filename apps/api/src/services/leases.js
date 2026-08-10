"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTenants = listTenants;
exports.getTenantDetails = getTenantDetails;
exports.createTenant = createTenant;
exports.listLeases = listLeases;
exports.getLeaseDetails = getLeaseDetails;
exports.checkAndGenerateRenewalTask = checkAndGenerateRenewalTask;
exports.createLease = createLease;
exports.updateLease = updateLease;
exports.archiveLease = archiveLease;
const db_1 = require("@hearthlane/db");
const audit_1 = require("./audit");
// Tenants
async function listTenants(orgId) {
    return db_1.db.select()
        .from(db_1.tenants)
        .where((0, db_1.and)((0, db_1.eq)(db_1.tenants.orgId, orgId), (0, db_1.isNull)(db_1.tenants.archivedAt)));
}
async function getTenantDetails(orgId, id) {
    const [tenant] = await db_1.db.select()
        .from(db_1.tenants)
        .where((0, db_1.and)((0, db_1.eq)(db_1.tenants.orgId, orgId), (0, db_1.eq)(db_1.tenants.id, id), (0, db_1.isNull)(db_1.tenants.archivedAt)));
    if (!tenant)
        return null;
    // Fetch all leases for this tenant
    const tenantLeases = await db_1.db.select({
        id: db_1.leases.id,
        unitId: db_1.leases.unitId,
        startDate: db_1.leases.startDate,
        endDate: db_1.leases.endDate,
        monthlyRent: db_1.leases.monthlyRent,
        securityDeposit: db_1.leases.securityDeposit,
        status: db_1.leases.status,
        renewalOption: db_1.leases.renewalOption,
        notes: db_1.leases.notes,
        unitNumber: db_1.units.unitNumber,
        propertyNickname: db_1.properties.nickname,
    })
        .from(db_1.leases)
        .innerJoin(db_1.units, (0, db_1.eq)(db_1.leases.unitId, db_1.units.id))
        .innerJoin(db_1.properties, (0, db_1.eq)(db_1.units.propertyId, db_1.properties.id))
        .where((0, db_1.and)((0, db_1.eq)(db_1.leases.orgId, orgId), (0, db_1.eq)(db_1.leases.primaryTenantId, id), (0, db_1.isNull)(db_1.leases.archivedAt)));
    return {
        ...tenant,
        leases: tenantLeases,
    };
}
async function createTenant(orgId, userId, input) {
    const [tenant] = await db_1.db.insert(db_1.tenants).values({
        orgId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        notes: input.notes || null,
    }).returning();
    await (0, audit_1.logAction)({
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
async function listLeases(orgId) {
    return db_1.db.select({
        id: db_1.leases.id,
        unitId: db_1.leases.unitId,
        primaryTenantId: db_1.leases.primaryTenantId,
        startDate: db_1.leases.startDate,
        endDate: db_1.leases.endDate,
        monthlyRent: db_1.leases.monthlyRent,
        securityDeposit: db_1.leases.securityDeposit,
        status: db_1.leases.status,
        renewalOption: db_1.leases.renewalOption,
        notes: db_1.leases.notes,
        tenantName: db_1.tenants.name,
        unitNumber: db_1.units.unitNumber,
        propertyNickname: db_1.properties.nickname,
        propertyId: db_1.properties.id,
    })
        .from(db_1.leases)
        .innerJoin(db_1.tenants, (0, db_1.eq)(db_1.leases.primaryTenantId, db_1.tenants.id))
        .innerJoin(db_1.units, (0, db_1.eq)(db_1.leases.unitId, db_1.units.id))
        .innerJoin(db_1.properties, (0, db_1.eq)(db_1.units.propertyId, db_1.properties.id))
        .where((0, db_1.and)((0, db_1.eq)(db_1.leases.orgId, orgId), (0, db_1.isNull)(db_1.leases.archivedAt)));
}
async function getLeaseDetails(orgId, id) {
    const [lease] = await db_1.db.select({
        id: db_1.leases.id,
        unitId: db_1.leases.unitId,
        primaryTenantId: db_1.leases.primaryTenantId,
        startDate: db_1.leases.startDate,
        endDate: db_1.leases.endDate,
        monthlyRent: db_1.leases.monthlyRent,
        securityDeposit: db_1.leases.securityDeposit,
        status: db_1.leases.status,
        renewalOption: db_1.leases.renewalOption,
        notes: db_1.leases.notes,
        tenantName: db_1.tenants.name,
        tenantEmail: db_1.tenants.email,
        tenantPhone: db_1.tenants.phone,
        unitNumber: db_1.units.unitNumber,
        propertyNickname: db_1.properties.nickname,
        propertyId: db_1.properties.id,
    })
        .from(db_1.leases)
        .innerJoin(db_1.tenants, (0, db_1.eq)(db_1.leases.primaryTenantId, db_1.tenants.id))
        .innerJoin(db_1.units, (0, db_1.eq)(db_1.leases.unitId, db_1.units.id))
        .innerJoin(db_1.properties, (0, db_1.eq)(db_1.units.propertyId, db_1.properties.id))
        .where((0, db_1.and)((0, db_1.eq)(db_1.leases.orgId, orgId), (0, db_1.eq)(db_1.leases.id, id), (0, db_1.isNull)(db_1.leases.archivedAt)));
    return lease || null;
}
// Automatically check and generate a renewal review task if needed
async function checkAndGenerateRenewalTask(orgId, userId, leaseId) {
    const lease = await getLeaseDetails(orgId, leaseId);
    if (!lease)
        return;
    const msInDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry = Math.ceil((new Date(lease.endDate).getTime() - new Date().getTime()) / msInDay);
    if (daysUntilExpiry <= 90 && lease.status === "active") {
        // Check if task already exists
        const [existingTask] = await db_1.db.select()
            .from(db_1.tasks)
            .where((0, db_1.and)((0, db_1.eq)(db_1.tasks.orgId, orgId), (0, db_1.eq)(db_1.tasks.leaseId, leaseId), (0, db_1.eq)(db_1.tasks.type, "lease_renewal"), (0, db_1.isNull)(db_1.tasks.archivedAt)));
        if (!existingTask) {
            // Create automatic renewal-review task
            const dueDate = new Date(lease.endDate);
            dueDate.setDate(dueDate.getDate() - 60); // Due 60 days before expiration
            // Ensure due date is not in the past
            const finalDueDate = dueDate.getTime() < Date.now() ? new Date() : dueDate;
            await db_1.db.insert(db_1.tasks).values({
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
async function createLease(orgId, userId, input) {
    const [lease] = await db_1.db.insert(db_1.leases).values({
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
    await (0, audit_1.logAction)({
        orgId,
        userId,
        entityType: "lease",
        entityId: lease.id,
        action: "create",
        newState: lease,
    });
    // If lease is active, check if unit needs occupied status
    if (lease.status === "active") {
        await db_1.db.update(db_1.units)
            .set({ status: "occupied", updatedAt: new Date() })
            .where((0, db_1.eq)(db_1.units.id, lease.unitId));
    }
    // Trigger automatic renewal check
    await checkAndGenerateRenewalTask(orgId, userId, lease.id);
    return lease;
}
async function updateLease(orgId, userId, id, input) {
    const [existing] = await db_1.db.select()
        .from(db_1.leases)
        .where((0, db_1.and)((0, db_1.eq)(db_1.leases.orgId, orgId), (0, db_1.eq)(db_1.leases.id, id), (0, db_1.isNull)(db_1.leases.archivedAt)));
    if (!existing)
        throw new Error("Lease not found");
    const updateFields = {};
    if (input.startDate !== undefined)
        updateFields.startDate = new Date(input.startDate);
    if (input.endDate !== undefined)
        updateFields.endDate = new Date(input.endDate);
    if (input.monthlyRent !== undefined)
        updateFields.monthlyRent = Math.round(input.monthlyRent * 100);
    if (input.securityDeposit !== undefined)
        updateFields.securityDeposit = Math.round(input.securityDeposit * 100);
    if (input.status !== undefined)
        updateFields.status = input.status;
    if (input.renewalOption !== undefined)
        updateFields.renewalOption = input.renewalOption;
    if (input.notes !== undefined)
        updateFields.notes = input.notes || null;
    updateFields.updatedAt = new Date();
    const [updated] = await db_1.db.update(db_1.leases)
        .set(updateFields)
        .where((0, db_1.and)((0, db_1.eq)(db_1.leases.orgId, orgId), (0, db_1.eq)(db_1.leases.id, id)))
        .returning();
    await (0, audit_1.logAction)({
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
        await db_1.db.update(db_1.units)
            .set({ status: "occupied", updatedAt: new Date() })
            .where((0, db_1.eq)(db_1.units.id, updated.unitId));
    }
    else if (input.status === "ended") {
        await db_1.db.update(db_1.units)
            .set({ status: "vacant", updatedAt: new Date() })
            .where((0, db_1.eq)(db_1.units.id, updated.unitId));
    }
    // Trigger automatic renewal check
    await checkAndGenerateRenewalTask(orgId, userId, id);
    return updated;
}
async function archiveLease(orgId, userId, id) {
    const [existing] = await db_1.db.select()
        .from(db_1.leases)
        .where((0, db_1.and)((0, db_1.eq)(db_1.leases.orgId, orgId), (0, db_1.eq)(db_1.leases.id, id), (0, db_1.isNull)(db_1.leases.archivedAt)));
    if (!existing)
        throw new Error("Lease not found");
    const [archived] = await db_1.db.update(db_1.leases)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where((0, db_1.and)((0, db_1.eq)(db_1.leases.orgId, orgId), (0, db_1.eq)(db_1.leases.id, id)))
        .returning();
    await (0, audit_1.logAction)({
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
