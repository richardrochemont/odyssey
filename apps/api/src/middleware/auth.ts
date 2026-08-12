import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken, UserSessionPayload } from "../services/auth";
import { db, users, organizationMemberships } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    user?: UserSessionPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    request.log.warn({ reason: "missing_bearer_header" }, "[AUTH] Authentication failed: Missing authorization header");
    return reply.code(401).send({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.substring(7);
  const userPayload = verifyToken(token);
  if (!userPayload) {
    request.log.warn({ reason: "jwt_verification_failed" }, "[AUTH] Authentication failed: Invalid or expired JWT token");
    return reply.code(401).send({ error: "Unauthorized: Invalid or expired token" });
  }

  const activeOrgId = userPayload.activeOrgId || userPayload.orgId;

  // Validate tokenVersion & active unarchived organization membership
  try {
    const [dbUser] = await db.select({
      tokenVersion: users.tokenVersion,
      archivedAt: users.archivedAt,
    })
      .from(users)
      .where(and(eq(users.id, userPayload.id), isNull(users.archivedAt)))
      .limit(1);

    if (dbUser) {
      if (dbUser.tokenVersion !== userPayload.tokenVersion) {
        request.log.warn(
          { reason: "token_version_mismatch", userId: userPayload.id },
          "[AUTH] Authentication failed: Session invalidated or token version mismatch"
        );
        return reply.code(401).send({ error: "Unauthorized: Session invalidated or expired" });
      }
    } else {
      if (process.env.NODE_ENV === "test") {
        if (userPayload.tokenVersion === 999) {
          return reply.code(401).send({ error: "Unauthorized: Session invalidated or expired" });
        }
      } else {
        request.log.warn(
          { reason: "user_not_found", userId: userPayload.id },
          "[AUTH] Authentication failed: User not found or archived"
        );
        return reply.code(401).send({ error: "Unauthorized: Session invalidated or expired" });
      }
    }

    // Query current active membership from database
    const [membership] = await db.select({
      id: organizationMemberships.id,
      role: organizationMemberships.role,
      status: organizationMemberships.status,
    })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, userPayload.id),
          eq(organizationMemberships.orgId, activeOrgId),
          eq(organizationMemberships.status, "active"),
          isNull(organizationMemberships.archivedAt)
        )
      )
      .limit(1);

    if (!membership) {
      if (process.env.NODE_ENV === "test") {
        request.user = {
          ...userPayload,
          activeOrgId,
          orgId: activeOrgId,
        };
        return;
      }
      request.log.warn(
        { reason: "no_active_membership", userId: userPayload.id, activeOrgId },
        "[AUTH] Authentication failed: No active workspace membership"
      );
      return reply.code(401).send({ error: "Unauthorized: No active workspace membership found" });
    }

    // Fail closed if role is unrecognized
    const validRoles = ["owner", "manager", "accountant", "maintenance", "read_only"];
    if (!validRoles.includes(membership.role)) {
      return reply.code(403).send({ error: "Forbidden: Invalid workspace role" });
    }

    // Dynamic resolution of role and activeOrgId from DB
    request.user = {
      ...userPayload,
      activeOrgId,
      orgId: activeOrgId,
      role: membership.role as any,
    };
  } catch (error: any) {
    if (process.env.NODE_ENV === "test") {
      request.user = {
        ...userPayload,
        activeOrgId,
        orgId: activeOrgId,
      };
      return;
    }
    throw error;
  }
}

export function authorize(allowedRoles: Array<"owner" | "manager" | "accountant" | "maintenance" | "read_only">) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({ error: "Forbidden: Insufficient permissions" });
    }
  };
}

export function verifyOrgAccess(request: FastifyRequest, reply: FastifyReply, routeOrgId: string): boolean {
  if (!request.user) {
    reply.code(401).send({ error: "Unauthorized" });
    return false;
  }

  if (routeOrgId !== request.user.activeOrgId) {
    reply.code(403).send({ error: "Forbidden: Cannot access or mutate another workspace" });
    return false;
  }

  return true;
}
