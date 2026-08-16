import {
  db, tasks, users, organizationMemberships, properties, units, tenants, leases,
  payments, financialRecords, auditLogs,
} from "@odyssey/db";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { TaskCreateInput, TaskPatchInput, TaskPriority, TaskStatus } from "@odyssey/validation";
import { TaskAuditAction, writeTaskAudit } from "./taskAudit";

export type TaskRole = "owner" | "manager" | "accountant" | "maintenance" | "read_only";

export class TaskServiceError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export interface TaskActor { id: string; orgId: string; role: TaskRole }
export interface TaskFilters {
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  assigneeId?: string;
  assigneeMe?: boolean;
  unassigned?: boolean;
  propertyId?: string;
  due?: "overdue" | "today" | "next_7_days" | "none";
  dueFrom?: string;
  dueTo?: string;
  sort: "due_date" | "priority" | "newest" | "updated";
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
  archived?: boolean;
}

const assignee = alias(users, "task_assignee");
const creator = alias(users, "task_creator");
const activeStatuses = ["inbox", "planned", "in_progress", "waiting"] as const;

export function calendarDateSql(value: string) {
  // The value has already passed strict YYYY-MM-DD validation. PostgreSQL applies
  // its calendar components directly; JavaScript never constructs a Date here.
  return sql`${value}::date::timestamp`;
}

export function serializeCalendarDate(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function taskSelect() {
  return {
    id: tasks.id,
    title: tasks.title,
    description: tasks.description,
    status: tasks.status,
    priority: tasks.priority,
    dueDate: sql<string | null>`case when ${tasks.dueDate} is null then null else ${tasks.dueDate}::date::text end`,
    assigneeUserId: tasks.assigneeUserId,
    assigneeName: assignee.name,
    createdByUserId: tasks.createdByUserId,
    createdByName: creator.name,
    propertyId: tasks.propertyId,
    unitId: tasks.unitId,
    tenantId: tasks.tenantId,
    leaseId: tasks.leaseId,
    paymentId: tasks.paymentId,
    financialRecordId: tasks.financialRecordId,
    reconciliationMonth: tasks.reconciliationMonth,
    completedAt: tasks.completedAt,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
    archivedAt: tasks.archivedAt,
  };
}

export function hasTaskMutationAccess(task: { createdByUserId: string; assigneeUserId: string | null }, actor: TaskActor): boolean {
  return actor.role === "owner" || actor.role === "manager"
    || ((actor.role === "accountant" || actor.role === "maintenance")
      && (task.createdByUserId === actor.id || task.assigneeUserId === actor.id));
}

function permissions(task: any, actor: TaskActor) {
  const full = actor.role === "owner" || actor.role === "manager";
  const mutate = !task.archivedAt && hasTaskMutationAccess(task, actor);
  return {
    edit: mutate,
    complete: mutate && task.status !== "completed",
    reopen: mutate && (task.status === "completed" || task.status === "cancelled"),
    cancel: mutate && task.status !== "cancelled",
    assignSelf: mutate,
    assignOthers: !task.archivedAt && full,
    archive: !task.archivedAt && full,
    viewAudit: !task.archivedAt || full,
  };
}

function shapeTask(row: any, actor: TaskActor) {
  return {
    id: row.id, title: row.title, description: row.description, status: row.status,
    priority: row.priority, dueDate: row.dueDate,
    assignee: row.assigneeUserId ? { id: row.assigneeUserId, name: row.assigneeName } : null,
    createdBy: { id: row.createdByUserId, name: row.createdByName },
    propertyId: row.propertyId, unitId: row.unitId, tenantId: row.tenantId,
    leaseId: row.leaseId, paymentId: row.paymentId, financialRecordId: row.financialRecordId,
    reconciliationMonth: row.reconciliationMonth, completedAt: row.completedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt, archivedAt: row.archivedAt,
    permissions: permissions(row, actor),
  };
}

async function selectTask(executor: any, actor: TaskActor, id: string, includeArchived = false) {
  const conditions = [eq(tasks.id, id), eq(tasks.orgId, actor.orgId)];
  if (!includeArchived) conditions.push(isNull(tasks.archivedAt));
  const [row] = await executor.select(taskSelect()).from(tasks)
    .leftJoin(assignee, eq(tasks.assigneeUserId, assignee.id))
    .innerJoin(creator, eq(tasks.createdByUserId, creator.id))
    .where(and(...conditions)).limit(1);
  if (!row) throw new TaskServiceError(404, "Task not found");
  return row;
}

function requireMutationAccess(task: any, actor: TaskActor) {
  if (hasTaskMutationAccess(task, actor)) return;
  throw new TaskServiceError(403, "Forbidden: Insufficient task permissions");
}

async function validateAssignee(executor: any, actor: TaskActor, assigneeUserId: string | null | undefined) {
  if (!assigneeUserId) return;
  const [membership] = await executor.select({ id: organizationMemberships.id })
    .from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(eq(organizationMemberships.orgId, actor.orgId), eq(organizationMemberships.userId, assigneeUserId),
      eq(organizationMemberships.status, "active"), isNull(organizationMemberships.archivedAt), isNull(users.archivedAt))).limit(1);
  if (!membership) throw new TaskServiceError(404, "Assignee not found");
  if ((actor.role === "accountant" || actor.role === "maintenance") && assigneeUserId !== actor.id) {
    throw new TaskServiceError(403, "Only owners and managers may assign another user");
  }
}

