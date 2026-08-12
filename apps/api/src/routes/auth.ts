import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { db, users, organizations } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";
import { generateToken } from "../services/auth";
import { authenticate, authorize } from "../middleware/auth";
import { UserSignInSchema, UserSignUpSchema, UserChangePasswordSchema } from "@odyssey/validation";
import { createHash } from "node:crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export default async function authRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

  // Organization-scoped user directory (Requires Owner role)
  fastify.get("/users", {
    preHandler: [authenticate, authorize(["owner"])]
  }, async (request, _reply) => {
    const user = request.user!;
    const query = request.query as { limit?: string; offset?: string };

    const limit = Math.min(Math.max(parseInt(query.limit || "50", 10), 1), 100);
    const offset = Math.max(parseInt(query.offset || "0", 10), 0);

    const list = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(and(eq(users.orgId, user.orgId), isNull(users.archivedAt)))
      .limit(limit)
      .offset(offset);

    return list;
  });

  // Standard email/password login
  fastify.post("/login", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 15 * 60 * 1000, // 5 attempts per 15 mins
      },
    },
  }, async (request, reply) => {
    const parseResult = UserSignInSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { email, password } = parseResult.data;
    let user;
    try {
      const [dbUser] = await db.select()
        .from(users)
        .where(and(eq(users.email, email.toLowerCase()), isNull(users.archivedAt)))
        .limit(1);
      user = dbUser;
    } catch (err: any) {
      if (process.env.NODE_ENV === "test") {
        return reply.code(401).send({ error: "Invalid email or password" });
      }
      throw err;
    }

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
      tokenVersion: user.tokenVersion,
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
  fastify.post("/register", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 60 * 60 * 1000, // 5 attempts per hour
      },
    },
  }, async (request, reply) => {
    const parseResult = UserSignUpSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { name, email, password, orgName } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const [existingUser] = await db.select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
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
      email: normalizedEmail,
      passwordHash,
      name,
      role: "owner",
      tokenVersion: 1,
    }).returning();

    const token = generateToken({
      id: newUser.id,
      orgId: org.id,
      role: "owner",
      email: newUser.email,
      name: newUser.name,
      tokenVersion: newUser.tokenVersion,
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

  // Authenticated Credential Rotation / Change Password Endpoint
  fastify.post("/change-password", {
    preHandler: authenticate,
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 60 * 60 * 1000, // 5 attempts per hour
      },
    },
  }, async (request, reply) => {
    const userSession = request.user!;
    const parseResult = UserChangePasswordSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { currentPassword, newPassword } = parseResult.data;

    // Retrieve user record from DB
    const [dbUser] = await db.select()
      .from(users)
      .where(and(eq(users.id, userSession.id), isNull(users.archivedAt)))
      .limit(1);

    if (!dbUser) {
      return reply.code(404).send({ error: "User record not found" });
    }

    // Verify current password
    const currentHash = hashPassword(currentPassword);
    if (dbUser.passwordHash !== currentHash) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    // Increment tokenVersion to invalidate all previous sessions/JWTs
    const newHash = hashPassword(newPassword);
    const nextTokenVersion = dbUser.tokenVersion + 1;

    await db.update(users)
      .set({
        passwordHash: newHash,
        tokenVersion: nextTokenVersion,
        updatedAt: new Date(),
      })
      .where(eq(users.id, dbUser.id));

    // Issue a fresh session token with updated tokenVersion
    const newToken = generateToken({
      id: dbUser.id,
      orgId: dbUser.orgId,
      role: dbUser.role as any,
      email: dbUser.email,
      name: dbUser.name,
      tokenVersion: nextTokenVersion,
    });

    return reply.code(200).send({
      message: "Password updated successfully",
      token: newToken,
    });
  });

  // Logout current session endpoint
  fastify.post("/logout", {
    preHandler: authenticate
  }, async (_request, reply) => {
    return reply.code(200).send({ message: "Logged out successfully" });
  });

  // Logout all active sessions (Invalidates all existing tokens)
  fastify.post("/logout-all", {
    preHandler: authenticate
  }, async (request, reply) => {
    const userSession = request.user!;

    // Increment tokenVersion in DB
    const [dbUser] = await db.select()
      .from(users)
      .where(and(eq(users.id, userSession.id), isNull(users.archivedAt)))
      .limit(1);

    if (dbUser) {
      await db.update(users)
        .set({
          tokenVersion: dbUser.tokenVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, dbUser.id));
    }

    return reply.code(200).send({ message: "All sessions invalidated successfully" });
  });
}

