import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/financials";
import { attestCoverageForMonth, getOrCalculatePropertyMonthCoverage } from "../services/monthlySummaries";
import { FinancialRecordCreateSchema } from "@odyssey/validation";

export default async function financialRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // List records
  fastify.get("/records", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const records = await service.listFinancialRecords(user.orgId);
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
    const { propertyId, startDate, endDate } = request.query as { propertyId?: string; startDate?: string; endDate?: string };

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const summary = await service.getPortfolioFinancialSummary(user.orgId, propertyId, start, end);

    return {
      status: summary.status,
      scheduledRent: summary.scheduledRent !== null ? summary.scheduledRent / 100 : null,
      recordedRent: summary.recordedRent !== null ? summary.recordedRent / 100 : null,
      outstandingRent: summary.outstandingRent !== null ? summary.outstandingRent / 100 : null,
      totalIncome: summary.totalIncome !== null ? summary.totalIncome / 100 : null,
      totalExpenses: summary.totalExpenses !== null ? summary.totalExpenses / 100 : null,
      netOperatingIncome: summary.netOperatingIncome !== null ? summary.netOperatingIncome / 100 : null,
      notes: summary.notes,
    };
  });

  // Get coverage calculation status for property and month
  fastify.get("/coverage", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, reply) => {
    const user = request.user!;
    const { propertyId, month } = request.query as { propertyId: string; month: string };
    if (!propertyId || !month) {
      return reply.code(400).send({ error: "propertyId and month query parameters are required" });
    }
    return getOrCalculatePropertyMonthCoverage(user.orgId, propertyId, month);
  });

  // Attest coverage status (Owner only)
  fastify.post("/coverage/attest", {
    preHandler: authorize(["owner"])
  }, async (request, reply) => {
    const user = request.user!;
    const { propertyId, month, targetState, reason } = request.body as {
      propertyId: string;
      month: string;
      targetState: "detail_complete" | "needs_review";
      reason?: string;
    };

    if (!propertyId || !month || !targetState) {
      return reply.code(400).send({ error: "Missing required parameters propertyId, month, targetState" });
    }

    try {
      const updated = await attestCoverageForMonth(
        user.orgId,
        user.id,
        user.role,
        propertyId,
        month,
        targetState,
        reason
      );
      return reply.code(200).send(updated);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // Get 6-month cash flow trends
  fastify.get("/trends", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const trends = await service.getPortfolioCashFlowTrends(user.orgId);
    return trends;
  });
}