async function sameOrgRow(executor: any, table: any, idColumn: any, orgColumn: any, orgId: string, id?: string | null) {
  if (!id) return null;
  const [row] = await executor.select().from(table).where(and(eq(idColumn, id), eq(orgColumn, orgId))).limit(1);
  if (!row) throw new TaskServiceError(404, "Related resource not found");
  return row;
}

async function validateRelations(executor: any, actor: TaskActor, input: any, existing?: any) {
  const value = (key: string) => input[key] !== undefined ? input[key] : existing?.[key] ?? null;
  const property = await sameOrgRow(executor, properties, properties.id, properties.orgId, actor.orgId, value("propertyId"));
  const unit = await sameOrgRow(executor, units, units.id, units.orgId, actor.orgId, value("unitId"));
  const tenant = await sameOrgRow(executor, tenants, tenants.id, tenants.orgId, actor.orgId, value("tenantId"));
  const lease = await sameOrgRow(executor, leases, leases.id, leases.orgId, actor.orgId, value("leaseId"));
  const payment = await sameOrgRow(executor, payments, payments.id, payments.orgId, actor.orgId, value("paymentId"));
  const financial = await sameOrgRow(executor, financialRecords, financialRecords.id, financialRecords.orgId, actor.orgId, value("financialRecordId"));
  if (unit && property && unit.propertyId !== property.id) throw new TaskServiceError(409, "Unit does not belong to property");
  if (lease && unit && lease.unitId !== unit.id) throw new TaskServiceError(409, "Lease does not belong to unit");
  if (lease && tenant && lease.primaryTenantId !== tenant.id) throw new TaskServiceError(409, "Lease does not belong to tenant");
  if (lease && property) {
    const leaseUnit = await sameOrgRow(executor, units, units.id, units.orgId, actor.orgId, lease.unitId);
    if (leaseUnit.propertyId !== property.id) throw new TaskServiceError(409, "Lease does not belong to property");
  }
  if (payment) {
    if (lease && payment.leaseId !== lease.id) throw new TaskServiceError(409, "Payment does not belong to lease");
    if (tenant && payment.tenantId !== tenant.id) throw new TaskServiceError(409, "Payment does not belong to tenant");
    if (unit && payment.unitId !== unit.id) throw new TaskServiceError(409, "Payment does not belong to unit");
    if (property && payment.propertyId !== property.id) throw new TaskServiceError(409, "Payment does not belong to property");
  }
  if (financial) {
    if (property && financial.propertyId !== property.id) throw new TaskServiceError(409, "Financial record does not belong to property");
    if (unit && financial.unitId && financial.unitId !== unit.id) throw new TaskServiceError(409, "Financial record does not belong to unit");
  }
  if (value("reconciliationMonth") && !value("propertyId")) throw new TaskServiceError(409, "Reconciliation month requires property");
}

