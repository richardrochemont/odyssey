import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const dbUrl = process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/odyssey_staging";
process.env.DATABASE_URL = dbUrl;

import { Client } from "pg";
import { createImportRun, parseCSV } from "./imports";
import { generateCSVContent, CSV_TEMPLATES } from "./templates";
import * as assert from "assert";

async function runConflictingPaymentTest() {
  console.log("=========================================================================");
  console.log("  CONFLICTING PAYMENT REFERENCE DUPLICATE-POLICY TEST");
  console.log("=========================================================================");

  const dbClient = new Client({ connectionString: dbUrl });
  await dbClient.connect();

  const timestamp = Date.now();
  const orgRes = await dbClient.query(`INSERT INTO organizations (name, slug) VALUES ('Payment Test LLC', 'payment-test-${timestamp}') RETURNING id;`);
  const orgId = orgRes.rows[0].id;

  const ownerRes = await dbClient.query(`INSERT INTO users (org_id, email, password_hash, name, role) VALUES ('${orgId}', 'owner-test-${timestamp}@odyssey.com', 'hash', 'Test Owner', 'owner') RETURNING id;`);
  const ownerId = ownerRes.rows[0].id;

  const sourceRes = await dbClient.query(`INSERT INTO import_sources (org_id, name, type) VALUES ('${orgId}', 'CSV Upload', 'csv_upload') RETURNING id;`);
  const sourceId = sourceRes.rows[0].id;

  const runImportHelper = async (type: string, csvData: string) => {
    const parsed = parseCSV(csvData);
    const headers = parsed[0];
    const columnMapping: Record<string, string> = {};
    headers.forEach(h => { columnMapping[h.trim()] = h.trim(); });

    const runDetails = await createImportRun(orgId, ownerId, sourceId, `${type}_template.csv`, type, csvData, columnMapping);
    if (!runDetails) throw new Error("Failed to create import run");
    return runDetails.id;
  };

  // Seed baseline property, unit, tenant, lease
  await runImportHelper("properties", generateCSVContent(CSV_TEMPLATES.properties));
  await runImportHelper("units", generateCSVContent(CSV_TEMPLATES.units));
  await runImportHelper("tenants", generateCSVContent(CSV_TEMPLATES.tenants));
  await runImportHelper("leases", generateCSVContent(CSV_TEMPLATES.leases));

  // 1. Create Original Valid Payment
  const origPaymentCsv = `propertyExternalKey,unitExternalKey,tenantExternalKey,tenantEmail,amount,paymentDate,coverageMonth,paymentMethod,memo,externalReference\nPROP_DELRAY_01,UNIT_DELRAY_101,TENANT_DELRAY_101,john.doe@example.com,1850.00,2026-05-15,2026-05,ach,May Rent Payment,PAYMENT_REF_001`;
  const origRunId = await runImportHelper("payments", origPaymentCsv);

  const origRowRes = await dbClient.query(`SELECT status, duplicate_classification, validation_errors FROM import_rows WHERE run_id = '${origRunId}';`);
  console.log("Original Payment Import Row Status:", origRowRes.rows[0]);

  const paymentsBefore = (await dbClient.query(`SELECT count(*)::int as count, amount_received FROM payments WHERE org_id = '${orgId}' AND external_reference = 'PAYMENT_REF_001' GROUP BY amount_received;`)).rows;
  const countBefore = paymentsBefore[0]?.count || 0;
  const amountBefore = paymentsBefore[0]?.amount_received || 0;

  console.log("\n--- BEFORE CONFLICTING IMPORT ---");
  console.log(`Original Payment Count: ${countBefore}`);
  console.log(`Original Payment Amount (cents): ${amountBefore}`);

  // 2. Import Conflicting Payment Row with same PAYMENT_REF_001 but different amount (250000 cents = $2500.00)
  const conflictPaymentCsv = `propertyExternalKey,unitExternalKey,tenantExternalKey,tenantEmail,amount,paymentDate,coverageMonth,paymentMethod,memo,externalReference\nPROP_DELRAY_01,UNIT_DELRAY_101,TENANT_DELRAY_101,john.doe@example.com,2500.00,2026-05-15,2026-05,ach,Conflicting Rent Payment,PAYMENT_REF_001`;
  const conflictRunId = await runImportHelper("payments", conflictPaymentCsv);

  const conflictRowRes = await dbClient.query(`SELECT status, duplicate_classification, validation_errors FROM import_rows WHERE run_id = '${conflictRunId}';`);
  const conflictRow = conflictRowRes.rows[0];
  const errorText = JSON.stringify(conflictRow.validation_errors || []);

  const paymentsAfter = (await dbClient.query(`SELECT count(*)::int as count, amount_received FROM payments WHERE org_id = '${orgId}' AND external_reference = 'PAYMENT_REF_001' GROUP BY amount_received;`)).rows;
  const countAfter = paymentsAfter[0]?.count || 0;
  const amountAfter = paymentsAfter[0]?.amount_received || 0;

  console.log("\n--- AFTER CONFLICTING IMPORT ---");
  console.log(`Payment Count After Import: ${countAfter}`);
  console.log(`Original Payment Amount After Import (cents): ${amountAfter}`);
  console.log(`Conflicting Import Row Status: ${conflictRow.status}`);
  console.log(`Duplicate Classification: ${conflictRow.duplicate_classification}`);
  console.log(`Row-Level Error Text: ${errorText}`);

  // Exact Assertions
  assert.strictEqual(countBefore, 1, "Original payment count before import equals 1");
  assert.strictEqual(countAfter, 1, "Payment count after import stays unchanged (equals 1)");
  assert.strictEqual(amountAfter, 185000, "Original payment amount remains 185000 cents");
  assert.strictEqual(conflictRow.status, "needs_review", "Conflicting import row status is needs_review");
  assert.strictEqual(conflictRow.duplicate_classification, "conflicting_reference", "Duplicate classification is conflicting_reference");
  assert.ok(errorText.includes("PAYMENT_REF_001"), "Row-level error identifies PAYMENT_REF_001");

  await dbClient.end();

  console.log("\n=========================================================================");
  console.log("  CONFLICTING PAYMENT REFERENCE TEST PASSED 100%!");
  console.log("=========================================================================");
}

runConflictingPaymentTest().catch((err) => {
  console.error("Conflicting payment test failed:", err);
  process.exit(1);
});
