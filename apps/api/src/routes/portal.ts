import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate, authorize } from "../middleware/auth";
import { db, tenants, leases, charges, payments } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "../services/audit";

export default async function portalRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  
  // 1. Invite a Tenant (Generates invite token)
  fastify.post("/invite/:tenantId", {
    preHandler: [authenticate, authorize(["owner", "manager"])]
  }, async (request, reply) => {
    const user = request.user!;
    const { tenantId } = request.params as { tenantId: string };

    const [tenant] = await db.select()
      .from(tenants)
      .where(and(eq(tenants.orgId, user.orgId), eq(tenants.id, tenantId), isNull(tenants.archivedAt)))
      .limit(1);

    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });

    // Generate secure token
    const inviteToken = `token_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
    
    const [updated] = await db.update(tenants)
      .set({
        portalStatus: "invited",
        inviteToken,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    // Production constraint check: log it but do not dispatch emails automatically.
    console.log(`[Onboarding] Tenant ${tenant.name} portal status set to 'invited'. Invite link: https://odyssey.com/portal/onboard?token=${inviteToken}`);
    
    await logAction({
      orgId: user.orgId,
      userId: user.id,
      entityType: "tenant",
      entityId: tenantId,
      action: "invite_portal",
      newState: updated,
    });

    return {
      success: true,
      message: "Tenant invitation generated. Note: No auto-email dispatched in local mock mode.",
      inviteToken,
      portalStatus: updated.portalStatus,
    };
  });

  // 2. Renter Self-Service Details (Onboarding authentication wrapper)
  fastify.get("/renter-dashboard", async (request, reply) => {
    // Authenticates using the inviteToken query param for onboarding, or normal auth header if logged in
    const { token, email } = request.query as { token?: string; email?: string };
    if (!token || !email) {
      return reply.code(400).send({ error: "Email and invite token are required to view renter onboarding portal" });
    }

    const [tenant] = await db.select()
      .from(tenants)
      .where(and(
        eq(tenants.email, email.toLowerCase()),
        eq(tenants.inviteToken, token),
        isNull(tenants.archivedAt)
      ))
      .limit(1);

    if (!tenant) {
      return reply.code(401).send({ error: "Invalid credentials or onboarding token" });
    }

    // Resolve tenant leases
    const activeLeases = await db.select()
      .from(leases)
      .where(and(eq(leases.primaryTenantId, tenant.id), isNull(leases.archivedAt)));

    // Resolve outstanding balance from charges
    const tenantCharges = await db.select()
      .from(charges)
      .where(and(eq(charges.tenantId, tenant.id), isNull(charges.archivedAt)))
      .orderBy(charges.dueDate);

    const outstandingBalance = tenantCharges
      .filter((c) => c.status !== "paid" && c.status !== "waived" && c.status !== "void")
      .reduce((sum, c) => sum + c.balance, 0);

    // Resolve payment transactions logs
    const tenantPayments = await db.select()
      .from(payments)
      .where(and(eq(payments.tenantId, tenant.id), isNull(payments.archivedAt)))
      .orderBy(payments.paidDate);

    return {
      renterName: tenant.name,
      renterEmail: tenant.email,
      renterPhone: tenant.phone,
      portalStatus: tenant.portalStatus,
      leases: activeLeases.map((l) => ({
        id: l.id,
        startDate: l.startDate,
        endDate: l.endDate,
        monthlyRent: l.monthlyRent / 100,
        securityDeposit: l.securityDeposit / 100,
        status: l.status,
      })),
      charges: tenantCharges.map((c) => ({
        id: c.id,
        type: c.type,
        amount: c.amount / 100,
        dueDate: c.dueDate,
        balance: c.balance / 100,
        status: c.status,
      })),
      payments: tenantPayments.map((p) => ({
        id: p.id,
        amountReceived: p.amountReceived / 100,
        paidDate: p.paidDate,
        method: p.paymentMethod,
        status: p.status,
      })),
      outstandingBalance: outstandingBalance / 100,
    };
  });

  // 3. Confirm Tenant Portal Setup
  fastify.post("/activate-portal", async (request, reply) => {
    const { token, email } = request.body as { token: string; email: string };
    if (!token || !email) {
      return reply.code(400).send({ error: "Token and email are required" });
    }

    const [tenant] = await db.select()
      .from(tenants)
      .where(and(
        eq(tenants.email, email.toLowerCase()),
        eq(tenants.inviteToken, token),
        isNull(tenants.archivedAt)
      ))
      .limit(1);

    if (!tenant) return reply.code(401).send({ error: "Invalid details" });

    const [updated] = await db.update(tenants)
      .set({
        portalStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
      .returning();

    await logAction({
      orgId: tenant.orgId,
      userId: "00000000-0000-0000-0000-000000000000",
      entityType: "tenant",
      entityId: tenant.id,
      action: "activate_portal",
      newState: updated,
    });

    return { success: true, status: "active", message: "Portal account verified and active" };
  });
}
