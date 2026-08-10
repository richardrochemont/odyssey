import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/properties";
import { PropertyCreateSchema, BuildingCreateSchema, UnitCreateSchema } from "@hearthlane/validation";

export default async function propertyRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // Apply authenticate middleware to all routes in this plugin
  fastify.addHook("preHandler", authenticate);

  // List properties
  fastify.get("/", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const properties = await service.listProperties(user.orgId);
    return properties;
  });

  // Get property details (including buildings, units)
  fastify.get("/:id", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const details = await service.getPropertyDetails(user.orgId, id);
    if (!details) {
      return reply.code(404).send({ error: "Property not found" });
    }
    return details;
  });

  // Create property
  fastify.post("/", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = PropertyCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const property = await service.createProperty(user.orgId, user.id, parseResult.data);
    return reply.code(211).code(201).send(property);
  });

  // Update property
  fastify.put("/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const parseResult = PropertyCreateSchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    try {
      const updated = await service.updateProperty(user.orgId, user.id, id, parseResult.data);
      return updated;
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Archive property
  fastify.delete("/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await service.archiveProperty(user.orgId, user.id, id);
      return { success: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Buildings - Create
  fastify.post("/buildings", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = BuildingCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const building = await service.createBuilding(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(building);
  });

  // Buildings - Archive
  fastify.delete("/buildings/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await service.archiveBuilding(user.orgId, user.id, id);
      return { success: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Units - Create
  fastify.post("/units", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = UnitCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const unit = await service.createUnit(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(unit);
  });

  // Units - Update (Owner, manager, and maintenance can change unit status/details)
  fastify.put("/units/:id", {
    preHandler: authorize(["owner", "manager", "maintenance"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const parseResult = UnitCreateSchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    try {
      const updated = await service.updateUnit(user.orgId, user.id, id, parseResult.data);
      return updated;
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Units - Archive
  fastify.delete("/units/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await service.archiveUnit(user.orgId, user.id, id);
      return { success: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });
}
