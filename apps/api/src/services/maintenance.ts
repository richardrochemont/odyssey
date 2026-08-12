import { db, maintenanceRequests, workOrders, vendors, properties, units, tenants } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { MaintenanceRequestCreateInput, WorkOrderCreateInput, VendorCreateInput, MaintenanceStatus, WorkOrderStatus } from "@odyssey/validation";

// Vendors
export async function listVendors(orgId: string) {
  return db.select()
    .from(vendors)
    .where(and(eq(vendors.orgId, orgId), isNull(vendors.archivedAt)));
}

export async function createVendor(orgId: string, userId: string, input: VendorCreateInput) {
  const [vendor] = await db.insert(vendors).values({
    orgId,
    name: input.name,
    specialty: input.specialty,
    email: input.email || null,
    phone: input.phone || null,
    notes: input.notes || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "vendor",
    entityId: vendor.id,
    action: "create",
    newState: vendor,
  });

  return vendor;
}

// Maintenance Requests
export async function listRequests(orgId: string) {
  return db.select({
    id: maintenanceRequests.id,
    title: maintenanceRequests.title,
    description: maintenanceRequests.description,
    priority: maintenanceRequests.priority,
    status: maintenanceRequests.status,
    attachmentPlaceholder: maintenanceRequests.attachmentPlaceholder,
    createdAt: maintenanceRequests.createdAt,
    propertyNickname: properties.nickname,
    unitNumber: units.unitNumber,
    tenantName: tenants.name,
  })
  .from(maintenanceRequests)
  .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
  .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
  .leftJoin(tenants, eq(maintenanceRequests.tenantId, tenants.id))
  .where(and(eq(maintenanceRequests.orgId, orgId), isNull(maintenanceRequests.archivedAt)));
}

export async function getRequestDetails(orgId: string, id: string) {
  const [request] = await db.select({
    id: maintenanceRequests.id,
    propertyId: maintenanceRequests.propertyId,
    unitId: maintenanceRequests.unitId,
    tenantId: maintenanceRequests.tenantId,
    title: maintenanceRequests.title,
    description: maintenanceRequests.description,
    priority: maintenanceRequests.priority,
    status: maintenanceRequests.status,
    attachmentPlaceholder: maintenanceRequests.attachmentPlaceholder,
    createdAt: maintenanceRequests.createdAt,
    propertyNickname: properties.nickname,
    unitNumber: units.unitNumber,
    tenantName: tenants.name,
  })
  .from(maintenanceRequests)
  .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
  .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
  .leftJoin(tenants, eq(maintenanceRequests.tenantId, tenants.id))
  .where(and(eq(maintenanceRequests.orgId, orgId), eq(maintenanceRequests.id, id), isNull(maintenanceRequests.archivedAt)));

  if (!request) return null;

  const associatedWorkOrders = await db.select({
    id: workOrders.id,
    vendorId: workOrders.vendorId,
    status: workOrders.status,
    notes: workOrders.notes,
    scheduledAt: workOrders.scheduledAt,
    completedAt: workOrders.completedAt,
    vendorName: vendors.name,
  })
  .from(workOrders)
  .innerJoin(vendors, eq(workOrders.vendorId, vendors.id))
  .where(and(eq(workOrders.orgId, orgId), eq(workOrders.maintenanceRequestId, id), isNull(workOrders.archivedAt)));

  return {
    ...request,
    workOrders: associatedWorkOrders,
  };
}

export async function createRequest(orgId: string, userId: string, input: MaintenanceRequestCreateInput) {
  const [request] = await db.insert(maintenanceRequests).values({
    orgId,
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantId: input.tenantId || null,
    title: input.title,
    description: input.description,
    priority: input.priority,
    status: input.status,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "maintenance_request",
    entityId: request.id,
    action: "create",
    newState: request,
  });

  return request;
}

export async function updateRequestStatus(orgId: string, userId: string, id: string, status: MaintenanceStatus) {
  const [existing] = await db.select()
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.orgId, orgId), eq(maintenanceRequests.id, id), isNull(maintenanceRequests.archivedAt)));

  if (!existing) throw new Error("Maintenance request not found");

  const [updated] = await db.update(maintenanceRequests)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(maintenanceRequests.orgId, orgId), eq(maintenanceRequests.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "maintenance_request",
    entityId: id,
    action: "status_transition",
    previousState: { status: existing.status },
    newState: { status },
  });

  return updated;
}

// Work Orders
export async function createWorkOrder(orgId: string, userId: string, input: WorkOrderCreateInput) {
  // 1. Create the work order
  const [workOrder] = await db.insert(workOrders).values({
    orgId,
    maintenanceRequestId: input.maintenanceRequestId,
    vendorId: input.vendorId,
    notes: input.notes || null,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    status: "assigned",
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "work_order",
    entityId: workOrder.id,
    action: "create",
    newState: workOrder,
  });

  // 2. Automatically transition the maintenance request status to "assigned"
  await updateRequestStatus(orgId, userId, input.maintenanceRequestId, "assigned");

  return workOrder;
}

export async function updateWorkOrderStatus(orgId: string, userId: string, id: string, status: WorkOrderStatus) {
  const [existing] = await db.select()
    .from(workOrders)
    .where(and(eq(workOrders.orgId, orgId), eq(workOrders.id, id), isNull(workOrders.archivedAt)));

  if (!existing) throw new Error("Work order not found");

  const updateFields: any = { status, updatedAt: new Date() };
  if (status === "completed") {
    updateFields.completedAt = new Date();
  }

  const [updated] = await db.update(workOrders)
    .set(updateFields)
    .where(and(eq(workOrders.orgId, orgId), eq(workOrders.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "work_order",
    entityId: id,
    action: "status_transition",
    previousState: { status: existing.status },
    newState: { status },
  });

  // Automatically transition maintenance request to "completed" if the work order is completed
  if (status === "completed") {
    await updateRequestStatus(orgId, userId, updated.maintenanceRequestId, "completed");
  }

  return updated;
}
