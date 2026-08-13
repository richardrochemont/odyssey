import { TransactionalEmailProvider } from "./types";
import { NoopEmailProvider } from "./noopProvider";
import { ResendEmailProvider } from "./resendProvider";

export * from "./types";
export * from "./noopProvider";
export * from "./resendProvider";
export * from "./templates/workspaceInvitation";

/**
 * Validates that required environment variables are present if Resend email delivery is enabled.
 * Throws a fatal configuration error on startup if variables are missing.
 */
export function validateEmailConfig(): void {
  const providerType = process.env.EMAIL_PROVIDER?.toLowerCase();
  const isEnabled = process.env.EMAIL_ENABLED === "true";

  if (providerType === "resend" && isEnabled) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new Error(
        "FATAL EMAIL CONFIGURATION: EMAIL_PROVIDER=resend and EMAIL_ENABLED=true require RESEND_API_KEY and EMAIL_FROM environment variables."
      );
    }
  }
}

/**
 * Factory function to instantiate the configured TransactionalEmailProvider.
 * Returns ResendEmailProvider only when EMAIL_PROVIDER=resend AND EMAIL_ENABLED=true.
 * Defaults to NoopEmailProvider for development, tests, disabled email, and unconfigured environments.
 */
export function getTransactionalEmailProvider(): TransactionalEmailProvider {
  const providerType = process.env.EMAIL_PROVIDER?.toLowerCase();
  const isEnabled = process.env.EMAIL_ENABLED === "true";

  if (providerType === "resend" && isEnabled) {
    return new ResendEmailProvider();
  }

  return new NoopEmailProvider();
}

