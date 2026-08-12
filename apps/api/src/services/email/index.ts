import { TransactionalEmailProvider } from "./types";
import { NoopEmailProvider } from "./noopProvider";
import { ResendEmailProvider } from "./resendProvider";

export * from "./types";
export * from "./noopProvider";
export * from "./resendProvider";
export * from "./templates/workspaceInvitation";

/**
 * Factory function to instantiate the configured TransactionalEmailProvider.
 * Defaults to NoopEmailProvider for development, tests, and unconfigured environments.
 */
export function getTransactionalEmailProvider(): TransactionalEmailProvider {
  const providerType = process.env.EMAIL_PROVIDER?.toLowerCase();

  if (providerType === "resend") {
    return new ResendEmailProvider();
  }

  return new NoopEmailProvider();
}
