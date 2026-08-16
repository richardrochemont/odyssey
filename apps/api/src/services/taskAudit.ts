import { auditLogs } from "@odyssey/db";

export type TaskAuditAction = "create" | "update" | "complete" | "reopen" | "cancel" | "archive";

export interface TaskAuditInput {
  orgId: string;
  actorUserId: string;
  taskId: string;
  action: TaskAuditAction;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
}

/** Writes a required task audit record inside the caller's transaction. */
export async function writeTaskAudit(tx: any, input: TaskAuditInput): Promise<void> {
  await tx.insert(auditLogs).values({
    orgId: input.orgId,
    userId: input.actorUserId,
    entityType: "task",
    entityId: input.taskId,
    action: input.action,
    previousState: input.previousState,
    newState: input.newState,
  });
}
