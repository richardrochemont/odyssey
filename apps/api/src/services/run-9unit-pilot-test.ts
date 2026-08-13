import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

process.env.DATABASE_URL = "postgres://postgres:password@localhost:5432/odyssey_9unit_pilot_test";

import { Client } from "pg";
import { execSync } from "child_process";
import crypto from "crypto";
import { processImportRunJob, parseCSV } from "./imports";
import { attestCoverageForMonth } from "./monthlySummaries";
import { CSV_TEMPLATES, generateCSVContent } from "./templates";
import * as assert from "assert";

async function run9UnitPilotTest() {
  console.log("=========================================================================");
  console.log("  9-UNIT DELRAY BEACH PILOT DATASET ACCEPTANCE TEST RUNNER");
  console.log("=========================================================================");

  // 1. Create fresh disposable database
  const sysClient = new Client({ connectionString: "postgres://postgres:password@localhost:5432/postgres" });
  await sysClient.connect();

  const testDbName = "odyssey_9unit_pilot_test";
  const testDbUrl = `postgres://postgres:password@localhost:5432/${testDbName}`;

  console.log(`\n--- SECTION 1: Creating Disposable Database "${testDbName}" ---`);
  await sysClient.query(`DROP DATABASE IF EXISTS ${testDbName};`);
  await sysClient.query(`CREATE DATABASE ${testDbName};`);
  await sysClient.end();

  console.log("Executing official migration runner: pnpm --filter @odyssey/db run db:migrate ...");
  const rawMigOutput = execSync("pnpm --filter @odyssey/db run db:migrate", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    encoding: "utf-8",
  });
  console.log("--- RAW MIGRATION OUTPUT ---");
  console.log(rawMigOutput.trim());
  console.log("----------------------------");

  const dbClient = new Client({ connectionString: testDbUrl });
  await dbClient.connect();
  dbClient.on("error", () => {}); // Silence connection termination error on drop

  // Seed Org & Users in test database
  const orgRes = await dbClient.query(`INSERT INTO organizations (name, slug) VALUES ('Delray Beach 9-Unit Pilot LLC', 'delray-9unit-pilot') RETURNING id;`);
  const orgId = orgRes.rows[0].id;

  const ownerRes = await dbClient.query(`INSERT INTO users (org_id, email, password_hash, name, role) VALUES ('${orgId}', 'owner@delray9unit.com', 'hash', 'Owner User', 'owner') RETURNING id;`);
  const ownerId = ownerRes.rows[0].id;

  const managerRes = await dbClient.query(`INSERT INTO users (org_id, email, password_hash, name, role) VALUES ('${orgId}', 'manager@delray9unit.com', 'hash', 'Manager User', 'manager') RETURNING id;`);
  const managerId = managerRes.rows[0].id;
  console.log(`  ✓ Seeded owner (${ownerId}) and manager (${managerId})`);

  // Create default import source
  const sourceRes = await dbClient.query(`
    INSERT INTO import_sources (org_id, name, type)
    VALUES ('${orgId}', 'CSV Manual Upload', 'csv_upload')
    RETURNING id;
  `);
  const sourceId = sourceRes.rows[0].id;

  // Helper to execute import run
  const runImportHelper = async (type: string, csvData: string) => {
    const parsed = parseCSV(csvData);
    if (parsed.length < 2) throw new Error("Invalid CSV data");
    const headers = parsed[0];
    const dataRows = parsed.slice(1);

    const runRes = await dbClient.query(`
      INSERT INTO import_runs (org_id, source_id, file_name, import_type, status, total_rows, processed_rows, failed_rows)
      VALUES ('${orgId}', '${sourceId}', '${type}_template.csv', '${type}', 'pending', ${dataRows.length}, 0, 0)
      RETURNING id;
    `);
    const runId = runRes.rows[0].id;

    for (let i = 0; i < dataRows.length; i++) {
      const rowValues = dataRows[i];
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => { rowObj[h.trim()] = (rowValues[idx] || "").trim(); });

      const fp = crypto.createHash("sha256").update(JSON.stringify(rowObj)).digest("hex");
      await dbClient.query(`
        INSERT INTO import_rows (org_id, run_id, row_number, raw_data, row_fingerprint, status)
        VALUES ('${orgId}', '${runId}', ${i + 1}, '${JSON.stringify(rowObj).replace(/'/g, "''")}', '${fp}', 'pending');
      `);
    }

    await processImportRunJob(runId, orgId, ownerId);
    return runId;
  };

  // -------------------------------------------------------------------------
  // 2. Initial Import Run (Run 1)
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 2: Initial Import Pass (Run 1) ---");
  await runImportHelper("properties", generateCSVContent(CSV_TEMPLATES.properties));
  await runImportHelper("units", generateCSVContent(CSV_TEMPLATES.units));
  await runImportHelper("tenants", generateCSVContent(CSV_TEMPLATES.tenants));
  await runImportHelper("leases", generateCSVContent(CSV_TEMPLATES.leases));
  await runImportHelper("monthly_summaries", generateCSVContent(CSV_TEMPLATES.monthly_summaries));
  await runImportHelper("payments", generateCSVContent(CSV_TEMPLATES.payments));
  await runImportHelper("expenses", generateCSVContent(CSV_TEMPLATES.expenses));

  const getFullCounts = async () => {
    const props = (await dbClient.query(`SELECT COUNT(*) FROM properties WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const uCount = (await dbClient.query(`SELECT COUNT(*) FROM units WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const tCount = (await dbClient.query(`SELECT COUNT(*) FROM tenants WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const lCount = (await dbClient.query(`SELECT COUNT(*) FROM leases WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const mCount = (await dbClient.query(`SELECT COUNT(*) FROM monthly_financial_summaries WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const pCount = (await dbClient.query(`SELECT COUNT(*) FROM payments WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const eCount = (await dbClient.query(`SELECT COUNT(*) FROM financial_records WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const cCount = (await dbClient.query(`SELECT COUNT(*) FROM charges WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
    const aCount = (await dbClient.query(`SELECT COUNT(*) FROM payment_allocations WHERE org_id = '${orgId}';`)).rows[0].count;

    const importedRows = (await dbClient.query(`SELECT COUNT(*) FROM import_rows WHERE org_id = '${orgId}' AND status = 'imported';`)).rows[0].count;
    const exactDupRows = (await dbClient.query(`SELECT COUNT(*) FROM import_rows WHERE org_id = '${orgId}' AND duplicate_classification = 'exact_duplicate';`)).rows[0].count;

    return {
      properties: parseInt(props, 10),
      units: parseInt(uCount, 10),
      tenants: parseInt(tCount, 10),
      leases: parseInt(lCount, 10),
      monthly_summaries: parseInt(mCount, 10),
      payments: parseInt(pCount, 10),
      expenses: parseInt(eCount, 10),
      charges: parseInt(cCount, 10),
      payment_allocations: parseInt(aCount, 10),
      imported_rows: parseInt(importedRows, 10),
      exact_duplicate_rows: parseInt(exactDupRows, 10),
    };
  };

  const countsRun1 = await getFullCounts();
  console.log("  ✓ Entity Counts after Run 1 (Initial Import):", countsRun1);
  assert.strictEqual(countsRun1.properties, 1, "Exactly 1 property imported");
  assert.strictEqual(countsRun1.units, 9, "EXACTLY 9 UNITS IMPORTED AFTER FIRST IMPORT");
  assert.strictEqual(countsRun1.tenants, 7, "Exactly 7 tenants imported for occupied units");
  assert.strictEqual(countsRun1.leases, 7, "Exactly 7 active leases imported");

  // Single property check for all 9 units
  const propRes = await dbClient.query(`SELECT id FROM properties WHERE org_id = '${orgId}' AND external_key = 'PROP_DELRAY_01';`);
  const propId = propRes.rows[0].id;

  const unitPropRes = await dbClient.query(`SELECT DISTINCT property_id FROM units WHERE org_id = '${orgId}' AND archived_at IS NULL;`);
  assert.strictEqual(unitPropRes.rows.length, 1, "Every unit resolves to the same single property");
  assert.strictEqual(unitPropRes.rows[0].property_id, propId, "Every unit property_id equals PROP_DELRAY_01 id");
  console.log("  ✓ Single property assertion: PASSED (All 9 units belong to PROP_DELRAY_01)");

  // -------------------------------------------------------------------------
  // 3. Exact Re-Import Pass (Run 2)
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 3: Exact Re-Import Pass (Run 2) ---");
  await runImportHelper("properties", generateCSVContent(CSV_TEMPLATES.properties));
  await runImportHelper("units", generateCSVContent(CSV_TEMPLATES.units));
  await runImportHelper("tenants", generateCSVContent(CSV_TEMPLATES.tenants));
  await runImportHelper("leases", generateCSVContent(CSV_TEMPLATES.leases));
  await runImportHelper("monthly_summaries", generateCSVContent(CSV_TEMPLATES.monthly_summaries));
  await runImportHelper("payments", generateCSVContent(CSV_TEMPLATES.payments));
  await runImportHelper("expenses", generateCSVContent(CSV_TEMPLATES.expenses));

  const countsRun2 = await getFullCounts();
  console.log("  ✓ Entity Counts after Run 2 (Re-Import):", countsRun2);

  assert.strictEqual(countsRun2.units, 9, "EXACTLY 9 UNITS EXIST AFTER RE-IMPORT");
  assert.strictEqual(countsRun1.properties, countsRun2.properties);
  assert.strictEqual(countsRun1.units, countsRun2.units);
  assert.strictEqual(countsRun1.tenants, countsRun2.tenants);
  assert.strictEqual(countsRun1.leases, countsRun2.leases);
  assert.strictEqual(countsRun1.monthly_summaries, countsRun2.monthly_summaries);
  assert.strictEqual(countsRun1.payments, countsRun2.payments);
  assert.strictEqual(countsRun1.expenses, countsRun2.expenses);
  console.log("  ✓ Idempotency proven! No duplicate entity created after re-import.");

  // -------------------------------------------------------------------------
  // 4. Financial Calculation & Reconciliation Totals Assertions
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 4: Financial & Reconciliation Calculation Assertions ---");

  // Sum May 2026 payments
  const paySumRes = await dbClient.query(`
    SELECT SUM(amount_received) AS total_paid
    FROM payments
    WHERE org_id = '${orgId}' AND property_id = '${propId}' AND coverage_month = '2026-05' AND archived_at IS NULL;
  `);
  const totalPaymentsCents = parseInt(paySumRes.rows[0].total_paid, 10);
  assert.strictEqual(totalPaymentsCents, 1360000, "May 2026 collected rent total equals $13,600.00 (1360000 cents)");

  // Sum May 2026 expenses
  const expSumRes = await dbClient.query(`
    SELECT SUM(amount) AS total_expenses
    FROM financial_records
    WHERE org_id = '${orgId}' AND property_id = '${propId}' AND TO_CHAR(paid_date, 'YYYY-MM') = '2026-05' AND archived_at IS NULL;
  `);
  const totalExpensesCents = parseInt(expSumRes.rows[0].total_expenses, 10);
  assert.strictEqual(totalExpensesCents, 155000, "May 2026 expenses total equals $1,550.00 (155000 cents)");

  const noiCents = totalPaymentsCents - totalExpensesCents;
  assert.strictEqual(noiCents, 1205000, "May 2026 Net Operating Income equals $12,050.00 (1205000 cents)");
  console.log("  ✓ Reconciliation totals verified at property/month level (Rent: $13,600.00, Expenses: $1,550.00, NOI: $12,050.00)!");

  // Attest May 2026 coverage by Owner
  await attestCoverageForMonth(orgId, ownerId, "owner", propId, "2026-05", "detail_complete", "Pilot 9-unit owner signoff");
  const covRes = await dbClient.query(`SELECT state FROM property_month_financial_coverages WHERE org_id = '${orgId}' AND property_id = '${propId}' AND month = '2026-05';`);
  assert.strictEqual(covRes.rows[0].state, "detail_complete");
  console.log("  ✓ Property month coverage state 'detail_complete' attested by Owner!");

  // Clean up
  console.log(`\n--- SECTION 5: Dropping Disposable Database "${testDbName}" ---`);
  const sysClient2 = new Client({ connectionString: "postgres://postgres:password@localhost:5432/postgres" });
  await sysClient2.connect();

  await sysClient2.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${testDbName}' AND pid <> pg_backend_pid();
  `);

  await sysClient2.query(`DROP DATABASE ${testDbName};`);
  await sysClient2.end();
  console.log(`✓ Disposable database "${testDbName}" dropped cleanly.`);

  console.log("\n=========================================================================");
  console.log("  9-UNIT PILOT DATASET ACCEPTANCE TEST PASSED 100%!");
  console.log("=========================================================================");
}

run9UnitPilotTest().catch((err) => {
  console.error("9-unit pilot test runner failed:", err);
  process.exit(1);
});
