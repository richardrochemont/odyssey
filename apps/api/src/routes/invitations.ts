import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { db, organizationInvitations, organizationMemberships, organizations, users, auditLogs } from "@odyssey/db";
import { and, eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { generateToken } from "../services/auth";
import { InvitationPreviewSchema, InvitationAcceptSchema } from "@odyssey/validation";
import { createHash } from "node:crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export default async function invitationRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

  // Public Invitation Details Preview Endpoint (Reads token from body passed by client fragment reader)
  fastify.post("/preview", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const parseResult = InvitationPreviewSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { token } = parseResult.data;
    const hashed = hashToken(token);

    const [invitation] = await db.select({
      id: organizationInvitations.id,
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      status: organizationInvitations.status,
      note: organizationInvitations.note,
      expiresAt: organizationInvitations.expiresAt,
      orgName: organizations.name,
      invitedByName: users.name,
    })
      .from(organizationInvitations)
      .innerJoin(organizations, eq(organizations.id, organizationInvitations.orgId))
      .innerJoin(users, eq(users.id, organizationInvitations.invitedByUserId))
      .where(eq(organizationInvitations.tokenHash, hashed))
      .limit(1);

    if (!invitation) {
      return reply.code(404).send({ error: "Invalid invitation token" });
    }

    const isExpired = new Date(invitation.expiresAt) < new Date();
    const isRevoked = invitation.status === "revoked";
    const isAccepted = invitation.status === "accepted";
    const isValid = invitation.status === "pending" && !isExpired;

    return reply.code(200).send({
      valid: isValid,
      isExpired,
      isRevoked,
      isAccepted,
      email: invitation.email,
      role: invitation.role,
      note: invitation.note,
      orgName: invitation.orgName,
      invitedByName: invitation.invitedByName,
      expiresAt: invitation.expiresAt,
    });
  });

  // Authenticated Invitation Accept Endpoint (Consumes token from body)
  fastify.post("/accept", {
    preHandler: authenticate,
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const userSession = request.user!;
    const parseResult = InvitationAcceptSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Validation failed",
        details: parseResult.error.flatten(),
      });
    }

    const { token } = parseResult.data;
    const hashed = hashToken(token);

    const [invitation] = await db.select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.tokenHash, hashed))
      .limit(1);

    if (!invitation) {
      return reply.code(404).send({ error: "Invalid invitation token" });
    }

    if (invitation.status === "revoked") {
      return reply.code(400).send({ error: "This invitation has been revoked" });
    }

    if (invitation.status === "accepted") {
      return reply.code(400).send({ error: "This invitation has already been accepted" });
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return reply.code(400).send({ error: "This invitation has expired" });
    }

    // Verify invited email matches authenticated user email
    if (invitation.email.toLowerCase() !== userSession.email.toLowerCase()) {
      return reply.code(400).send({
        error: `Invitation email (${invitation.email}) does not match authenticated account email (${userSession.email})`,
      });
    }

    // Transaction: Create/restore membership -> mark invitation accepted -> update lastActiveOrgId -> audit log
    await db.transaction(async (tx) => {
      const [existingMembership] = await tx.select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, invitation.orgId),
            eq(organizationMemberships.userId, userSession.id)
          )
        )
        .limit(1);

      if (existingMembership) {
        await tx.update(organizationMemberships)
          .set({
            role: invitation.role,
            status: "active",
            joinedAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
          })
          .where(eq(organizationMemberships.id, existingMembership.id));
      } else {
        await tx.insert(organizationMemberships).values({
          orgId: invitation.orgId,
          userId: userSession.id,
          role: invitation.role,
          status: "active",
        });
      }

      await tx.update(organizationInvitations)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(organizationInvitations.id, invitation.id));

      await tx.update(users)
        .set({
          lastActiveOrgId: invitation.orgId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userSession.id));

      await tx.insert(auditLogs).values({
        orgId: invitation.orgId,
        userId: userSession.id,
        entityType: "organization_invitation",
        entityId: invitation.id,
        action: "accept_invitation",
        newState: { role: invitation.role, email: userSession.email },
      });
    });

    // Issue updated JWT token with new activeOrgId
    const newToken = generateToken({
      id: userSession.id,
      activeOrgId: invitation.orgId,
      orgId: invitation.orgId,
      role: invitation.role as any,
      email: userSession.email,
      name: userSession.name,
      tokenVersion: userSession.tokenVersion,
    });

    return reply.code(200).send({
      message: "Invitation accepted successfully. Switched to workspace.",
      token: newToken,
      activeOrgId: invitation.orgId,
      role: invitation.role,
    });
  });
}
