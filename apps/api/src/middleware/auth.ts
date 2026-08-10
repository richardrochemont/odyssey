import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken, UserSessionPayload } from "../services/auth";

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
