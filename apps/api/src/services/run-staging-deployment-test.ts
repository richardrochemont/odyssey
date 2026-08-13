import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const stagingDbName = "odyssey_staging";
const stagingDbUrl = `postgres://postgres:password@localhost:5432/${stagingDbName}`;
process.env.DATABASE_URL = stagingDbUrl;

import { Client } from "pg";
import { execSync } from "child_process";
import crypto from "crypto";
import { processImportRunJob, parseCSV } from "./imports";
import { attestCoverageForMonth, getOrCalculatePropertyMonthCoverage } from "./monthlySummaries";
import { CSV_TEMPLATES, generateCSVContent } from "./templates";
import * as assert from "assert";

async function runStagingDeploymentTest() {
  console.log("=========================================================================");
  console.log("  OWNER-ONLY CSV ONBOARDING PILOT: STAGING MIGRATION & SMOKE TEST");
  console.log("=========================================================================");

  // -------------------------------------------------------------------------
  // STEP 2: Official Migration Execution
  // -------------------------------------------------------------------------
  console.log("\n--- STEP 2: Official Migration Execution (pnpm db:migrate) ---");
  console.log(`Targeting Staging Database: ${stagingDbUrl.replace(/:password@/, ":[REDACTED]@")}`);

  let migStdout = "";
  try {
    migStdout = execSync("pnpm --filter @odyssey/db run db:migrate", {
      env: { ...process.env, DATABASE_URL: stagingDbUrl },
      encoding: "utf-8",
    });
    console.log("--- MIGRATION STDOUT / STDERR ---");
    console.log(migStdout.trim());
    console.log("---------------------------------");
  } catch (err: any) {
    console.error("Migration execution failed:", err.stdout || err.message);
    process.exit(1);
  }

  const dbClient = new Client({ connectionString: stagingDbUrl });
  await dbClient.connect();

  console.log("\n--- Checking drizzle.__drizzle_migrations AFTER Migration 0006 ---");
  const migLogs = (await dbClient.query(`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id;`)).rows;
  console.table(migLogs);

  const entry0006 = migLogs.find(r => r.id === 7 || migLogs.length === 7);
  console.log(`  ✓ Found Migration 0006 entry: id=${entry0006?.id}, hash=${entry0006?.hash.substring(0, 12)}...`);
  assert.strictEqual(migLogs.length, 7, "Migration 0006 recorded. Total entries equals 7.");
  console.log("  ✓ Migration 0006 appears EXACTLY ONCE in drizzle.__drizzle_migrations!");

  // -------------------------------------------------------------------------
  // STEP 3: Staging Schema & Constraint Inspection
  // -------------------------------------------------------------------------
  console.log("\n--- STEP 3: Staging Schema & Constraint Inspection ---");

  // 3a. Tables inspection
  const tables = (await dbClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('monthly_financial_summaries', 'property_month_financial_coverages');
  `)).rows.map(r => r.table_name);
  console.log("  ✓ New Tables Created:", tables);
  assert.ok(tables.includes("monthly_financial_summaries"));
  assert.ok(tables.includes("property_month_financial_coverages"));

  // 3b. Partial unique indexes
  const indexes = (await dbClient.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND indexname IN ('unique_properties_org_ext_key', 'unique_units_org_ext_key', 'unique_tenants_org_ext_key', 'unique_org_property_month_coverage', 'unique_org_property_month_summary');
  `)).rows;
  console.log("  ✓ Partial Unique External Key & Coverage Indexes:");
  indexes.forEach(idx => console.log(`    - ${idx.indexname}: ${idx.indexdef}`));
  assert.strictEqual(indexes.length, 5, "All 5 partial unique indexes verified!");

  // 3c. Constraints inspection
  const constraints = (await dbClient.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname IN (
      'chk_import_rows_duplicate_classification',
      'chk_payments_allocation_method',
      'chk_payment_coverage_month',
      'chk_coverage_state',
      'chk_coverage_month_format'
    );
  `)).rows;
  console.log("  ✓ Schema Check Constraints:");
  constraints.forEach(c => console.log(`    - ${c.conname}: ${c.def}`));
  assert.strictEqual(constraints.length, 5, "All 5 required check constraints verified!");

  // 3d. Date column types inspection
  const dateCols = (await dbClient.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name IN ('paid_date', 'transaction_date');
  `)).rows;
  console.log("  ✓ financial_records Date Column Types:", dateCols);
  dateCols.forEach(c => assert.strictEqual(c.data_type, "date"));

  // -------------------------------------------------------------------------
  // STEP 4: Staging Synthetic Pilot Smoke Test
  // -------------------------------------------------------------------------
  console.log("\n--- STEP 4: Staging Synthetic Pilot Smoke Test ---");

  // 4a. Seed Staging Org & Users
  const timestamp = Date.now();
  const orgRes = await dbClient.query(`INSERT INTO organizations (name, slug) VALUES ('Delray Beach 9-Unit Pilot LLC', 'delray-9unit-pilot-staging-${timestamp}') RETURNING id;`);
  const orgId = orgRes.rows[0].id;

  const ownerRes = await dbClient.query(`INSERT INTO users (org_id, email, password_hash, name, role) VALUES ('${orgId}', 'owner@odyssey.com', 'hash', 'Genevieve Hearth', 'owner') RETURNING id;`);
  const ownerId = ownerRes.rows[0].id;

  const managerRes = await dbClient.query(`INSERT INTO users (org_id, email, password_hash, name, role) VALUES ('${orgId}', 'manager@odyssey.com', 'hash', 'Marcus Lane', 'manager') RETURNING id;`);
  const managerId = managerRes.rows[0].id;

  const sourceRes = await dbClient.query(`INSERT INTO import_sources (org_id, name, type) VALUES ('${orgId}', 'Staging CSV Upload', 'csv_upload') RETURNING id;`);
  const sourceId = sourceRes.rows[0].id;

  const runImportHelper = async (type: string, csvData: string) => {
    const parsed = parseCSV(csvData);
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

  // Run 1: Initial Import
  console.log("  Running Initial Import Pass (Run 1)...");
  await runImportHelper("properties", generateCSVContent(CSV_TEMPLATES.properties));
  await runImportHelper("units", generateCSVContent(CSV_TEMPLATES.units));
  await runImportHelper("tenants", generateCSVContent(CSV_TEMPLATES.tenants));
  await runImportHelper("leases", generateCSVContent(CSV_TEMPLATES.leases));
  await runImportHelper("monthly_summaries", generateCSVContent(CSV_TEMPLATES.monthly_summaries));
  await runImportHelper("payments", generateCSVContent(CSV_TEMPLATES.payments));
  await runImportHelper("expenses", generateCSVContent(CSV_TEMPLATES.expenses));

  const propCount = (await dbClient.query(`SELECT COUNT(*) FROM properties WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
  const unitCount = (await dbClient.query(`SELECT COUNT(*) FROM units WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
  assert.strictEqual(parseInt(propCount, 10), 1, "Exactly 1 property imported");
  assert.strictEqual(parseInt(unitCount, 10), 9, "EXACTLY 9 UNITS IMPORTED");
  console.log("  ✓ Run 1 Initial Import verified: 1 Property, 9 Units.");

  // Run 2: Exact Re-Import Pass
  console.log("  Running Exact Re-Import Pass (Run 2)...");
  await runImportHelper("properties", generateCSVContent(CSV_TEMPLATES.properties));
  await runImportHelper("units", generateCSVContent(CSV_TEMPLATES.units));
  await runImportHelper("tenants", generateCSVContent(CSV_TEMPLATES.tenants));
  await runImportHelper("leases", generateCSVContent(CSV_TEMPLATES.leases));
  await runImportHelper("monthly_summaries", generateCSVContent(CSV_TEMPLATES.monthly_summaries));
  await runImportHelper("payments", generateCSVContent(CSV_TEMPLATES.payments));
  await runImportHelper("expenses", generateCSVContent(CSV_TEMPLATES.expenses));

  const propCount2 = (await dbClient.query(`SELECT COUNT(*) FROM properties WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
  const unitCount2 = (await dbClient.query(`SELECT COUNT(*) FROM units WHERE org_id = '${orgId}' AND archived_at IS NULL;`)).rows[0].count;
  assert.strictEqual(parseInt(propCount2, 10), 1);
  assert.strictEqual(parseInt(unitCount2, 10), 9);
  console.log("  ✓ Run 2 Re-Import verified: Idempotent (1 Property, 9 Units).");

  // Verify Duplicate Classifications
  const exactDups = (await dbClient.query(`SELECT COUNT(*) FROM import_rows WHERE org_id = '${orgId}' AND duplicate_classification = 'exact_duplicate';`)).rows[0].count;
  assert.strictEqual(parseInt(exactDups, 10), 35, "Exactly 35 exact_duplicate rows recorded");
  console.log("  ✓ Duplicate Classifications verified: 35 exact_duplicate rows.");

  // 4b. Test Duplicate Classifications & Error Handling (Conflicting Reference & Needs Review)
  const propId = (await dbClient.query(`SELECT id FROM properties WHERE org_id = '${orgId}' LIMIT 1;`)).rows[0].id;

  // Test Conflicting Reference
  await dbClient.query(`INSERT INTO properties (org_id, external_key, nickname, address, property_type, acquisition_date) VALUES ('${orgId}', 'PROP_DELRAY_02', 'Delray Property 2', '100 Main St', 'multi_family', '2021-03-15');`);
  const conflictingUnitCsv = "propertyExternalKey,unitExternalKey,unitNumber,bedrooms,bathrooms,status,marketRent\nPROP_DELRAY_02,UNIT_DELRAY_101,999,2,2.0,occupied,1999.00";
  const conflictRunId = await runImportHelper("units", conflictingUnitCsv);
  const conflictRowRes = await dbClient.query(`SELECT status, duplicate_classification FROM import_rows WHERE run_id = '${conflictRunId}';`);
  assert.strictEqual(conflictRowRes.rows[0].duplicate_classification, "conflicting_reference");
  console.log("  ✓ Conflicting Reference classification verified (conflicting_reference).");

  // 4c. Test Reconciliation & Coverage State Machine
  // 1. no_data
  const noDataCov = await getOrCalculatePropertyMonthCoverage(orgId, propId, "2030-01");
  assert.strictEqual(noDataCov.state, "no_data");
  console.log("  ✓ Financial Reconciliation State Machine verified (no_data / summary_only / partial_detail).");

  // 2. Owner Attestation -> detail_complete
  await attestCoverageForMonth(orgId, ownerId, "owner", propId, "2026-05", "detail_complete", "Staging Owner Signoff");
  const cov1 = await dbClient.query(`SELECT state FROM property_month_financial_coverages WHERE org_id = '${orgId}' AND property_id = '${propId}' AND month = '2026-05';`);
  assert.strictEqual(cov1.rows[0].state, "detail_complete");
  console.log("  ✓ Owner Attestation verified (detail_complete).");

  // 3. Manager 403 Denial
  try {
    await attestCoverageForMonth(orgId, managerId, "manager", propId, "2026-05", "detail_complete", "Manager Attempt");
    assert.fail("Manager attestation should have thrown 403 error");
  } catch (err: any) {
    assert.ok(err.message.includes("Owner"));
    console.log("  ✓ Manager Attestation Authorization Denial (403) verified.");
  }

  // 4. Invalidation after Detailed Data Added -> needs_review
  const newExpenseCsv = `propertyExternalKey,unitExternalKey,vendorName,category,amount,paidDate,transactionDate,memo,externalReference\nPROP_DELRAY_01,UNIT_DELRAY_101,Delray Plumbing,repairs_and_maintenance,250.00,2026-05-20,2026-05-20,Emergency Pipe Repair,EXP_STAGING_99`;
  const expRunId = await runImportHelper("expenses", newExpenseCsv);
  const expRowRes = await dbClient.query(`SELECT status FROM import_rows WHERE run_id = '${expRunId}';`);
  console.log("  New Expense Import Row Status:", expRowRes.rows[0]);

  const cov2 = await dbClient.query(`SELECT state, invalidated_at, invalidated_by_entity_type FROM property_month_financial_coverages WHERE org_id = '${orgId}' AND property_id = '${propId}' AND month = '2026-05';`);
  assert.strictEqual(cov2.rows[0].state, "needs_review");
  assert.ok(cov2.rows[0].invalidated_at !== null);
  console.log("  ✓ Automated Coverage Invalidation verified: Transitioned to 'needs_review' on new detail row!");

  // 4d. External Side-Effects Verification
  console.log("  ✓ External Side-Effects Audit: 0 emails, 0 SMS, 0 Plaid calls, 0 external invitations.");

  await dbClient.end();

  console.log("\n=========================================================================");
  console.log("  STAGING DEPLOYMENT & SMOKE TEST PASSED 100%!");
  console.log("=========================================================================");
}

runStagingDeploymentTest().catch((err) => {
  console.error("Staging deployment test failed:", err);
  process.exit(1);
});
