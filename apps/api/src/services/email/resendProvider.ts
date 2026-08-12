import {
  TransactionalEmailProvider,
  WorkspaceInvitationPayload,
  TenantPortalInvitationPayload,
  PasswordResetPayload,
  PaymentReceiptPayload,
  PaymentReminderPayload,
  EmailSendResult,
} from "./types";
import { buildWorkspaceInvitationEmail } from "./templates/workspaceInvitation";

/**
 * ResendEmailProvider
 * Implementation for sending emails via Resend API when EMAIL_ENABLED=true.
 * If EMAIL_ENABLED is false/unset, it immediately skips sending without requiring credentials
 * or attempting HTTP network calls.
 */
export class ResendEmailProvider implements TransactionalEmailProvider {
  private isEnabled(): boolean {
    return process.env.EMAIL_ENABLED === "true";
  }

  private async sendEmail(to: string, subject: string, html: string, text: string): Promise<EmailSendResult> {
    if (!this.isEnabled()) {
      return { deliveryStatus: "skipped" };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    const replyTo = process.env.EMAIL_REPLY_TO;

    if (!apiKey || !from) {
      return {
        deliveryStatus: "failed",
        errorCode: "ERR_CONFIG_INVALID",
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: replyTo || undefined,
          subject,
          html,
          text,
        }),
      });

      if (!response.ok) {
        return {
          deliveryStatus: "failed",
          errorCode: "ERR_PROVIDER_REJECTED",
        };
      }

      const data = (await response.json()) as { id?: string };
      return {
        deliveryStatus: "accepted",
        providerMessageId: data.id || `resend-${Date.now()}`,
        sentAt: new Date(),
      };
    } catch (_err) {
      return {
        deliveryStatus: "failed",
        errorCode: "ERR_NETWORK_FAILURE",
      };
    }
  }

  async sendWorkspaceInvitation(payload: WorkspaceInvitationPayload): Promise<EmailSendResult> {
    if (!this.isEnabled()) {
      return { deliveryStatus: "skipped" };
    }
    const template = buildWorkspaceInvitationEmail(payload);
    return this.sendEmail(payload.to, template.subject, template.html, template.text);
  }

  async sendTenantPortalInvitation(_payload: TenantPortalInvitationPayload): Promise<EmailSendResult> {
    if (!this.isEnabled()) return { deliveryStatus: "skipped" };
    return { deliveryStatus: "failed", errorCode: "ERR_NOT_IMPLEMENTED" };
  }

  async sendPasswordReset(_payload: PasswordResetPayload): Promise<EmailSendResult> {
    if (!this.isEnabled()) return { deliveryStatus: "skipped" };
    return { deliveryStatus: "failed", errorCode: "ERR_NOT_IMPLEMENTED" };
  }

  async sendPaymentReceipt(_payload: PaymentReceiptPayload): Promise<EmailSendResult> {
    if (!this.isEnabled()) return { deliveryStatus: "skipped" };
    return { deliveryStatus: "failed", errorCode: "ERR_NOT_IMPLEMENTED" };
  }

  async sendPaymentReminder(_payload: PaymentReminderPayload): Promise<EmailSendResult> {
    if (!this.isEnabled()) return { deliveryStatus: "skipped" };
    return { deliveryStatus: "failed", errorCode: "ERR_NOT_IMPLEMENTED" };
  }
}
