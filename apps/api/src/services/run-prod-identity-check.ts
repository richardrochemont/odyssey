import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { Client } from "pg";

async function runProdIdentityCheck() {
  const dbUrl = process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/odyssey_staging";
  console.log(`Connecting read-only to: ${dbUrl.replace(/:password@/, ":[REDACTED]@")}`);

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();

    const dbMeta = await client.query(`
      SELECT 
        current_database(),
        inet_server_addr(),
        inet_server_port(),
        version();
    `);
    console.log("\n--- Database Identity Metadata ---");
    console.table(dbMeta.rows);

    const migRes = await client.query(`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;`);
    console.log("\n--- drizzle.__drizzle_migrations Table Entries ---");
    console.table(migRes.rows);

    const check0006 = (await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('monthly_financial_summaries', 'property_month_financial_coverages');
    `)).rows;

    console.log("\n--- Migration 0006 Table Existence Check ---");
    console.log(check0006);

    await client.end();
  } catch (err: any) {
    console.error("Database connection failed:", err.message);
  }
}

runProdIdentityCheck();
