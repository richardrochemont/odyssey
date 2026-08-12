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
  }).returning();

  // 2. Create Users (Owner, Manager, Maintenance, Read Only)
  console.log("Creating users...");
  const passwordHash = hashPassword("password123");
  
  await db.insert(schema.users).values({
    orgId: org.id,
    email: "owner@odyssey.com",
    passwordHash,
    name: "Genevieve Hearth",
    role: "owner",
  });

  await db.insert(schema.users).values({
    orgId: org.id,
    email: "manager@odyssey.com",
    passwordHash,
    name: "Marcus Lane",
    role: "manager",
  });

  await db.insert(schema.users).values({
    orgId: org.id,
    email: "maintenance@odyssey.com",
    passwordHash,
    name: "Dave Fixer",
    role: "maintenance",
  });

  await db.insert(schema.users).values({
    orgId: org.id,
    email: "readonly@odyssey.com",
    passwordHash,
    name: "Investor Bob",
    role: "read_only",
  });

  console.log("Database seeded successfully with users only!");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
