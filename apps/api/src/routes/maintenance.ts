import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/maintenance";
import { MaintenanceRequestCreateSchema, WorkOrderCreateSchema, VendorCreateSchema, MaintenanceStatusEnum, WorkOrderStatusEnum } from "@hearthlane/validation";
import { z } from "zod";

export default async function maintenanceRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // Vendors - List
  fastify.get("/vendors", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const vendorsList = await service.listVendors(user.orgId);
    return vendorsList;
  });

  // Vendors - Create
  fastify.post("/vendors", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = VendorCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const vendor = await service.createVendor(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(vendor);
  });

  // Requests - List
  fastify.get("/requests", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const requests = await service.listRequests(user.orgId);
    return requests;
  });

  // Requests - Get details and work orders
  fastify.get("/requests/:id", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const details = await service.getRequestDetails(user.orgId, id);
    if (!details) {
      return reply.code(404).send({ error: "Maintenance request not found" });
    }
    return details;
  });

  // Requests - Create
  fastify.post("/requests", {
    preHandler: authorize(["owner", "manager", "maintenance"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = MaintenanceRequestCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const req = await service.createRequest(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(req);
  });

  // Requests - Update Status (kanban transitions)
  fastify.put("/requests/:id/status", {
    preHandler: authorize(["owner", "manager", "maintenance"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    const schema = z.object({ status: MaintenanceStatusEnum });
    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    try {
      const updated = await service.updateRequestStatus(user.orgId, user.id, id, parseResult.data.status);
      return updated;
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Work Orders - Create (convert request to WO, assign vendor)
  fastify.post("/work-orders", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = WorkOrderCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const wo = await service.createWorkOrder(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(wo);
  });

  // Work Orders - Update Status (owner, manager, maintenance)
  fastify.put("/work-orders/:id/status", {
    preHandler: authorize(["owner", "manager", "maintenance"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    const schema = z.object({ status: WorkOrderStatusEnum });
    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    try {
      const updated = await service.updateWorkOrderStatus(user.orgId, user.id, id, parseResult.data.status);
      return updated;
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });
}