export async function listTasks(actor: TaskActor, filters: TaskFilters) {
  const conditions: any[] = [eq(tasks.orgId, actor.orgId), filters.archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt)];
  if (filters.archived && actor.role !== "owner" && actor.role !== "manager") throw new TaskServiceError(404, "Tasks not found");
  if (filters.statuses?.length) conditions.push(inArray(tasks.status, filters.statuses));
  if (filters.priorities?.length) conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.assigneeId) conditions.push(eq(tasks.assigneeUserId, filters.assigneeId));
  if (filters.assigneeMe) conditions.push(eq(tasks.assigneeUserId, actor.id));
  if (filters.unassigned) conditions.push(isNull(tasks.assigneeUserId));
  if (filters.propertyId) conditions.push(eq(tasks.propertyId, filters.propertyId));
  if (filters.due === "none") conditions.push(isNull(tasks.dueDate));
  const today = sql`CURRENT_DATE`;
  if (filters.due === "overdue") conditions.push(lt(tasks.dueDate, today));
  if (filters.due === "today") conditions.push(eq(tasks.dueDate, today));
  if (filters.due === "next_7_days") conditions.push(and(gte(tasks.dueDate, today), lte(tasks.dueDate, sql`CURRENT_DATE + 7`))!);
  if (filters.dueFrom) conditions.push(gte(tasks.dueDate, calendarDateSql(filters.dueFrom)));
  if (filters.dueTo) conditions.push(lte(tasks.dueDate, calendarDateSql(filters.dueTo)));

  const direction = filters.direction === "asc" ? asc : desc;
  const priorityOrder = sql`case ${tasks.priority} when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end`;
  const primaryOrder = filters.sort === "priority" ? direction(priorityOrder)
    : filters.sort === "newest" ? direction(tasks.createdAt)
    : filters.sort === "due_date" ? sql`${tasks.dueDate} ${sql.raw(filters.direction)} nulls last`
    : direction(tasks.updatedAt);
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(tasks).where(where);
  const rows = await db.select(taskSelect()).from(tasks)
    .leftJoin(assignee, eq(tasks.assigneeUserId, assignee.id)).innerJoin(creator, eq(tasks.createdByUserId, creator.id))
    .where(where).orderBy(primaryOrder, asc(tasks.id)).limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize);
  return { items: rows.map((row) => shapeTask(row, actor)), pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) }, appliedSort: { field: filters.sort, direction: filters.direction } };
}

export async function getTask(actor: TaskActor, id: string) {
  const row = await selectTask(db, actor, id, true);
  if (row.archivedAt && actor.role !== "owner" && actor.role !== "manager") throw new TaskServiceError(404, "Task not found");
  return shapeTask(row, actor);
}

function valuesFromInput(input: any, actor: TaskActor) {
  const assigneeUserId = input.assigneeUserId ?? null;
  return {
    title: input.title?.trim(), description: input.description?.trim() || null,
    dueDate: input.dueDate ? calendarDateSql(input.dueDate) : null,
    assigneeUserId, ownerId: assigneeUserId || actor.id,
    status: input.status, priority: input.priority,
    propertyId: input.propertyId ?? null, unitId: input.unitId ?? null,
    tenantId: input.tenantId ?? null, leaseId: input.leaseId ?? null,
    paymentId: input.paymentId ?? null, financialRecordId: input.financialRecordId ?? null,
    reconciliationMonth: input.reconciliationMonth ?? null,
  };
}

export async function createTask(actor: TaskActor, input: TaskCreateInput) {
  if (actor.role === "read_only") throw new TaskServiceError(403, "Forbidden");
  return db.transaction(async (tx) => {
    await validateAssignee(tx, actor, input.assigneeUserId);
    await validateRelations(tx, actor, input);
    const [task] = await tx.insert(tasks).values({ ...valuesFromInput(input, actor), orgId: actor.orgId, createdByUserId: actor.id, type: "general" }).returning();
    await writeTaskAudit(tx, { orgId: actor.orgId, actorUserId: actor.id, taskId: task.id, action: "create", previousState: null, newState: task });
    const row = await selectTask(tx, actor, task.id);
    return shapeTask(row, actor);
  });
}

export async function updateTask(actor: TaskActor, id: string, input: TaskPatchInput) {
  return db.transaction(async (tx) => {
    const existing = await selectTask(tx, actor, id);
    requireMutationAccess(existing, actor);
    if (input.status !== undefined && (existing.status === "completed" || existing.status === "cancelled")) {
      throw new TaskServiceError(400, "Use the reopen endpoint to return a completed or cancelled task to an active status");
    }
    if (input.assigneeUserId !== undefined) await validateAssignee(tx, actor, input.assigneeUserId);
    await validateRelations(tx, actor, input, existing);
    const fields: any = { updatedAt: new Date() };
    for (const key of ["title", "description", "status", "priority", "propertyId", "unitId", "tenantId", "leaseId", "paymentId", "financialRecordId", "reconciliationMonth"] as const) {
      if (input[key] !== undefined) fields[key] = key === "title" ? input[key]?.trim() : input[key];
    }
    if (input.dueDate !== undefined) fields.dueDate = input.dueDate ? calendarDateSql(input.dueDate) : null;
    if (input.assigneeUserId !== undefined) { fields.assigneeUserId = input.assigneeUserId; fields.ownerId = input.assigneeUserId || existing.createdByUserId; }
    const changed = Object.keys(input).some((key) => {
      const normalized = key === "title" ? input.title?.trim()
        : key === "description" ? input.description?.trim() || null
        : (input as any)[key];
      return String((existing as any)[key] ?? "") !== String(normalized ?? "");
    });
    const unchanged = !changed;
    if (unchanged) return shapeTask(existing, actor);
    const [updated] = await tx.update(tasks).set(fields).where(and(eq(tasks.id, id), eq(tasks.orgId, actor.orgId), isNull(tasks.archivedAt))).returning();
    await writeTaskAudit(tx, { orgId: actor.orgId, actorUserId: actor.id, taskId: id, action: "update", previousState: existing, newState: updated });
    return shapeTask(await selectTask(tx, actor, id), actor);
  });
}

