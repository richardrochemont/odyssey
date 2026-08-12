import {
  TransactionalEmailProvider,
  WorkspaceInvitationPayload,
  TenantPortalInvitationPayload,
  PasswordResetPayload,
  PaymentReceiptPayload,
  PaymentReminderPayload,
  EmailSendResult,
} from "./types";

/**
 * NoopEmailProvider
 * Default provider for development, testing, and unconfigured production environments.
 * Strictly returns deliveryStatus: "skipped" without external network calls, fake message IDs,
 * or fake delivery claims.
 */
export class NoopEmailProvider implements TransactionalEmailProvider {
  async sendWorkspaceInvitation(_payload: WorkspaceInvitationPayload): Promise<EmailSendResult> {
    return { deliveryStatus: "skipped" };
  }

  async sendTenantPortalInvitation(_payload: TenantPortalInvitationPayload): Promise<EmailSendResult> {
    return { deliveryStatus: "skipped" };
  }

  async sendPasswordReset(_payload: PasswordResetPayload): Promise<EmailSendResult> {
    return { deliveryStatus: "skipped" };
  }

  async sendPaymentReceipt(_payload: PaymentReceiptPayload): Promise<EmailSendResult> {
    return { deliveryStatus: "skipped" };
  }

  async sendPaymentReminder(_payload: PaymentReminderPayload): Promise<EmailSendResult> {
    return { deliveryStatus: "skipped" };
  }
}
