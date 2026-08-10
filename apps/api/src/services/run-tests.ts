import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { promptAI } from "./ai";
import { db, organizations } from "@hearthlane/db";
import * as assert from "assert";

async function run() {
  console.log("Initializing database connection for integration tests...");
  try {
    const orgs = await db.select().from(organizations).limit(1);
    if (orgs.length === 0) {
      throw new Error("No seeded organization found. Please run db:seed first.");
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

    console.log("All Odyssey business unit tests passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

run();
