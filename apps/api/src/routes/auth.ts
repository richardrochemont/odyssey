import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { db, users, organizations, organizationMemberships, organizationInvitations, auditLogs } from "@odyssey/db";
import { and, eq, isNull, gte, asc } from "drizzle-orm";
import { generateToken } from "../services/auth";
import { authenticate, authorize } from "../middleware/auth";
import { UserSignInSchema, UserSignUpSchema, UserChangePasswordSchema, WorkspaceSwitchSchema } from "@odyssey/validation";
import { createHash } from "node:crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateSlug(name: string): string {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base || ["settings", "invite", "login", "register", "admin", "api", "workspaces"].includes(base)) {
    base = (base || "workspace") + "-org";
  }
  return base.substring(0, 200);
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
      role: organizationMemberships.role,
      status: organizationMemberships.status,
      joinedAt: organizationMemberships.joinedAt,
      createdAt: users.createdAt,
    })
      .from(users)
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.userId, users.id),
          eq(organizationMemberships.orgId, user.activeOrgId)
        )
      )
      .where(and(eq(organizationMemberships.orgId, user.activeOrgId), isNull(users.archivedAt)))
      .limit(limit)
      .offset(offset);

    return list;
  });

  const isE2ETest =
    process.env.NODE_ENV === "test" &&
    process.env.E2E_TEST_MODE === "true";

  // Standard email/password login with persistent active workspace selection
  fastify.post("/login", {
    config: {
      rateLimit: {
        max: isE2ETest ? 1000 : 5,
        timeWindow: 15 * 60 * 1000, // 5 attempts per 15 mins default
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
    const normalizedEmail = email.toLowerCase();

    let user;
    try {
      const [dbUser] = await db.select()
        .from(users)
        .where(and(eq(users.email, normalizedEmail), isNull(users.archivedAt)))
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

    // Resolve active workspace membership
    let activeMembership;
    if (user.lastActiveOrgId) {
      const [lastMem] = await db.select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, user.id),
            eq(organizationMemberships.orgId, user.lastActiveOrgId),
            eq(organizationMemberships.status, "active"),
            isNull(organizationMemberships.archivedAt)
          )
        )
        .limit(1);
      activeMembership = lastMem;
    }

    // Fallback to first active membership if lastActiveOrgId is invalid or unsaved
    if (!activeMembership) {
      const [firstMem] = await db.select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, user.id),
            eq(organizationMemberships.status, "active"),
            isNull(organizationMemberships.archivedAt)
          )
        )
        .orderBy(asc(organizationMemberships.joinedAt))
        .limit(1);
      activeMembership = firstMem;
    }

    if (!activeMembership) {
      return reply.code(403).send({ error: "Account suspended or not assigned to any active workspace" });
    }

    // Update lastActiveOrgId if it changed or was empty
    if (user.lastActiveOrgId !== activeMembership.orgId) {
      await db.update(users)
        .set({ lastActiveOrgId: activeMembership.orgId, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    const token = generateToken({
      id: user.id,
      activeOrgId: activeMembership.orgId,
      orgId: activeMembership.orgId,
      role: activeMembership.role as any,
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
        role: activeMembership.role,
        activeOrgId: activeMembership.orgId,
        orgId: activeMembership.orgId,
      },
    };
  });

  // Organization & User Registration (Supports normal & invitation-based registration)
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

    const { name, email, password, orgName, invitationToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const [existingUser] = await db.select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      return reply.code(409).send({ error: "A user with this email already exists" });
    }

    const passwordHash = hashPassword(password);

    // Flow 1: Invitation-based registration
    if (invitationToken) {
      const hashed = hashToken(invitationToken);
      const [invitation] = await db.select()
        .from(organizationInvitations)
        .where(
          and(
            eq(organizationInvitations.tokenHash, hashed),
            gte(organizationInvitations.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!invitation || ["accepted", "expired", "revoked"].includes(invitation.status)) {
        return reply.code(400).send({ error: "Invalid, expired, or revoked invitation token" });
      }

      if (invitation.email.toLowerCase() !== normalizedEmail) {
        return reply.code(400).send({
          error: `Invitation email (${invitation.email}) does not match registration email (${normalizedEmail})`,
        });
      }

      // Execute transaction: create user -> accept invite -> create/restore membership
      const { newUser, role } = await db.transaction(async (tx) => {
        const [u] = await tx.insert(users).values({
          orgId: invitation.orgId,
          lastActiveOrgId: invitation.orgId,
          email: normalizedEmail,
          passwordHash,
          name,
          role: invitation.role,
          tokenVersion: 1,
        }).returning();

        // Check if existing membership row exists
        const [existingMem] = await tx.select()
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.orgId, invitation.orgId),
              eq(organizationMemberships.userId, u.id)
            )
          )
          .limit(1);

        if (existingMem) {
          await tx.update(organizationMemberships)
            .set({
              role: invitation.role,
              status: "active",
              joinedAt: new Date(),
              updatedAt: new Date(),
              archivedAt: null,
            })
            .where(eq(organizationMemberships.id, existingMem.id));
        } else {
          await tx.insert(organizationMemberships).values({
            orgId: invitation.orgId,
            userId: u.id,
            role: invitation.role,
            status: "active",
          });
        }

        // Mark invitation accepted
        await tx.update(organizationInvitations)
          .set({
            status: "accepted",
            acceptedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(organizationInvitations.id, invitation.id));

        // Audit log
        await tx.insert(auditLogs).values({
          orgId: invitation.orgId,
          userId: u.id,
          entityType: "organization_membership",
          entityId: u.id,
          action: "register_accept_invitation",
          newState: { role: invitation.role, email: normalizedEmail },
        });

        return { newUser: u, role: invitation.role };
      });

      const token = generateToken({
        id: newUser.id,
        activeOrgId: invitation.orgId,
        orgId: invitation.orgId,
        role: role as any,
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
          role,
          activeOrgId: invitation.orgId,
          orgId: invitation.orgId,
        },
      });
    }

    // Flow 2: Normal Registration (Creates new workspace + owner membership)
    if (!orgName) {
      return reply.code(400).send({ error: "Organization name is required" });
    }

    let slug = generateSlug(orgName);
    let counter = 1;
    while (true) {
      const [existingSlug] = await db.select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (!existingSlug) break;
      slug = `${generateSlug(orgName)}-${counter++}`;
    }

    const { newUser, org } = await db.transaction(async (tx) => {
      const [o] = await tx.insert(organizations).values({
        name: orgName,
        slug,
      }).returning();

      const [u] = await tx.insert(users).values({
        orgId: o.id,
        lastActiveOrgId: o.id,
        email: normalizedEmail,
        passwordHash,
        name,
        role: "owner",
        tokenVersion: 1,
      }).returning();

      await tx.insert(organizationMemberships).values({
        orgId: o.id,
        userId: u.id,
        role: "owner",
        status: "active",
      });

      await tx.insert(auditLogs).values({
        orgId: o.id,
        userId: u.id,
        entityType: "organization",
        entityId: o.id,
        action: "create",
        newState: { name: orgName, slug },
      });

      return { newUser: u, org: o };
    });

    const token = generateToken({
      id: newUser.id,
      activeOrgId: org.id,
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
        activeOrgId: org.id,
        orgId: org.id,
      },
    });
  });

  // Switch Active Workspace Endpoint
  fastify.post("/switch-workspace", {
    preHandler: authenticate,
  }, async (request, reply) => {
    const userSession = request.user!;
    const parseResult = WorkspaceSwitchSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { orgId } = parseResult.data;

    // Verify active membership in target organization
    const [membership] = await db.select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, userSession.id),
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.status, "active"),
          isNull(organizationMemberships.archivedAt)
        )
      )
      .limit(1);

    if (!membership) {
      return reply.code(403).send({ error: "Forbidden: You are not an active member of this workspace" });
    }

    // Update lastActiveOrgId
    await db.update(users)
      .set({ lastActiveOrgId: orgId, updatedAt: new Date() })
      .where(eq(users.id, userSession.id));

    // Reissue JWT token with updated activeOrgId
    const newToken = generateToken({
      id: userSession.id,
      activeOrgId: orgId,
      orgId,
      role: membership.role as any,
      email: userSession.email,
      name: userSession.name,
      tokenVersion: userSession.tokenVersion,
    });

    return reply.code(200).send({
      message: "Switched workspace successfully",
      token: newToken,
      user: {
        id: userSession.id,
        name: userSession.name,
        email: userSession.email,
        role: membership.role,
        activeOrgId: orgId,
        orgId,
      },
    });
  });

  // Change Password Endpoint
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

    const [dbUser] = await db.select()
      .from(users)
      .where(and(eq(users.id, userSession.id), isNull(users.archivedAt)))
      .limit(1);

    if (!dbUser) {
      return reply.code(404).send({ error: "User record not found" });
    }

    const currentHash = hashPassword(currentPassword);
    if (dbUser.passwordHash !== currentHash) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    const newHash = hashPassword(newPassword);
    const nextTokenVersion = dbUser.tokenVersion + 1;

    await db.update(users)
      .set({
        passwordHash: newHash,
        tokenVersion: nextTokenVersion,
        updatedAt: new Date(),
      })
      .where(eq(users.id, dbUser.id));

    const newToken = generateToken({
      id: dbUser.id,
      activeOrgId: userSession.activeOrgId,
      orgId: userSession.activeOrgId,
      role: userSession.role,
      email: dbUser.email,
      name: dbUser.name,
      tokenVersion: nextTokenVersion,
    });

    return reply.code(200).send({
      message: "Password updated successfully",
      token: newToken,
    });
  });

  // Logout Endpoint
  fastify.post("/logout", {
    preHandler: authenticate
  }, async (_request, reply) => {
    return reply.code(200).send({ message: "Logged out successfully" });
  });

  // Logout All Sessions Endpoint
  fastify.post("/logout-all", {
    preHandler: authenticate
  }, async (request, reply) => {
    const userSession = request.user!;

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
