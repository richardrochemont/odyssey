import assert from "node:assert/strict";
import { db, pool, organizations, users, organizationMemberships, properties, units, tenants, tasks } from "@odyssey/db";
import { eq, sql } from "drizzle-orm";
import { createLease, updateLease } from "./leases";
import { archiveTask, cancelTask, completeTask, createTask, listTaskAudit, listTasks, reopenTask, TaskServiceError, updateTask } from "./tasks";
import { writeTaskAudit } from "./taskAudit";

async function countTasks(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks);
  return row.count;
}

async function main() {
  const [org] = await db.insert(organizations).values({ name: "Task Test Org", slug: `task-test-${Date.now()}` }).returning();
  const [otherOrg] = await db.insert(organizations).values({ name: "Other Org", slug: `other-test-${Date.now()}` }).returning();
  const [owner] = await db.insert(users).values({ orgId: org.id, email: `owner-${Date.now()}@example.test`, passwordHash: "hash", name: "Task Owner", role: "owner" }).returning();
  await db.insert(organizationMemberships).values({ orgId: org.id, userId: owner.id, role: "owner", status: "active" });
  const [property] = await db.insert(properties).values({ orgId: org.id, nickname: "Task Property", address: "1 Test St", propertyType: "single_family", acquisitionDate: new Date("2020-01-01") }).returning();
  const [otherProperty] = await db.insert(properties).values({ orgId: otherOrg.id, nickname: "Other Property", address: "2 Test St", propertyType: "single_family", acquisitionDate: new Date("2020-01-01") }).returning();
  const [unit] = await db.insert(units).values({ orgId: org.id, propertyId: property.id, unitNumber: "1", monthlyRent: 100000 }).returning();
  const [tenant] = await db.insert(tenants).values({ orgId: org.id, name: "Test Tenant" }).returning();
  const actor = { id: owner.id, orgId: org.id, role: "owner" as const };

  const task = await createTask(actor, { title: "Atomic task", status: "inbox", priority: "normal", dueDate: "2026-12-31", propertyId: property.id });
  assert.equal(task.dueDate, "2026-12-31");
  const stored = await db.select({ time: sql<string>`to_char(${tasks.dueDate}, 'HH24:MI:SS')` }).from(tasks).where(eq(tasks.id, task.id));
  assert.equal(stored[0].time, "00:00:00");
  console.log("PASS Task Center stored YYYY-MM-DD at database 00:00:00 and returned the same literal date");

  await assert.rejects(() => createTask(actor, { title: "Cross org", status: "inbox", priority: "normal", propertyId: otherProperty.id }), (error: unknown) => error instanceof TaskServiceError && error.statusCode === 404);
  console.log("PASS cross-organization relationship returned 404");

  const [accountant] = await db.insert(users).values({ orgId: org.id, email: `accountant-${Date.now()}@example.test`, passwordHash: "hash", name: "Task Accountant", role: "accountant" }).returning();
  await db.insert(organizationMemberships).values({ orgId: org.id, userId: accountant.id, role: "accountant", status: "active" });
  const accountantActor = { id: accountant.id, orgId: org.id, role: "accountant" as const };
  const ownTask = await createTask(accountantActor, { title: "Accountant task", status: "planned", priority: "urgent", assigneeUserId: accountant.id });
  await updateTask(accountantActor, ownTask.id, { status: "in_progress" });
  await assert.rejects(() => updateTask(accountantActor, task.id, { title: "Forbidden" }), (error: unknown) => error instanceof TaskServiceError && error.statusCode === 403);
  await assert.rejects(() => createTask(accountantActor, { title: "Bad assignment", assigneeUserId: owner.id, status: "inbox", priority: "normal" }), (error: unknown) => error instanceof TaskServiceError && error.statusCode === 403);
  console.log("PASS accountant self-created/assigned permissions and other-user assignment denial");

  const filtered = await listTasks(actor, { statuses: ["in_progress"], priorities: ["urgent"], sort: "priority", direction: "asc", page: 1, pageSize: 1 });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].id, ownTask.id);
  assert.ok(filtered.pagination.total >= 1);
  console.log("PASS combined filters, semantic priority sort, and pagination envelope");

  await completeTask(actor, task.id);
  await reopenTask(actor, task.id, "waiting");
  await cancelTask(actor, task.id);
  const audit = await listTaskAudit(actor, task.id, 1, 20);
  assert.deepEqual(audit.items.slice(0, 3).map((item) => item.action), ["cancel", "reopen", "complete"]);
  await archiveTask(actor, task.id);
  console.log("PASS complete/reopen/cancel/archive lifecycle and action-specific audit history");

  const beforeTitle = task.title;
  await assert.rejects(() => db.transaction(async (tx) => {
    await tx.update(tasks).set({ title: "Should roll back" }).where(eq(tasks.id, task.id));
    await writeTaskAudit(tx, { orgId: org.id, actorUserId: "ffffffff-ffff-ffff-ffff-ffffffffffff", taskId: task.id, action: "update", previousState: {}, newState: {} });
  }));
  const [afterRollback] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, task.id));
  assert.equal(afterRollback.title, beforeTitle);
  console.log("PASS audit FK failure rolled back the task mutation atomically");

  const beforeLease = await countTasks();
  const lease = await createLease(org.id, owner.id, { unitId: unit.id, primaryTenantId: tenant.id, startDate: "2026-01-01", endDate: "2026-09-01", monthlyRent: 1000, securityDeposit: 1000, status: "active", renewalOption: false });
  await updateLease(org.id, owner.id, lease.id, { endDate: "2026-08-20" });
  const afterLease = await countTasks();
  assert.equal(afterLease, beforeLease);
  console.log("PASS lease create and update inserted zero tasks");
}

main().finally(() => pool.end()).catch((error) => { console.error(error); process.exitCode = 1; });
