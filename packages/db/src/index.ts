import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/odyssey";

// Railway's internal Postgres network (DATABASE_URL) does not require SSL. Set DATABASE_SSL=true if
// connecting over a public/external URL that enforces it (e.g. DATABASE_PUBLIC_URL from a local machine).
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
export { pool };
