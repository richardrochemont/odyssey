import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/growth";
import * as issuesService from "../services/growthIssues";
import { GrowthSummaryQuerySchema } from "@odyssey/validation";

export default async function growthRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // GET /growth/summary -> read-only, deterministic portfolio insight facts.
  // Organization identity is taken only from the authenticated membership
  // (request.user.orgId); it is never accepted from the query string, and
  // GrowthSummaryQuerySchema has no orgId field at all.
  fastify.get("/summary", {
    preHandler: authorize(["owner", "manager", "read_only"]),
  }, async (request, reply) => {
    const user = request.user!;

    const parseResult = GrowthSummaryQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }

    try {
      const summary = await service.getGrowthSummary(user.orgId, parseResult.data);
      return summary;
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // GET /growth/decision-brief -> deterministic issue engine + scorecards
  // layered on top of the same Growth Facts data. No LLM, no persistence.
  // Same authorization and org-scoping rules as /growth/summary.
  fastify.get("/decision-brief", {
    preHandler: authorize(["owner", "manager", "read_only"]),
  }, async (request, reply) => {
    const user = request.user!;

    const parseResult = GrowthSummaryQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }

    try {
      const brief = await issuesService.getDecisionBrief(user.orgId, parseResult.data);
      return brief;
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
}
