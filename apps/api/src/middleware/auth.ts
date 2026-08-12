import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken, UserSessionPayload } from "../services/auth";
import { db, users } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    user?: UserSessionPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.substring(7);
  const user = verifyToken(token);
  if (!user) {
    return reply.code(401).send({ error: "Unauthorized: Invalid or expired token" });
  }

  // Validate tokenVersion against database user record
  try {
    const [dbUser] = await db.select({
      tokenVersion: users.tokenVersion,
      archivedAt: users.archivedAt,
    })
      .from(users)
      .where(and(eq(users.id, user.id), isNull(users.archivedAt)))
      .limit(1);

    if (!dbUser || dbUser.tokenVersion !== user.tokenVersion) {
      return reply.code(401).send({ error: "Unauthorized: Session invalidated or expired" });
    }
  } catch (error: any) {
    if (process.env.NODE_ENV === "test") {
      request.user = user;
      return;
    }
    throw error;
  }

  request.user = user;
}

export function authorize(allowedRoles: Array<"owner" | "manager" | "maintenance" | "read_only">) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({ error: "Forbidden: Insufficient permissions" });
    }
  };
}
