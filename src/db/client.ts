// Drizzle ORM client + connection pool (architecture §3.2, §4.2).
// Pool size 10, timeout 5 s per tech-spec §7.3.
// RLS is activated per-request via SET LOCAL app.current_project_id = $id
// (architecture §4.2 project_isolation policy).
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

// Exact transaction type as provided by db.transaction — no cast needed.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run a callback inside a transaction with RLS scoped to the given project.
 * All queries inside the callback will be filtered by project_isolation.
 */
export async function withProjectContext<T>(
  projectId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(projectId)) {
    throw new Error(`Invalid projectId: ${projectId}`);
  }
  return db.transaction(async (tx) => {
    // SET LOCAL is session-scoped to this transaction; projectId is validated above.
    await tx.execute(
      sql`SELECT set_config('app.current_project_id', ${projectId}, true)`,
    );
    return fn(tx);
  });
}

export { pool };
