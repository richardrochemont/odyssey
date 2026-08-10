import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate } from "../middleware/auth";
import { getLeaseDetails } from "../services/leases";
import { aiProvider, promptAI } from "../services/ai";
import { z } from "zod";

export default async function aiRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // POST /ai/lease-summary -> generate AI summary of a lease
  fastify.post("/lease-summary", async (request, reply) => {
    const user = request.user!;
    
    const schema = z.object({
      leaseId: z.string().uuid("Invalid lease ID"),
    });

    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }

    const { leaseId } = parseResult.data;
    
    // Fetch lease details from the DB
    const lease = await getLeaseDetails(user.orgId, leaseId);
    if (!lease) {
      return reply.code(404).send({ error: "Lease not found" });
    }

    // Call Mock AI Provider
    try {
      const summary = await aiProvider.summarizeLease(lease);
      return summary;
    } catch (e: any) {
      return reply.code(500).send({ error: "Failed to generate lease summary", details: e.message });
    }
  });

  // POST /ai/prompt -> interactive context-aware AI assistant
  fastify.post("/prompt", async (request, reply) => {
    const user = request.user!;
    
    const schema = z.object({
      context: z.string().default("portfolio"),
      text: z.string().min(1, "Prompt cannot be empty"),
    });

    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }

    const { context, text } = parseResult.data;

    try {
      const result = await promptAI(user.orgId, context, text);
      return result;
    } catch (e: any) {
      return reply.code(500).send({ error: "Failed to process AI prompt", details: e.message });
    }
  });
}
