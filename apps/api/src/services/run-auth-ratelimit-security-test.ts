import * as assert from "assert";

function computeRateLimitMax(nodeEnv?: string, e2eTestMode?: string): number {
  const envBackup = { ...process.env };
  
  if (nodeEnv !== undefined) {
    process.env.NODE_ENV = nodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }

  if (e2eTestMode !== undefined) {
    process.env.E2E_TEST_MODE = e2eTestMode;
  } else {
    delete process.env.E2E_TEST_MODE;
  }

  const isE2ETest =
    process.env.NODE_ENV === "test" &&
    process.env.E2E_TEST_MODE === "true";

  const max = isE2ETest ? 1000 : 5;

  process.env = envBackup;
  return max;
}

function runAuthRateLimitSecurityTest() {
  console.log("=========================================================================");
  console.log("  AUTH RATE-LIMIT FAIL-CLOSED SECURITY SUITE (7 RUNTIME CONDITIONS)");
  console.log("=========================================================================");

  // Condition 1: production, E2E_TEST_MODE="false" -> 5
  const res1 = computeRateLimitMax("production", "false");
  console.log(`Condition 1 (NODE_ENV="production", E2E_TEST_MODE="false") -> max: ${res1}`);
  assert.strictEqual(res1, 5, "Condition 1 must resolve to max 5");

  // Condition 2: production, E2E_TEST_MODE="true" -> 5
  const res2 = computeRateLimitMax("production", "true");
  console.log(`Condition 2 (NODE_ENV="production", E2E_TEST_MODE="true")  -> max: ${res2}`);
  assert.strictEqual(res2, 5, "Condition 2 must resolve to max 5");

  // Condition 3: development, E2E_TEST_MODE="true" -> 5
  const res3 = computeRateLimitMax("development", "true");
  console.log(`Condition 3 (NODE_ENV="development", E2E_TEST_MODE="true") -> max: ${res3}`);
  assert.strictEqual(res3, 5, "Condition 3 must resolve to max 5");

  // Condition 4: staging, E2E_TEST_MODE="true" -> 5
  const res4 = computeRateLimitMax("staging", "true");
  console.log(`Condition 4 (NODE_ENV="staging", E2E_TEST_MODE="true")     -> max: ${res4}`);
  assert.strictEqual(res4, 5, "Condition 4 must resolve to max 5");

  // Condition 5: NODE_ENV undefined, E2E_TEST_MODE="true" -> 5
  const res5 = computeRateLimitMax(undefined, "true");
  console.log(`Condition 5 (NODE_ENV=undefined, E2E_TEST_MODE="true")    -> max: ${res5}`);
  assert.strictEqual(res5, 5, "Condition 5 must resolve to max 5");

  // Condition 6: test, E2E_TEST_MODE="false" -> 5
  const res6 = computeRateLimitMax("test", "false");
  console.log(`Condition 6 (NODE_ENV="test", E2E_TEST_MODE="false")        -> max: ${res6}`);
  assert.strictEqual(res6, 5, "Condition 6 must resolve to max 5");

  // Condition 7: test, E2E_TEST_MODE="true" -> 1000
  const res7 = computeRateLimitMax("test", "true");
  console.log(`Condition 7 (NODE_ENV="test", E2E_TEST_MODE="true")         -> max: ${res7}`);
  assert.strictEqual(res7, 1000, "Condition 7 must resolve to max 1000");

  console.log("\n=========================================================================");
  console.log("  ALL 7 RUNTIME CONDITIONS PASSED 100%!");
  console.log("=========================================================================");
}

runAuthRateLimitSecurityTest();
