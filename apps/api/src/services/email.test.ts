import * as assert from "node:assert";
import { NoopEmailProvider } from "./email/noopProvider";
import { ResendEmailProvider } from "./email/resendProvider";
import { getTransactionalEmailProvider, validateEmailConfig } from "./email";
import { buildWorkspaceInvitationEmail } from "./email/templates/workspaceInvitation";

export async function runEmailTests() {
  console.log("Running Transactional Email Abstraction unit tests...");

  const testPayload = {
    to: "invitee@example.com",
    inviterName: "Alice Landlord",
    workspaceName: "Harborview Properties",
    role: "manager",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitationUrl: "https://odyssey.investments/invite#token=secret123token",
  };

  // 1. NoopEmailProvider test
  const noop = new NoopEmailProvider();
  const noopResult = await noop.sendWorkspaceInvitation(testPayload);

  assert.strictEqual(noopResult.deliveryStatus, "skipped");
  assert.strictEqual(noopResult.providerMessageId, undefined);
  assert.strictEqual(noopResult.errorCode, undefined);

  // 2a. ResendEmailProvider with EMAIL_ENABLED=false test
  const oldEnv = { ...process.env };
  try {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_ENABLED = "false";
    delete process.env.RESEND_API_KEY; // Verify key is not required when disabled

    const provider = getTransactionalEmailProvider();
    assert.ok(provider instanceof NoopEmailProvider, "Should return NoopEmailProvider when EMAIL_ENABLED is false");

    const disabledResult = await provider.sendWorkspaceInvitation(testPayload);
    assert.strictEqual(disabledResult.deliveryStatus, "skipped");
    assert.strictEqual(disabledResult.providerMessageId, undefined);
    assert.strictEqual(disabledResult.errorCode, undefined);
  } finally {
    process.env = oldEnv;
  }

  // 2b. Startup validation failure test when EMAIL_ENABLED=true but required variables are missing
  try {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_ENABLED = "true";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    assert.throws(
      () => validateEmailConfig(),
      /FATAL EMAIL CONFIGURATION/,
      "validateEmailConfig must throw when required Resend variables are missing"
    );
  } finally {
    process.env = oldEnv;
  }

  // 2c. getTransactionalEmailProvider returns ResendEmailProvider when EMAIL_PROVIDER=resend and EMAIL_ENABLED=true
  try {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_ENABLED = "true";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "invitations@odyssey.investments";

    validateEmailConfig(); // Should not throw when valid
    const provider = getTransactionalEmailProvider();
    assert.ok(provider instanceof ResendEmailProvider, "Should instantiate ResendEmailProvider when EMAIL_ENABLED=true");
  } finally {
    process.env = oldEnv;
  }

  // 3. Email Template Safety & Rendering test
  const template = buildWorkspaceInvitationEmail(testPayload);
  assert.ok(template.subject.includes("Harborview Properties"), "Subject must contain workspace name");
  assert.ok(template.html.includes("Alice Landlord"), "HTML must contain inviter name");
  assert.ok(template.html.includes("Join Workspace"), "HTML must contain Join CTA button");
  assert.ok(template.html.includes("https://odyssey.investments/invite#token=secret123token"), "HTML must contain secure link");
  assert.ok(!template.html.toLowerCase().includes("tenant"), "Template must not contain tenant content");
  assert.ok(!template.html.toLowerCase().includes("payment"), "Template must not contain payment content");

  // 4. Provider failure error normalization (no raw error leakage)
  try {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_ENABLED = "true";
    process.env.RESEND_API_KEY = "invalid_key";
    process.env.EMAIL_FROM = "test@example.com";

    const provider = new ResendEmailProvider();
    // Override fetch to simulate HTTP 401 Unauthorized rejection
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: "API key invalid", sensitive_token: "secret_123" }),
      } as any;
    }) as any;

    try {
      const failResult = await provider.sendWorkspaceInvitation(testPayload);
      assert.strictEqual(failResult.deliveryStatus, "failed");
      assert.strictEqual(failResult.errorCode, "ERR_PROVIDER_REJECTED");
      assert.strictEqual((failResult as any).message, undefined, "Raw error message must be omitted");
      assert.strictEqual((failResult as any).sensitive_token, undefined, "Sensitive token must never leak");
    } finally {
      global.fetch = originalFetch;
    }
  } finally {
    process.env = oldEnv;
  }

  console.log("Transactional Email Abstraction unit tests passed!");
}

if (require.main === module) {
  runEmailTests().catch((err) => {
    console.error("Email test failure:", err);
    process.exit(1);
  });
}
