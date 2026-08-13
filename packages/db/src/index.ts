import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function getDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.PGURL,
  ];

  for (const url of candidates) {
    if (url && typeof url === "string" && url.trim().length > 0 && !url.startsWith("${{")) {
      return url.trim();
    }
  }

  return "postgres://postgres:password@localhost:5432/odyssey";
}

const databaseUrl = getDatabaseUrl();

function isSslRequired(url: string): boolean {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  if (url.includes("railway.internal") || url.includes("localhost") || url.includes("127.0.0.1")) {
    return false;
  }
  if (
    url.includes(".rlwy.net") ||
    url.includes("proxy.rlwy.net") ||
    url.includes("proxy.railway.app") ||
    url.includes("up.railway.app") ||
    url.includes("sslmode=require")
  ) {
    return true;
  }
  return false;
}

const requiresSsl = isSslRequired(databaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[DATABASE POOL ERROR]", err.message);
});

export const db = drizzle(pool, { schema });
export * from "./schema";
export { pool, databaseUrl };
