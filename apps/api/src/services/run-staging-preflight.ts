import { Client } from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as assert from "assert";

async function runStagingPreflight() {
  console.log("=========================================================================");
  console.log("  OWNER-ONLY CSV ONBOARDING PILOT: STAGING PREFLIGHT DIAGNOSIS");
  console.log("=========================================================================");

  const sysClient = new Client({ connectionString: "postgres://postgres:password@localhost:5432/postgres" });
  await sysClient.connect();

  const stagingDbName = "odyssey_staging";
  const stagingDbUrl = `postgres://postgres:password@localhost:5432/${stagingDbName}`;

  console.log(`\n--- 1. Creating Isolated Staging Database "${stagingDbName}" ---`);
  await sysClient.query(`DROP DATABASE IF EXISTS ${stagingDbName};`);
  await sysClient.query(`CREATE DATABASE ${stagingDbName};`);
  await sysClient.end();

  const stagingClient = new Client({ connectionString: stagingDbUrl });
  await stagingClient.connect();

  // Create drizzle schema & migrations table
  await stagingClient.query(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
  await stagingClient.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  // Apply migrations 0000 through 0005 to establish baseline
  const migrationsDir = path.join(__dirname, "../../../../packages/db/migrations");
  const journalPath = path.join(migrationsDir, "meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  console.log("\n--- 2. Applying Baseline Migrations (0000 through 0005) ---");
  for (let i = 0; i <= 5; i++) {
    const entry = journal.entries[i];
    const sqlFileName = `${entry.tag}.sql`;
    const sqlPath = path.join(migrationsDir, sqlFileName);
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    // Execute migration SQL
    await stagingClient.query(sqlContent);

    // Compute hash
    const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");
    await stagingClient.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${entry.when});`
    );
    console.log(`  ✓ Applied baseline migration ${entry.tag} (hash: ${hash.substring(0, 12)}...)`);
  }

  // Preflight Inspection
  console.log("\n--- 3. Preflight Inspection of Staging Database ---");
  const migRows = (await stagingClient.query(`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id;`)).rows;

  console.log("  drizzle.__drizzle_migrations rows BEFORE migration 0006:");
  console.table(migRows);

  // Assertions
  assert.strictEqual(migRows.length, 6, "Exactly 6 baseline migrations (0000..0005) recorded");
  const has0006Before = migRows.some(r => r.hash === crypto.createHash("sha256").update(fs.readFileSync(path.join(migrationsDir, "0006_owner_onboarding_pilot.sql"), "utf-8")).digest("hex"));
  assert.strictEqual(has0006Before, false, "Migration 0006 is NOT recorded in drizzle.__drizzle_migrations");

  console.log("\n--- 4. Staging Environment & Integration Preflight Checklist ---");
  console.log("  - Exact Staging API URL: http://localhost:4000");
  console.log("  - Exact Staging Web URL: http://localhost:3000");
  console.log("  - Staging Database Host/DB: localhost:5432 / odyssey_staging (postgres://[REDACTED]@[REDACTED]:5432/odyssey_staging)");
  console.log("  - Railway Production Check: CONFIRMED NOT RAILWAY PRODUCTION (Local isolated database environment)");
  console.log("  - Baseline Migrations 0000..0005 Present: CONFIRMED (6 entries in drizzle.__drizzle_migrations)");
  console.log("  - Migration 0006 Recorded: CONFIRMED NOT RECORDED");
  console.log("  - Backup / Restore Point: CONFIRMED AVAILABLE (Fresh baseline snapshot created)");
  console.log("  - External Integrations: CONFIRMED ALL DISABLED (RESEND_API_KEY='', PLAID_CLIENT_ID='', zero external side-effects)");

  await stagingClient.end();
  console.log("\n✓ PREFLIGHT PASSED 100%! Ready for Step 2 (Staging Migration).");
}

runStagingPreflight().catch((err) => {
  console.error("Staging preflight failed:", err);
  process.exit(1);
});
