import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import * as service from "../services/payments";
import { PaymentCreateSchema } from "@odyssey/validation";

export default async function paymentRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  fastify.addHook("preHandler", authenticate);

  // List payments
  fastify.get("/", {
    preHandler: authorize(["owner", "manager", "read_only"])
  }, async (request, _reply) => {
    const user = request.user!;
    const list = await service.listPayments(user.orgId);
    
    // Format amounts back to dollar decimals
    return list.map((p) => ({
      ...p,
      amountDue: p.amountDue / 100,
      amountReceived: p.amountReceived / 100,
    }));
  });

  // Create payment
  fastify.post("/", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const parseResult = PaymentCreateSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    
    const payment = await service.createPayment(user.orgId, user.id, parseResult.data);
    
    return reply.code(201).send({
      ...payment,
      amountDue: payment.amountDue / 100,
      amountReceived: payment.amountReceived / 100,
    });
  });

  // Update payment
  fastify.put("/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    const parseResult = PaymentCreateSchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    
    try {
      const updated = await service.updatePayment(user.orgId, user.id, id, parseResult.data);
      return {
        ...updated,
        amountDue: updated.amountDue / 100,
        amountReceived: updated.amountReceived / 100,
      };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // Archive payment
  fastify.delete("/:id", {
    preHandler: authorize(["owner", "manager"])
  }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    try {
      await service.archivePayment(user.orgId, user.id, id);
      return { success: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });
}
