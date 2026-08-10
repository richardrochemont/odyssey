import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import * as dotenv from "dotenv";
import { db, leases, tenants, units, tasks, properties, users } from "@hearthlane/db";
import { and, eq, isNull } from "drizzle-orm";

// Load env
dotenv.config({ path: "../../.env" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

console.log(`[Worker] Connecting to Redis at ${REDIS_URL}`);

const worker = new Worker(
  "hearthlane-jobs",
  async (job: Job) => {
    console.log(`[Worker] Processing job ${job.name} (id: ${job.id})`);
    
    if (job.name === "lease-expiry-check") {
      // Find all active non-archived leases
      const activeLeases = await db.select({
        id: leases.id,
        orgId: leases.orgId,
        unitId: leases.unitId,
        primaryTenantId: leases.primaryTenantId,
        endDate: leases.endDate,
        status: leases.status,
      })
      .from(leases)
      .where(and(eq(leases.status, "active"), isNull(leases.archivedAt)));

      console.log(`[Worker] Checking renewal windows for ${activeLeases.length} active leases...`);

      let processedCount = 0;
      for (const lease of activeLeases) {
        // Calculate days until expiry
        const msInDay = 24 * 60 * 60 * 1000;
        const daysUntilExpiry = Math.ceil((new Date(lease.endDate).getTime() - new Date().getTime()) / msInDay);

        if (daysUntilExpiry <= 90) {
          // Check if task already exists
          const [existingTask] = await db.select()
            .from(tasks)
            .where(and(
              eq(tasks.orgId, lease.orgId),
              eq(tasks.leaseId, lease.id),
              eq(tasks.type, "lease_renewal"),
              isNull(tasks.archivedAt)
            ));

          if (!existingTask) {
            // Find a user in the org to assign the task to (preferably owner or manager)
            const [ownerUser] = await db.select({ id: users.id })
              .from(users)
              .where(and(eq(users.orgId, lease.orgId), isNull(users.archivedAt)))
              .limit(1);

            const assignedUserId = ownerUser?.id;

            if (assignedUserId) {
              // Fetch tenant & unit for detailed task descriptions
              const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, lease.primaryTenantId));
              const [unit] = await db.select({ unitNumber: units.unitNumber, propertyId: units.propertyId }).from(units).where(eq(units.id, lease.unitId));
              
              let propNickname = "Property";
              let propId = null;
              if (unit) {
                const [prop] = await db.select({ nickname: properties.nickname }).from(properties).where(eq(properties.id, unit.propertyId));
                if (prop) propNickname = prop.nickname;
                propId = unit.propertyId;
              }

              const tenantName = tenant?.name || "Tenant";
              const dueDate = new Date(lease.endDate);
              dueDate.setDate(dueDate.getDate() - 60);
              const finalDueDate = dueDate.getTime() < Date.now() ? new Date() : dueDate;

              await db.insert(tasks).values({
                orgId: lease.orgId,
                title: `Lease Renewal Review: ${tenantName}`,
                description: `Automatic Worker Alert: Lease for ${tenantName} in ${propNickname} Unit ${unit?.unitNumber || ""} expires on ${new Date(lease.endDate).toLocaleDateString()}. Please initiate the renewal process.`,
                dueDate: finalDueDate,
                ownerId: assignedUserId,
                status: "todo",
                priority: "high",
                type: "lease_renewal",
                propertyId: propId,
                unitId: lease.unitId,
                tenantId: lease.primaryTenantId,
                leaseId: lease.id,
              });
            }
          }
        }
        processedCount++;
      }

      console.log(`[Worker] Completed lease renewal checks. Processed ${processedCount} leases.`);
      return { checked: activeLeases.length, generated: processedCount };
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.name} completed successfully.`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.name} failed:`, err);
});

console.log("[Worker] BullMQ Worker started successfully and listening for jobs on 'hearthlane-jobs' queue.");
