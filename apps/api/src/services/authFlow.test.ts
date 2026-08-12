import * as assert from "node:assert";
import fastify from "fastify";
import cors from "@fastify/cors";
import authRoutes from "../routes/auth";
import workspaceRoutes from "../routes/workspaces";
import { generateToken, getJwtSecret } from "./auth";
import jwt from "jsonwebtoken";

export async function runAuthFlowTests() {
  console.log("Running Auth Flow & Session Expiration Unit/Integration Tests...");

  const testApp = fastify({ logger: false });
  await testApp.register(cors, { origin: true, credentials: true });
  await testApp.register(authRoutes, { prefix: "/auth" });
  await testApp.register(workspaceRoutes, { prefix: "/workspaces" });
  await testApp.ready();

  const mockOrgId = "11111111-1111-1111-1111-111111111111";
  const mockUserId = "00000000-0000-0000-0000-000000000001";

  // 1. Invalid JWT returns 401
  console.log("1. Testing invalid JWT signature -> 401...");
  const invalidToken = jwt.sign(
    { id: mockUserId, activeOrgId: mockOrgId, role: "owner", tokenVersion: 1 },
    "wrong-secret-key-signature"
  );
  const res1 = await testApp.inject({
    method: "GET",
    url: "/workspaces",
    headers: { authorization: `Bearer ${invalidToken}` },
  });
  assert.strictEqual(res1.statusCode, 401, "Invalid JWT must yield 401");
  const body1 = JSON.parse(res1.payload);
  assert.ok(body1.error.includes("Unauthorized"), "Must return 401 Unauthorized error");

  // 2. Expired JWT returns 401
  console.log("2. Testing expired JWT token -> 401...");
  const expiredToken = jwt.sign(
    { id: mockUserId, activeOrgId: mockOrgId, role: "owner", tokenVersion: 1 },
    getJwtSecret(),
    { expiresIn: "-1s" }
  );
  const res2 = await testApp.inject({
    method: "GET",
    url: "/workspaces",
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  assert.strictEqual(res2.statusCode, 401, "Expired token must yield 401");

  // 3. TokenVersion Mismatch returns 401
  console.log("3. Testing tokenVersion mismatch -> 401...");
  const mismatchedToken = generateToken({
    id: mockUserId,
    activeOrgId: mockOrgId,
    orgId: mockOrgId,
    role: "owner",
    email: "owner@example.com",
    name: "Owner",
    tokenVersion: 999, // Mismatched version
  });
  const res3 = await testApp.inject({
    method: "GET",
    url: "/workspaces",
    headers: { authorization: `Bearer ${mismatchedToken}` },
  });
  assert.strictEqual(res3.statusCode, 401, "Token version mismatch must yield 401");

  // 4. ActiveOrgId Mismatch / Cross-Workspace Access returns 403
  console.log("4. Testing activeOrgId route mismatch -> 403...");
  const validOwnerToken = generateToken({
    id: mockUserId,
    activeOrgId: mockOrgId,
    orgId: mockOrgId,
    role: "owner",
    email: "owner@example.com",
    name: "Owner",
    tokenVersion: 1,
  });
  const otherOrgId = "99999999-9999-9999-9999-999999999999";
  const res4 = await testApp.inject({
    method: "GET",
    url: `/workspaces/${otherOrgId}/members`,
    headers: { authorization: `Bearer ${validOwnerToken}` },
  });
  assert.strictEqual(res4.statusCode, 403, "Accessing another workspace route must yield 403");

  await testApp.close();
  console.log("Auth Flow & Session Expiration Unit/Integration Tests Passed!");
}

if (require.main === module) {
  runAuthFlowTests().catch((err) => {
    console.error("AuthFlow test failure:", err);
    process.exit(1);
  });
}
