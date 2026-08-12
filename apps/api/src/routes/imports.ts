import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/imports";

export default async function importRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // Get or create default CSV source
  fastify.get("/sources/default", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, _reply) => {
    const user = request.user!;
    return service.getOrCreateDefaultCSVSource(user.orgId, user.id);
  });

  // Preview CSV headers and rows
  fastify.post("/preview", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const { csv } = request.body as { csv: string };
    if (!csv) return reply.code(400).send({ error: "Missing CSV content" });
    try {
      return await service.getCSVPreview(csv);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // Create an Import Run
  fastify.post("/runs", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { sourceId, fileName, importType, csv, columnMapping } = request.body as {
      sourceId: string;
      fileName: string;
      importType: any;
      csv: string;
      columnMapping: Record<string, string>;
    };

    if (!sourceId || !fileName || !importType || !csv || !columnMapping) {
      return reply.code(400).send({ error: "Missing required parameters" });
    }

    try {
      const run = await service.createImportRun(
        user.orgId,
        user.id,
        sourceId,
        fileName,
        importType,
        csv,
        columnMapping
      );
      return reply.code(201).send(run);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // List Import Runs
  fastify.get("/runs", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, _reply) => {
    const user = request.user!;
    return service.listImportRuns(user.orgId);
  });

  // Get Import Run details
  fastify.get("/runs/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const details = await service.getImportRunDetails(user.orgId, id);
    if (!details) return reply.code(404).send({ error: "Import run not found" });
    return details;
  });

  // Reconciliation statistics
  fastify.get("/reconciliation", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    return service.getReconciliationStatus(user.orgId);
  });
}
