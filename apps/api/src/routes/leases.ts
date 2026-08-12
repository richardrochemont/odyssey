import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/leases";
import { LeaseCreateSchema, LeaseCreateBaseSchema, TenantCreateSchema } from "@odyssey/validation";

export default async function leaseRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // Tenants - List
  fastify.get("/tenants", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const tenants = await service.listTenants(user.orgId);
    return tenants;
  });

  // Tenants - Get details & history
  fastify.get("/tenants/:id", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const details = await service.getTenantDetails(user.orgId, id);
    if (!details) {
      return reply.code(404).send({ error: "Tenant not found" });
    }
    return details;
  });

  // Tenants - Create
  fastify.post("/tenants", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = TenantCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const tenant = await service.createTenant(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(tenant);
  });

  // Leases - List
  fastify.get("/", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const leasesList = await service.listLeases(user.orgId);
    
    // Attach warning meta details
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    
    return leasesList.map((lease) => {
      const end = new Date(lease.endDate);
      const daysUntilExpiry = Math.ceil((end.getTime() - now.getTime()) / msInDay);
      return {
        ...lease,
        monthlyRent: lease.monthlyRent / 100, // convert back to dollars
        securityDeposit: lease.securityDeposit / 100,
        daysUntilExpiry,
        isExpiringSoon: daysUntilExpiry <= 90 && lease.status === "active",
      };
    });
  });

  // Leases - Get Details
  fastify.get("/:id", {
    preHandler: authorize(["owner", "manager", "maintenance", "read_only"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const lease = await service.getLeaseDetails(user.orgId, id);
    if (!lease) {
      return reply.code(404).send({ error: "Lease not found" });
    }
    
    const end = new Date(lease.endDate);
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry = Math.ceil((end.getTime() - now.getTime()) / msInDay);

    return {
      ...lease,
      monthlyRent: lease.monthlyRent / 100, // convert back to dollars
      securityDeposit: lease.securityDeposit / 100,
      daysUntilExpiry,
      isExpiringSoon: daysUntilExpiry <= 90 && lease.status === "active",
    };
  });

  // Leases - Create
  fastify.post("/", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = LeaseCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    const lease = await service.createLease(user.orgId, user.id, parseResult.data);
    return reply.code(201).send(lease);
  });

  // Leases - Update
  fastify.put("/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const parseResult = LeaseCreateBaseSchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    try {
      const updated = await service.updateLease(user.orgId, user.id, id, parseResult.data);
      return updated;
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Leases - Archive
  fastify.delete("/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await service.archiveLease(user.orgId, user.id, id);
      return { success: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });
}
