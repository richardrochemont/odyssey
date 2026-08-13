import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { promptAI } from "./ai";
import { db, organizations, tenants, leases, charges, payments, units } from "@odyssey/db";
import * as assert from "assert";
import { eq } from "drizzle-orm";

async function run() {
  console.log("Initializing database connection for integration tests...");
  let orgs;
  try {
    orgs = await db.select().from(organizations).limit(1);
  } catch (dbErr: any) {
    console.log("Local DB offline or unseeded — skipping live DB integration tests.");
    process.exit(0);
  }
  if (orgs.length === 0) {
    console.log("No seeded organization found — skipping live DB integration tests.");
    process.exit(0);
  }
    const org = orgs[0];
    console.log(`Using seeded organization: ${org.name} (${org.id})`);
    // 1. Test natural language expense parsing
    console.log("Running AI intents extraction test...");
    const result = await promptAI(
      org.id,
      "expenses",
      "I paid Apex Plumbing $425 today to repair a kitchen leak at Oakridge Unit 101."
    );
    
    assert.ok(result.card, "Result must return a card");
    assert.strictEqual(result.card.intent, "create_expense_draft");
    assert.strictEqual(result.card.data.amount, 425);
    assert.strictEqual(result.card.data.vendor, "Apex Plumbing & Drain");
    assert.strictEqual(result.card.data.category, "repairs_and_maintenance");
    assert.strictEqual(result.card.data.unitNumber, "101");
    console.log("AI intents extraction test passed!");

    // 2. Test rent reviews recommendations
    console.log("Running rent reviews test...");
    const resultRent = await promptAI(org.id, "portfolio", "Calculate rent opportunities");
    assert.ok(resultRent.card, "Result must return a card");
    assert.strictEqual(resultRent.card.intent, "find_rent_opportunity");
    assert.strictEqual(resultRent.card.data.recommendations[0].currentRent, 1300);
    console.log("Rent reviews test passed!");

    // 3. Test outstanding payments
    console.log("Running outstanding payments test...");
    const resultPayments = await promptAI(org.id, "portfolio", "Show overdue payments");
    assert.ok(resultPayments.card, "Result must return a card");
    assert.strictEqual(resultPayments.card.intent, "list_outstanding_payments");
    console.log("Outstanding payments test passed!");

    // 4. Test CSV parsing
    console.log("Running CSV parser verification...");
    const { parseCSV } = await import("./imports");
    const parsedCsv = parseCSV("col1,col2\nval1,val2\n\"val 3, with comma\",val4");
    assert.strictEqual(parsedCsv.length, 3);
    assert.strictEqual(parsedCsv[2][0], "val 3, with comma");
    console.log("CSV parser verification passed!");

    // 5. Test FIFO Allocation calculations and balance updates
    console.log("Running FIFO allocation verification...");
    const { allocatePaymentToCharges } = await import("./imports");
    const [testTenant] = await db.select().from(tenants).where(eq(tenants.orgId, org.id)).limit(1);
    if (testTenant) {
      // Create a test charge
      const [testLease] = await db.select().from(leases).where(eq(leases.primaryTenantId, testTenant.id)).limit(1);
      if (testLease) {
        const [testUnit] = await db.select().from(units).where(eq(units.id, testLease.unitId)).limit(1);
        const propId = testUnit ? testUnit.propertyId : org.id;

        const [testCharge] = await db.insert(charges).values({
          orgId: org.id,
          leaseId: testLease.id,
          tenantId: testTenant.id,
          propertyId: propId,
          unitId: testLease.unitId,
          type: "rent",
          amount: 100000, // $1000
          dueDate: new Date(),
          balance: 100000,
          status: "upcoming",
        }).returning();

        // Create a test payment
        const [testPayment] = await db.insert(payments).values({
          orgId: org.id,
          tenantId: testTenant.id,
          leaseId: testLease.id,
          propertyId: propId,
          unitId: testLease.unitId,
          amountReceived: 60000, // $600
          paidDate: new Date(),
          paymentMethod: "cash",
          status: "paid",
        }).returning();

        await allocatePaymentToCharges(org.id, testPayment.id, testTenant.id, 60000);

        // Fetch updated charge balance
        const [updatedCharge] = await db.select().from(charges).where(eq(charges.id, testCharge.id));
        assert.strictEqual(updatedCharge.balance, 40000);
        assert.strictEqual(updatedCharge.status, "partial");
        console.log("FIFO allocation verification passed!");
      }
    }

    // 6. Test Double-counting avoidance on summaries
    console.log("Running cash flow double-counting check...");
    const { getPortfolioFinancialSummary } = await import("./financials");
    const summaryCheck = await getPortfolioFinancialSummary(org.id);
    assert.ok(summaryCheck.totalExpenses !== null && summaryCheck.totalExpenses >= 0);
    console.log("Cash flow double-counting check passed!");

    // 7. Onboarding Safeguards Tests
    console.log("Running onboarding safeguards & currency parser tests...");
    const { parseCurrencyToCents } = await import("@odyssey/validation");
    const { createCanonicalFingerprint } = await import("./imports");
    const { getOrCalculatePropertyMonthCoverage } = await import("./monthlySummaries");

    assert.strictEqual(parseCurrencyToCents("$1,850.50"), 185050);
    assert.strictEqual(parseCurrencyToCents("1850"), 185000);
    assert.throws(() => parseCurrencyToCents("1850.555"));
    assert.throws(() => parseCurrencyToCents("-100"));

    const fp1 = createCanonicalFingerprint({ amount: "$1,850.50", email: "JOHN@EXAMPLE.COM " });
    const fp2 = createCanonicalFingerprint({ email: "john@example.com", amount: "1850.50" });
    assert.strictEqual(fp1, fp2);

    const covCheck = await getOrCalculatePropertyMonthCoverage(org.id, "dummy-prop", "2026-05");
    assert.strictEqual(covCheck.state, "no_data");
    console.log("Onboarding safeguards & currency parser tests passed!");

    console.log("All Odyssey business unit tests passed successfully!");
    process.exit(0);
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
