export type TaskStatus = "inbox" | "planned" | "in_progress" | "waiting" | "completed" | "cancelled";
export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface TaskPermissions {
  edit: boolean; complete: boolean; reopen: boolean; cancel: boolean;
  assignSelf: boolean; assignOthers: boolean; archive: boolean; viewAudit: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignee: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  propertyId: string | null;
  unitId: string | null;
  tenantId: string | null;
  leaseId: string | null;
  paymentId: string | null;
  financialRecordId: string | null;
  reconciliationMonth: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  permissions: TaskPermissions;
}
