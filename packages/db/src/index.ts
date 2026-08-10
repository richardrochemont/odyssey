import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/hearthlane";

const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
export { pool };
