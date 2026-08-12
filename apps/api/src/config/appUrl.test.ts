import * as assert from "node:assert";
import { validateAppUrl, getInvitationUrl } from "./appUrl";

export async function runAppUrlTests() {
  console.log("Running APP_URL validation & link generation unit tests...");

  // 1. Development mode allows http://localhost:3000 default when missing
  const devDefault = validateAppUrl(undefined, "development");
  assert.strictEqual(devDefault, "http://localhost:3000");

  // 2. Development mode allows custom local origin
  const devCustom = validateAppUrl("http://localhost:3000/", "development");
  assert.strictEqual(devCustom, "http://localhost:3000");

  // 3. Production mode accepts valid HTTPS domain
  const prodValid = validateAppUrl("https://odyssey.investments", "production");
  assert.strictEqual(prodValid, "https://odyssey.investments");

  // 4. Production mode rejects missing APP_URL
  assert.throws(() => {
    validateAppUrl(undefined, "production");
  }, /required in production/);

  // 5. Production mode rejects HTTP protocol
  assert.throws(() => {
    validateAppUrl("http://odyssey.investments", "production");
  }, /must use HTTPS in production/);

  // 6. Production mode rejects localhost
  assert.throws(() => {
    validateAppUrl("https://localhost:3000", "production");
  }, /cannot use localhost/);

  // 7. Production mode rejects 127.0.0.1
  assert.throws(() => {
    validateAppUrl("https://127.0.0.1:3000", "production");
  }, /cannot use localhost/);

  // 8. Production mode rejects malformed URL string
  assert.throws(() => {
    validateAppUrl("not-a-url", "production");
  }, /must be a valid absolute URL/);

  // 9. Invitation link format is canonical fragment transport
  const oldAppUrl = process.env.APP_URL;
  const oldNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";
    process.env.APP_URL = "https://odyssey.investments";

    const testToken = "a1b2c3d4e5f678901234567890abcdef";
    const generatedUrl = getInvitationUrl(testToken);

    assert.strictEqual(
      generatedUrl,
      `https://odyssey.investments/invite#token=${testToken}`
    );
    assert.ok(!generatedUrl.includes("localhost"), "Production link must never contain localhost");
    assert.ok(generatedUrl.startsWith("https://"), "Production link must start with https://");
  } finally {
    process.env.APP_URL = oldAppUrl;
    process.env.NODE_ENV = oldNodeEnv;
  }

  console.log("APP_URL validation & link generation unit tests passed!");
}

if (require.main === module) {
  runAppUrlTests().catch((err) => {
    console.error("APP_URL test failure:", err);
    process.exit(1);
  });
}
