export type DeliveryStatus =
  | "not_sent"
  | "skipped"
  | "accepted"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed";

export interface EmailSendResult {
  deliveryStatus: DeliveryStatus;
  providerMessageId?: string;
  sentAt?: Date;
  errorCode?: string; // Omitted when no error exists
}

export interface WorkspaceInvitationPayload {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  expiresAt: Date;
  invitationUrl: string;
}

export interface TenantPortalInvitationPayload {
  to: string;
  tenantName: string;
  propertyAddress: string;
  portalUrl: string;
}

export interface PasswordResetPayload {
  to: string;
  userName: string;
  resetUrl: string;
}

export interface PaymentReceiptPayload {
  to: string;
  tenantName: string;
  amountFormatted: string;
  paymentDate: string;
  receiptNumber: string;
}

export interface PaymentReminderPayload {
  to: string;
  tenantName: string;
  amountFormatted: string;
  dueDate: string;
}

export interface TransactionalEmailProvider {
  sendWorkspaceInvitation(payload: WorkspaceInvitationPayload): Promise<EmailSendResult>;
  sendTenantPortalInvitation(payload: TenantPortalInvitationPayload): Promise<EmailSendResult>;
  sendPasswordReset(payload: PasswordResetPayload): Promise<EmailSendResult>;
  sendPaymentReceipt(payload: PaymentReceiptPayload): Promise<EmailSendResult>;
  sendPaymentReminder(payload: PaymentReminderPayload): Promise<EmailSendResult>;
}