async function transitionTask(actor: TaskActor, id: string, action: TaskAuditAction, status: TaskStatus) {
  return db.transaction(async (tx) => {
    const existing = await selectTask(tx, actor, id);
    requireMutationAccess(existing, actor);
    if (existing.status === status) return { task: shapeTask(existing, actor), changed: false };
    const completedAt = status === "completed" ? new Date() : null;
    const [updated] = await tx.update(tasks).set({ status, completedAt, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.orgId, actor.orgId), isNull(tasks.archivedAt))).returning();
    await writeTaskAudit(tx, { orgId: actor.orgId, actorUserId: actor.id, taskId: id, action, previousState: existing, newState: updated });
    return { task: shapeTask(await selectTask(tx, actor, id), actor), changed: true };
  });
}

export const completeTask = (actor: TaskActor, id: string) => transitionTask(actor, id, "complete", "completed");
export const cancelTask = (actor: TaskActor, id: string) => transitionTask(actor, id, "cancel", "cancelled");
export const reopenTask = (actor: TaskActor, id: string, status: typeof activeStatuses[number]) => transitionTask(actor, id, "reopen", status);

export async function archiveTask(actor: TaskActor, id: string) {
  if (actor.role !== "owner" && actor.role !== "manager") throw new TaskServiceError(403, "Forbidden");
  return db.transaction(async (tx) => {
    const existing = await selectTask(tx, actor, id, true);
    if (existing.archivedAt) return { task: shapeTask(existing, actor), changed: false };
    const now = new Date();
    const [updated] = await tx.update(tasks).set({ archivedAt: now, updatedAt: now }).where(and(eq(tasks.id, id), eq(tasks.orgId, actor.orgId))).returning();
    await writeTaskAudit(tx, { orgId: actor.orgId, actorUserId: actor.id, taskId: id, action: "archive", previousState: existing, newState: updated });
    return { task: shapeTask(await selectTask(tx, actor, id, true), actor), changed: true };
  });
}

export async function listTaskAudit(actor: TaskActor, id: string, page: number, pageSize: number) {
  await getTask(actor, id);
  const where = and(eq(auditLogs.orgId, actor.orgId), eq(auditLogs.entityType, "task"), eq(auditLogs.entityId, id));
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where);
  const items = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getTaskSummary(actor: TaskActor) {
  const result = await listTasks(actor, { assigneeMe: true, sort: "due_date", direction: "asc", page: 1, pageSize: 5 });
  const base = and(eq(tasks.orgId, actor.orgId), isNull(tasks.archivedAt), inArray(tasks.status, [...activeStatuses]));
  const [counts] = await db.select({
    overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < current_date)::int`,
    dueToday: sql<number>`count(*) filter (where ${tasks.dueDate} = current_date)::int`,
    assignedToMe: sql<number>`count(*) filter (where ${tasks.assigneeUserId} = ${actor.id})::int`,
    waiting: sql<number>`count(*) filter (where ${tasks.status} = 'waiting')::int`,
  }).from(tasks).where(base);
  return { ...counts, items: result.items };
}

export async function listAssignees(actor: TaskActor, q: string | undefined, page: number, pageSize: number) {
  if (actor.role === "read_only") throw new TaskServiceError(403, "Forbidden");
  const conditions: any[] = [eq(organizationMemberships.orgId, actor.orgId), eq(organizationMemberships.status, "active"), isNull(organizationMemberships.archivedAt), isNull(users.archivedAt)];
  if (actor.role === "accountant" || actor.role === "maintenance") conditions.push(eq(users.id, actor.id));
  if (q) conditions.push(or(sql`${users.name} ilike ${`${q}%`}`, sql`${users.email} ilike ${`${q}%`}`)!);
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(where);
  const items = await db.select({ id: users.id, name: users.name, role: organizationMemberships.role }).from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId)).where(where).orderBy(asc(users.name)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
