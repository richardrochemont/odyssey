import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { db, users } from "@hearthlane/db";
import { eq } from "drizzle-orm";
import { generateToken } from "../services/auth";
import { UserSignInSchema } from "@hearthlane/validation";
import { createHash } from "node:crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export default async function authRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  
  // Endpoint to discover seeded users for dev selector
  fastify.get("/users", async (_request, _reply) => {
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
}
