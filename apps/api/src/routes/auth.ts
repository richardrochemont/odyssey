import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { db, users, organizations } from "@hearthlane/db";
import { eq } from "drizzle-orm";
import { generateToken } from "../services/auth";
import { UserSignInSchema, UserSignUpSchema } from "@hearthlane/validation";
import { createHash } from "node:crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// Unauthenticated user-directory endpoint powering the "Local Developer Auth" picker on the login
// screen. Defaults to enabled to preserve current behavior (no real auth provider is wired up yet —
// see docs/railway-notes.md). Set ENABLE_DEV_AUTH_DIRECTORY=false once real tenant/financial data is
// in this environment: as-is, anyone can enumerate every user's name/email/role with no credentials.
const DEV_AUTH_DIRECTORY_ENABLED = process.env.ENABLE_DEV_AUTH_DIRECTORY !== "false";

if (DEV_AUTH_DIRECTORY_ENABLED && process.env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.warn(
    "[SECURITY WARNING] GET /auth/users is enabled in production — this endpoint lists every " +
    "user's name/email/role with no authentication. Set ENABLE_DEV_AUTH_DIRECTORY=false once this " +
    "environment holds real tenant/financial data."
  );
}

export default async function authRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

  // Endpoint to discover seeded users for dev selector
  fastify.get("/users", async (_request, reply) => {
    if (!DEV_AUTH_DIRECTORY_ENABLED) {
      return reply.code(404).send({ error: "Not found" });
    }

    const list = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    }).from(users);

    return list;
  });

  // Standard email/password login
  fastify.post("/login", async (request, reply) => {
    const parseResult = UserSignInSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { email, password } = parseResult.data;
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const inputHash = hashPassword(password);
    if (user.passwordHash !== inputHash) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = generateToken({
      id: user.id,
      orgId: user.orgId,
      role: user.role as any,
      email: user.email,
      name: user.name,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      },
    };
  });

  // Standard organization & user registration
  fastify.post("/register", async (request, reply) => {
    const parseResult = UserSignUpSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { name, email, password, orgName } = parseResult.data;

    // Check if user already exists
    const [existingUser] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return reply.code(409).send({ error: "A user with this email already exists" });
    }

    // Create organization
    const [org] = await db.insert(organizations).values({
      name: orgName,
    }).returning();

    // Create user (first user gets the 'owner' role)
    const passwordHash = hashPassword(password);
    const [newUser] = await db.insert(users).values({
      orgId: org.id,
      email,
      passwordHash,
      name,
      role: "owner",
    }).returning();

    const token = generateToken({
      id: newUser.id,
      orgId: org.id,
      role: "owner",
      email: newUser.email,
      name: newUser.name,
    });

    return reply.code(201).send({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: "owner",
        orgId: org.id,
      },
    });
  });
}
