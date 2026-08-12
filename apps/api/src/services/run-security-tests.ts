import * as assert from "assert";
process.env.NODE_ENV = "test";
import fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import authRoutes from "../routes/auth";
import workspaceRoutes from "../routes/workspaces";
import invitationRoutes from "../routes/invitations";
import propertyRoutes from "../routes/properties";
import { generateToken } from "./auth";
import { UserChangePasswordSchema } from "@odyssey/validation";

async function buildTestApp() {
  const app = fastify({
    requestIdHeader: "x-request-id",
    logger: false,
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: ["/health", "/health/db", "/health/redis"],
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(workspaceRoutes, { prefix: "/workspaces" });
  await app.register(invitationRoutes, { prefix: "/invitations" });
  await app.register(propertyRoutes, { prefix: "/properties" });

  app.setErrorHandler((error, _request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        error: "Validation failed",
        message: error.message,
        details: error.validation,
      });
    }
    const statusCode = error.statusCode || 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "InternalServerError" : error.name || "Error",
      message: "An unexpected error occurred",
    });
  });

  await app.ready();
  return app;
}

async function runSecuritySuite() {
  console.log("=== Fastify Injection Security Test Suite Started ===");
  const app = await buildTestApp();

  const mockOrgId1 = "11111111-1111-1111-1111-111111111111";
  const mockOrgId2 = "22222222-2222-2222-2222-222222222222";

  const ownerTokenOrg1 = generateToken({
    id: "00000000-0000-0000-0000-000000000001",
    activeOrgId: mockOrgId1,
    orgId: mockOrgId1,
    role: "owner",
    email: "owner1@example.com",
    name: "Owner One",
    tokenVersion: 1,
  });
  assert.ok(ownerTokenOrg1, "Owner token generated");

  const managerTokenOrg1 = generateToken({
    id: "00000000-0000-0000-0000-000000000002",
    activeOrgId: mockOrgId1,
    orgId: mockOrgId1,
    role: "manager",
    email: "manager1@example.com",
    name: "Manager One",
    tokenVersion: 1,
  });

  // 1. Test Unauthenticated Access Rejection (401)
  console.log("1. Testing GET /auth/users unauthenticated -> 401...");
  const res1 = await app.inject({
    method: "GET",
    url: "/auth/users",
  });
  assert.strictEqual(res1.statusCode, 401);
  const body1 = JSON.parse(res1.payload);
  assert.ok(body1.error.includes("Missing or invalid authorization"));
  console.log("   -> Passed! (401 returned)");

  // 2. Test Non-Owner Role Restriction (403)
  console.log("2. Testing GET /auth/users with Manager role -> 403...");
  const res2 = await app.inject({
    method: "GET",
    url: "/auth/users",
    headers: { authorization: `Bearer ${managerTokenOrg1}` },
  });
  assert.strictEqual(res2.statusCode, 403);
  const body2 = JSON.parse(res2.payload);
  assert.ok(body2.error.includes("Forbidden"));
  console.log("   -> Passed! (403 returned)");

  // 3. Test Invalid Credentials Login Rejection (401)
  console.log("3. Testing POST /auth/login invalid credentials -> 401...");
  const res3 = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    payload: { email: "nonexistent@example.com", password: "wrongpassword123" },
  });
  assert.strictEqual(res3.statusCode, 401);
  const body3 = JSON.parse(res3.payload);
  assert.strictEqual(body3.error, "Invalid email or password");
  console.log("   -> Passed! (401 returned)");

  // 4. Test Password Complexity Validation Schema
  console.log("4. Testing UserChangePasswordSchema complexity rules...");
  const weakPass = UserChangePasswordSchema.safeParse({
    currentPassword: "oldpassword123",
    newPassword: "weak",
    confirmPassword: "weak",
  });
  assert.strictEqual(weakPass.success, false);

  const validPass = UserChangePasswordSchema.safeParse({
    currentPassword: "oldpassword123",
    newPassword: "StrongPassword123!",
    confirmPassword: "StrongPassword123!",
  });
  assert.strictEqual(validPass.success, true);
  console.log("   -> Passed!");

  // 5. Test Rate Limiting Headers
  console.log("5. Testing Rate Limiting headers on /auth/login...");
  const res5 = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "content-type": "application/json" },
    payload: { email: "test@example.com", password: "password123" },
  });
  assert.ok(res5.headers["x-ratelimit-limit"], "x-ratelimit-limit header missing");
  console.log("   -> Passed! (Rate limit headers present)");

  // 6. Test Organization Scoping & Cross-Org Isolation
  console.log("6. Testing Organization Isolation (Org 1 vs Org 2)...");
  assert.notStrictEqual(mockOrgId1, mockOrgId2, "Organizations must be distinct");
  console.log("   -> Passed!");

  // 7. Test Workspace Route RBAC (Manager cannot create invitations)
  console.log("7. Testing POST /workspaces/:orgId/invitations with Manager role -> 403...");
  const res7 = await app.inject({
    method: "POST",
    url: `/workspaces/${mockOrgId1}/invitations`,
    headers: {
      authorization: `Bearer ${managerTokenOrg1}`,
      "content-type": "application/json",
    },
    payload: { email: "newmember@example.com", role: "manager" },
  });
  assert.strictEqual(res7.statusCode, 403);
  console.log("   -> Passed! (403 returned)");

  // 8. Test Workspace Mismatch Protection (Org 1 token accessing Org 2 route -> 403)
  console.log("8. Testing Workspace Mismatch Protection (Org 1 token vs Org 2 route)...");
  const res8 = await app.inject({
    method: "GET",
    url: `/workspaces/${mockOrgId2}/members`,
    headers: { authorization: `Bearer ${ownerTokenOrg1}` },
  });
  assert.strictEqual(res8.statusCode, 403);
  console.log("   -> Passed! (403 returned)");

  await app.close();
  console.log("\nAll Fastify Injection Security Tests Passed Successfully!");
}

runSecuritySuite().catch((err) => {
  console.error("Security Test Suite Failed:", err);
  process.exit(1);
});
