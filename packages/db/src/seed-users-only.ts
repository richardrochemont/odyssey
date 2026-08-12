import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import * as dotenv from "dotenv";
import * as schema from "./schema";

dotenv.config({ path: "../../.env" });

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/odyssey";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function main() {
  console.log("Seeding users only...");
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  // Clear existing data
  console.log("Clearing existing data...");
  await db.delete(schema.organizationInvitations);
  await db.delete(schema.organizationMemberships);
  await db.delete(schema.paymentAllocations);
  await db.delete(schema.charges);
  await db.delete(schema.importRows);
  await db.delete(schema.importRuns);
  await db.delete(schema.importSources);
  await db.delete(schema.auditLogs);
  await db.delete(schema.payments);
  await db.delete(schema.financialRecords);
  await db.delete(schema.tasks);
  await db.delete(schema.workOrders);
  await db.delete(schema.maintenanceRequests);
  await db.delete(schema.vendors);
  await db.delete(schema.leases);
  await db.delete(schema.tenants);
  await db.delete(schema.units);
  await db.delete(schema.buildings);
  await db.delete(schema.properties);
  await db.delete(schema.users);
  await db.delete(schema.organizations);

  // 1. Create Organization
  console.log("Creating organization...");
  const [org] = await db.insert(schema.organizations).values({
    name: "Odyssey Capital LLC",
    slug: "odyssey-capital-llc",
  }).returning();

  // 2. Create Users & Memberships
  console.log("Creating users & memberships...");
  const passwordHash = hashPassword("password123");
  
  const userDefs = [
    { email: "owner@odyssey.com", name: "Genevieve Hearth", role: "owner" as const },
    { email: "manager@odyssey.com", name: "Marcus Lane", role: "manager" as const },
    { email: "maintenance@odyssey.com", name: "Dave Fixer", role: "maintenance" as const },
    { email: "readonly@odyssey.com", name: "Investor Bob", role: "read_only" as const },
  ];

  for (const def of userDefs) {
    const [u] = await db.insert(schema.users).values({
      orgId: org.id,
      lastActiveOrgId: org.id,
      email: def.email,
      passwordHash,
      name: def.name,
      role: def.role,
    }).returning();

    await db.insert(schema.organizationMemberships).values({
      orgId: org.id,
      userId: u.id,
      role: def.role,
      status: "active",
    });
  }

  console.log("Database seeded successfully with users only!");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
