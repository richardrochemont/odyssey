import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { db, organizations, organizationMemberships, organizationInvitations, users, auditLogs } from "@odyssey/db";
import { and, eq, isNull, gte, count } from "drizzle-orm";
import { authenticate, authorize, verifyOrgAccess } from "../middleware/auth";
import { generateToken } from "../services/auth";
import {
  WorkspaceCreateSchema,
  InvitationCreateSchema,
  MemberRoleUpdateSchema,
} from "@odyssey/validation";
import { randomBytes, createHash } from "node:crypto";
import { getInvitationUrl } from "../config/appUrl";
import { getTransactionalEmailProvider } from "../services/email";

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

export default async function workspaceRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

  // Create Workspace Endpoint
  fastify.post("/", {
    preHandler: authenticate,
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = WorkspaceCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { name, slug: providedSlug } = parseResult.data;

    let slug = providedSlug ? generateSlug(providedSlug) : generateSlug(name);
    let counter = 1;
    while (true) {
      const [existing] = await db.select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (!existing) break;
      slug = `${generateSlug(name)}-${counter++}`;
    }

    const { org, membership } = await db.transaction(async (tx) => {
      const [o] = await tx.insert(organizations).values({
        name,
        slug,
      }).returning();

      const [m] = await tx.insert(organizationMemberships).values({
        orgId: o.id,
        userId: user.id,
        role: "owner",
        status: "active",
      }).returning();

      await tx.update(users)
        .set({ lastActiveOrgId: o.id, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await tx.insert(auditLogs).values({
        orgId: o.id,
        userId: user.id,
        entityType: "organization",
        entityId: o.id,
        action: "create_workspace",
        newState: { name, slug },
      });

      return { org: o, membership: m };
    });

    const token = generateToken({
      id: user.id,
      activeOrgId: org.id,
      orgId: org.id,
      role: "owner",
      email: user.email,
      name: user.name,
      tokenVersion: user.tokenVersion,
    });

    return reply.code(201).send({
      message: "Workspace created successfully",
      token,
      workspace: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: membership.role,
        createdAt: org.createdAt,
      },
    });
  });

  // List User's Active Workspaces
  fastify.get("/", {
    preHandler: authenticate,
  }, async (request, _reply) => {
    const user = request.user!;

    const list = await db.select({
      orgId: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMemberships.role,
      status: organizationMemberships.status,
      joinedAt: organizationMemberships.joinedAt,
      isActive: eq(organizations.id, user.activeOrgId),
    })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.orgId))
      .where(
        and(
          eq(organizationMemberships.userId, user.id),
          eq(organizationMemberships.status, "active"),
          isNull(organizationMemberships.archivedAt),
          isNull(organizations.archivedAt)
        )
      );

    return list;
  });

  // List Workspace Members (Owner & Manager)
  fastify.get("/:orgId/members", {
    preHandler: [authenticate, authorize(["owner", "manager"])],
  }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    if (!verifyOrgAccess(request, reply, orgId)) return;

    const members = await db.select({
      membershipId: organizationMemberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMemberships.role,
      status: organizationMemberships.status,
      joinedAt: organizationMemberships.joinedAt,
      createdAt: organizationMemberships.createdAt,
    })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(
        and(
          eq(organizationMemberships.orgId, orgId),
          isNull(organizationMemberships.archivedAt)
        )
      );

    return members;
  });

  // Update Member Role (Owner only)
  fastify.post("/:orgId/members/:membershipId/role", {
    preHandler: [authenticate, authorize(["owner"])],
  }, async (request, reply) => {
    const { orgId, membershipId } = request.params as { orgId: string; membershipId: string };
    if (!verifyOrgAccess(request, reply, orgId)) return;

    const parseResult = MemberRoleUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { role: newRole } = parseResult.data;

    const [targetMembership] = await db.select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, membershipId),
          eq(organizationMemberships.orgId, orgId),
          isNull(organizationMemberships.archivedAt)
        )
      )
      .limit(1);

    if (!targetMembership) {
      return reply.code(404).send({ error: "Workspace membership not found" });
    }

    // Final Active Owner Protection: Prevent demoting the last active owner
    if (targetMembership.role === "owner" && newRole !== "owner") {
      const activeOwners = await db.select({ count: count() })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.role, "owner"),
            eq(organizationMemberships.status, "active"),
            isNull(organizationMemberships.archivedAt)
          )
        );

      if (activeOwners[0].count <= 1) {
        return reply.code(400).send({
          error: "Forbidden: Cannot demote the final active owner of the workspace",
        });
      }
    }

    await db.update(organizationMemberships)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(organizationMemberships.id, membershipId));

    await db.insert(auditLogs).values({
      orgId,
      userId: request.user!.id,
      entityType: "organization_membership",
      entityId: targetMembership.userId,
      action: "update_role",
      previousState: { role: targetMembership.role },
      newState: { role: newRole },
    });

    return reply.code(200).send({ message: "Member role updated successfully", role: newRole });
  });

  // Suspend Member (Owner only)
  fastify.post("/:orgId/members/:membershipId/suspend", {
    preHandler: [authenticate, authorize(["owner"])],
  }, async (request, reply) => {
    const { orgId, membershipId } = request.params as { orgId: string; membershipId: string };
    if (!verifyOrgAccess(request, reply, orgId)) return;

    const [targetMembership] = await db.select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, membershipId),
          eq(organizationMemberships.orgId, orgId),
          isNull(organizationMemberships.archivedAt)
        )
      )
      .limit(1);

    if (!targetMembership) {
      return reply.code(404).send({ error: "Workspace membership not found" });
    }

    // Final Active Owner Protection
    if (targetMembership.role === "owner") {
      const activeOwners = await db.select({ count: count() })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.role, "owner"),
            eq(organizationMemberships.status, "active"),
            isNull(organizationMemberships.archivedAt)
          )
        );

      if (activeOwners[0].count <= 1) {
        return reply.code(400).send({
          error: "Forbidden: Cannot suspend the final active owner of the workspace",
        });
      }
    }

    await db.update(organizationMemberships)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(organizationMemberships.id, membershipId));

    await db.insert(auditLogs).values({
      orgId,
      userId: request.user!.id,
      entityType: "organization_membership",
      entityId: targetMembership.userId,
      action: "suspend_member",
      previousState: { status: targetMembership.status },
      newState: { status: "suspended" },
    });

    return reply.code(200).send({ message: "Member suspended successfully" });
  });

  // Remove/Archive Member (Owner only)
  fastify.post("/:orgId/members/:membershipId/remove", {
    preHandler: [authenticate, authorize(["owner"])],
  }, async (request, reply) => {
    const { orgId, membershipId } = request.params as { orgId: string; membershipId: string };
    if (!verifyOrgAccess(request, reply, orgId)) return;

    const [targetMembership] = await db.select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, membershipId),
          eq(organizationMemberships.orgId, orgId),
          isNull(organizationMemberships.archivedAt)
        )
      )
      .limit(1);

    if (!targetMembership) {
      return reply.code(404).send({ error: "Workspace membership not found" });
    }

    // Final Active Owner Protection
    if (targetMembership.role === "owner") {
      const activeOwners = await db.select({ count: count() })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.role, "owner"),
            eq(organizationMemberships.status, "active"),
            isNull(organizationMemberships.archivedAt)
          )
        );

      if (activeOwners[0].count <= 1) {
        return reply.code(400).send({
          error: "Forbidden: Cannot remove the final active owner of the workspace",
        });
      }
    }

    await db.update(organizationMemberships)
      .set({ status: "suspended", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(organizationMemberships.id, membershipId));

    await db.insert(auditLogs).values({
      orgId,
      userId: request.user!.id,
      entityType: "organization_membership",
      entityId: targetMembership.userId,
      action: "remove_member",
      newState: { archivedAt: new Date() },
    });

    return reply.code(200).send({ message: "Member removed successfully" });
  });

  // Create Workspace Team Invitation (Owner only)
  fastify.post("/:orgId/invitations", {
    preHandler: [authenticate, authorize(["owner"])],
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const { orgId } = request.params as { orgId: string };
    if (!verifyOrgAccess(request, reply, orgId)) return;

    const parseResult = InvitationCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { email, role, note, confirmOwnerInvite } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    // Owner role explicit confirmation requirement
    if (role === "owner" && !confirmOwnerInvite) {
      return reply.code(400).send({
        error: "Explicit confirmation required when inviting an Owner to the workspace",
        requiresConfirmation: true,
      });
    }

    // Revoke any prior active invitations for (orgId, email) pair
    await db.update(organizationInvitations)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(organizationInvitations.orgId, orgId),
          eq(organizationInvitations.email, normalizedEmail),
          eq(organizationInvitations.status, "pending")
        )
      );

    // Generate cryptographically secure random token (32 bytes = 64 hex chars)
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db.insert(organizationInvitations).values({
      orgId,
      email: normalizedEmail,
      role,
      invitedByUserId: request.user!.id,
      tokenHash,
      note,
      status: "pending",
      expiresAt,
    }).returning();

    await db.insert(auditLogs).values({
      orgId,
      userId: request.user!.id,
      entityType: "organization_invitation",
      entityId: invitation.id,
      action: "create_invitation",
      newState: { email: normalizedEmail, role, expiresAt },
    });

    const invitationUrl = getInvitationUrl(rawToken);

    // Fetch org details for email template
    const [orgInfo] = await db.select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const emailProvider = getTransactionalEmailProvider();
    const sendResult = await emailProvider.sendWorkspaceInvitation({
      to: normalizedEmail,
      inviterName: request.user!.name,
      workspaceName: orgInfo?.name || "Odyssey Workspace",
      role,
      expiresAt,
      invitationUrl,
    });

    let finalStatus = invitation.status;
    let responseMessage: string;

    if (sendResult.deliveryStatus === "accepted") {
      finalStatus = "sent";
      await db.update(organizationInvitations)
        .set({
          status: "sent",
          deliveryStatus: "accepted",
          sentAt: sendResult.sentAt || new Date(),
          providerMessageId: sendResult.providerMessageId,
          lastDeliveryError: null,
          updatedAt: new Date(),
        })
        .where(eq(organizationInvitations.id, invitation.id));
      responseMessage = "Invitation created and email sent successfully.";
    } else if (sendResult.deliveryStatus === "skipped") {
      await db.update(organizationInvitations)
        .set({
          deliveryStatus: "skipped",
          lastDeliveryError: null,
          updatedAt: new Date(),
        })
        .where(eq(organizationInvitations.id, invitation.id));
      responseMessage = "Invitation link generated. Email delivery is disabled. Copy the one-time link to share it manually.";
    } else {
      await db.update(organizationInvitations)
        .set({
          deliveryStatus: "failed",
          lastDeliveryError: sendResult.errorCode || "ERR_PROVIDER_FAILED",
          updatedAt: new Date(),
        })
        .where(eq(organizationInvitations.id, invitation.id));
      responseMessage = "Invitation link generated. Email delivery failed. Copy the one-time link to share it manually.";
    }

    return reply.code(201).send({
      message: responseMessage,
      invitationUrl,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: finalStatus,
        deliveryStatus: sendResult.deliveryStatus,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
    });
  });

  // List Pending Workspace Invitations (Owner only)
  fastify.get("/:orgId/invitations", {
    preHandler: [authenticate, authorize(["owner"])],
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const { orgId } = request.params as { orgId: string };
    if (!verifyOrgAccess(request, reply, orgId)) return;

    const list = await db.select({
      id: organizationInvitations.id,
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      status: organizationInvitations.status,
      note: organizationInvitations.note,
      expiresAt: organizationInvitations.expiresAt,
      createdAt: organizationInvitations.createdAt,
      invitedByName: users.name,
    })
      .from(organizationInvitations)
      .innerJoin(users, eq(users.id, organizationInvitations.invitedByUserId))
      .where(
        and(
          eq(organizationInvitations.orgId, orgId),
          eq(organizationInvitations.status, "pending"),
          gte(organizationInvitations.expiresAt, new Date())
        )
      );

    return list;
  });

  // Revoke Team Invitation (Owner only)
  fastify.post("/:orgId/invitations/:invitationId/revoke", {
    preHandler: [authenticate, authorize(["owner"])],
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const { orgId, invitationId } = request.params as { orgId: string; invitationId: string };
    if (!verifyOrgAccess(request, reply, orgId)) return;

    const [invitation] = await db.select()
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.id, invitationId),
          eq(organizationInvitations.orgId, orgId)
        )
      )
      .limit(1);

    if (!invitation) {
      return reply.code(404).send({ error: "Invitation record not found" });
    }

    await db.update(organizationInvitations)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(organizationInvitations.id, invitationId));

    await db.insert(auditLogs).values({
      orgId,
      userId: request.user!.id,
      entityType: "organization_invitation",
      entityId: invitationId,
      action: "revoke_invitation",
      newState: { status: "revoked" },
    });

    return reply.code(200).send({ message: "Invitation revoked successfully" });
  });
}
