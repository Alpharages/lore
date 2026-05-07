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

export function buildTestApp(pool: Pool, db: ReturnType<typeof createTestDb>, logger?: Logger) {
  return buildApp({ pool, db: db as any, logger });
}

export async function resetDatabase(pool: Pool) {
  await pool.query("TRUNCATE projects CASCADE");
}

export async function forceRowLevelSecurity(pool: Pool) {
  await pool.query(`
    ALTER TABLE IF EXISTS lessons FORCE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS patterns FORCE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS sessions FORCE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS repositories FORCE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS lesson_propagations FORCE ROW LEVEL SECURITY;
  `);
}

/**
 * Creates a non-superuser application role for RLS testing.
 * PostgreSQL superusers bypass RLS even with FORCE ROW LEVEL SECURITY,
 * so we need a dedicated app role to verify policy enforcement.
 */
export async function createAppRole(pool: Pool): Promise<string> {
  const dbUrl = new URL(TEST_DATABASE_URL);
  const dbHost = dbUrl.hostname;
  const dbPort = dbUrl.port || "5432";
  const dbName = dbUrl.pathname.slice(1);

  await pool.query(`
    DO $$ BEGIN
      CREATE ROLE lore_app LOGIN PASSWORD 'lore_app';
    EXCEPTION WHEN duplicate_object THEN
      -- Role already exists
    END $$;
  `);
  await pool.query(`GRANT USAGE ON SCHEMA public TO lore_app;`);
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lore_app;`
  );
  await pool.query(`GRANT SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO lore_app;`);

  return `postgres://lore_app:lore_app@${dbHost}:${dbPort}/${dbName}`;
}
