import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { db, payments, leases, units } from "@odyssey/db";
import { eq } from "drizzle-orm";
import { logAction } from "../services/audit";
import { paymentProvider } from "../services/provider";
import { allocatePaymentToCharges } from "../services/imports";

export default async function webhookRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // Webhook listener for Stripe integrations
  // Note: No authentication middleware is applied since webhooks are called externally.
  // We verify authenticity using signature headers.
  fastify.post("/stripe", async (request, reply) => {
    const signature = request.headers["stripe-signature"] as string;
    if (!signature) {
      return reply.code(400).send({ error: "Missing signature header" });
    }

    const payload = JSON.stringify(request.body);
    const isValid = await paymentProvider.verifyWebhookSignature(payload, signature);
    if (!isValid) {
      return reply.code(401).send({ error: "Invalid webhook signature" });
    }

    try {
      const event = await paymentProvider.parseWebhook(request.body);
      const { providerId, amount, status, leaseId, tenantId, idempotencyKey } = event;

      // 1. Idempotency Check
      const [existing] = await db.select()
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        console.log(`[Webhooks - Stripe] Duplicate webhook event ignored. Key: ${idempotencyKey}`);
        return reply.code(200).send({ status: "ignored", reason: "duplicate" });
      }

      // Resolve payment details (we fetch lease to get unit & property references)
      const [lease] = await db.select()
        .from(leases)
        .where(eq(leases.id, leaseId))
        .limit(1);

      if (!lease) {
        return reply.code(404).send({ error: "Referenced lease not found" });
      }

      // Fetch the unit to get the propertyId
      const [unit] = await db.select()
        .from(units)
        .where(eq(units.id, lease.unitId))
        .limit(1);

      if (!unit) {
        return reply.code(404).send({ error: "Referenced unit not found" });
      }

      // 2. Insert payment record from verified webhook event
      const [payment] = await db.insert(payments).values({
        orgId: lease.orgId,
        tenantId,
        leaseId,
        propertyId: unit.propertyId,
        unitId: lease.unitId,
        amountReceived: amount,
        paidDate: new Date(),
        paymentMethod: "ach", // Autopay/ACH
        status: status === "paid" ? "paid" : "failed",
        providerId,
        source: "provider",
        idempotencyKey,
      }).returning();

      console.log(`[Webhooks - Stripe] Recorded webhook payment ${payment.id} ($${(amount / 100).toFixed(2)})`);

      // 3. FIFO allocation of funds to charges
      if (status === "paid") {
        await allocatePaymentToCharges(lease.orgId, payment.id, tenantId, amount);
      }

      // 4. Record audit log
      await logAction({
        orgId: lease.orgId,
        userId: "00000000-0000-0000-0000-000000000000", // System actions use nil UUID
        entityType: "payment",
        entityId: payment.id,
        action: "webhook_callback",
        newState: payment,
      });

      return { status: "success", paymentId: payment.id };
    } catch (e: any) {
      console.error(`[Webhooks - Stripe] Processing failed:`, e.message);
      return reply.code(500).send({ error: "Webhook processing error", details: e.message });
    }
  });
}
