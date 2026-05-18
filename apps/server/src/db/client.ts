import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

/**
 * Acquires a dedicated pool connection with row-level security disabled.
 * REQUIRED for admin/background operations that must read across projects.
 * Always call `release()` after use to return the connection to the pool.
 */
export const createAdminDb = async () => {
  const client = await pool.connect();
  await client.query("SET row_security = off");
  const adminDb = drizzle(client, { schema });
  return {
    db: adminDb,
    release: async () => {
      await client.query("SET row_security = on").catch(() => {});
      client.release();
    },
  };
};
