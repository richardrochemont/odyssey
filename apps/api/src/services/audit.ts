import { db, auditLogs } from "@hearthlane/db";

export interface CreateAuditLogParams {
  orgId: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "archive" | "status_transition";
  previousState?: Record<string, any> | null;
  newState?: Record<string, any> | null;
}

export async function logAction(params: CreateAuditLogParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      orgId: params.orgId,
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      previousState: params.previousState || null,
      newState: params.newState || null,
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Audit logs shouldn't break the main business flow if they fail,
    // but in production we want this to be extremely reliable.
  }
}
