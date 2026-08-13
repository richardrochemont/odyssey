import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/odyssey";

const requiresSsl =
  process.env.DATABASE_SSL === "true" ||
  databaseUrl.includes(".rlwy.net") ||
  databaseUrl.includes("sslmode=require") ||
  databaseUrl.includes("proxy.rlwy.net");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
export { pool };
