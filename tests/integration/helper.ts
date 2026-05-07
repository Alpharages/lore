import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "pino";
import { buildApp } from "../../src/api/app.js";
import * as schema from "../../src/db/schema.js";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL || "postgres://lore:lore@localhost:5432/lore_memory";

export function createTestPool() {
  return new Pool({ connectionString: TEST_DATABASE_URL });
}

export function createTestDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export function buildTestApp(
  pool: Pool,
  db: ReturnType<typeof createTestDb>,
  logger?: Logger
) {
  return buildApp({ pool, db: db as any, logger });
}

export async function resetDatabase(pool: Pool) {
  await pool.query("TRUNCATE projects CASCADE");
}
