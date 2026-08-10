import { db, tasks, users, properties, units, tenants } from "@hearthlane/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { TaskCreateInput, TaskStatus } from "@hearthlane/validation";

export interface TaskFilters {
  status?: TaskStatus;
  ownerId?: string;
}

export async function listTasks(orgId: string, filters?: TaskFilters) {
  const conditions = [
    eq(tasks.orgId, orgId),
    isNull(tasks.archivedAt)
  ];

  if (filters?.status) {
    conditions.push(eq(tasks.status, filters.status));
  }
  if (filters?.ownerId) {
    conditions.push(eq(tasks.ownerId, filters.ownerId));
  }

  return db.select({
    id: tasks.id,
    title: tasks.title,
    description: tasks.description,
    dueDate: tasks.dueDate,
    ownerId: tasks.ownerId,
    status: tasks.status,
    priority: tasks.priority,
    type: tasks.type,
    propertyId: tasks.propertyId,
    unitId: tasks.unitId,
    tenantId: tasks.tenantId,
    leaseId: tasks.leaseId,
    maintenanceRequestId: tasks.maintenanceRequestId,
    workOrderId: tasks.workOrderId,
    notes: tasks.notes,
    createdAt: tasks.createdAt,
    ownerName: users.name,
    propertyNickname: properties.nickname,
    unitNumber: units.unitNumber,
    tenantName: tenants.name,
  })
  .from(tasks)
  .innerJoin(users, eq(tasks.ownerId, users.id))
  .leftJoin(properties, eq(tasks.propertyId, properties.id))
  .leftJoin(units, eq(tasks.unitId, units.id))
  .leftJoin(tenants, eq(tasks.tenantId, tenants.id))
  .where(and(...conditions));
}

export async function createTask(orgId: string, userId: string, input: TaskCreateInput) {
  const [task] = await db.insert(tasks).values({
    orgId,
    title: input.title,
    description: input.description || null,
    dueDate: new Date(input.dueDate),
    ownerId: input.ownerId,
    status: input.status,
    priority: input.priority,
    type: input.type,
    propertyId: input.propertyId || null,
    unitId: input.unitId || null,
    tenantId: input.tenantId || null,
    leaseId: input.leaseId || null,
    maintenanceRequestId: input.maintenanceRequestId || null,
    workOrderId: input.workOrderId || null,
    notes: input.notes || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "task",
    entityId: task.id,
    action: "create",
    newState: task,
  });

  return task;
}

export async function updateTask(
  orgId: string,
  userId: string,
  id: string,
  input: Partial<TaskCreateInput>
) {
  const [existing] = await db.select()
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.id, id), isNull(tasks.archivedAt)));

  if (!existing) throw new Error("Task not found");

  const updateFields: any = {};
  if (input.title !== undefined) updateFields.title = input.title;
  if (input.description !== undefined) updateFields.description = input.description || null;
  if (input.dueDate !== undefined) updateFields.dueDate = new Date(input.dueDate);
  if (input.ownerId !== undefined) updateFields.ownerId = input.ownerId;
  if (input.status !== undefined) updateFields.status = input.status;
  if (input.priority !== undefined) updateFields.priority = input.priority;
  if (input.type !== undefined) updateFields.type = input.type;
  if (input.propertyId !== undefined) updateFields.propertyId = input.propertyId || null;
  if (input.unitId !== undefined) updateFields.unitId = input.unitId || null;
  if (input.tenantId !== undefined) updateFields.tenantId = input.tenantId || null;
  if (input.leaseId !== undefined) updateFields.leaseId = input.leaseId || null;
  if (input.maintenanceRequestId !== undefined) updateFields.maintenanceRequestId = input.maintenanceRequestId || null;
  if (input.workOrderId !== undefined) updateFields.workOrderId = input.workOrderId || null;
  if (input.notes !== undefined) updateFields.notes = input.notes || null;
  updateFields.updatedAt = new Date();

  const [updated] = await db.update(tasks)
    .set(updateFields)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "task",
    entityId: id,
    action: "update",
    previousState: existing,
    newState: updated,
  });

  return updated;
}

export async function archiveTask(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.id, id), isNull(tasks.archivedAt)));

  if (!existing) throw new Error("Task not found");

  const [archived] = await db.update(tasks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.orgId, orgId), eq(tasks.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "task",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}
