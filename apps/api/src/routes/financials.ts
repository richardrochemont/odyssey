import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/financials";
import { FinancialRecordCreateSchema } from "@hearthlane/validation";

export default async function financialRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // List records
  fastify.get("/records", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const records = await service.listFinancialRecords(user.orgId);
    
    // Format amounts from cents to dollars
    return records.map((r) => ({
      ...r,
      amount: r.amount / 100,
    }));
  });

  // Create record
  fastify.post("/records", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = FinancialRecordCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const record = await service.createFinancialRecord(user.orgId, user.id, parseResult.data);
    return reply.code(201).send({
      ...record,
      amount: record.amount / 100,
    });
  });

  // Archive record
  fastify.delete("/records/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await service.archiveFinancialRecord(user.orgId, user.id, id);
      return { success: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Get portfolio financial calculation summary
  fastify.get("/summary", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const summary = await service.getPortfolioFinancialSummary(user.orgId, start, end);

    // Format all cent metrics to dollar decimals for ease of front-end display
    return {
      scheduledRent: summary.scheduledRent / 100,
      recordedRent: summary.recordedRent / 100,
      totalIncome: summary.totalIncome / 100,
      totalExpenses: summary.totalExpenses / 100,
      netOperatingIncome: summary.netOperatingIncome / 100,
      notes: summary.notes,
    };
  });

  // Get 9-month cash flow trends
  fastify.get("/trends", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const trends = await service.getPortfolioCashFlowTrends(user.orgId);
    return trends;
  });
}
