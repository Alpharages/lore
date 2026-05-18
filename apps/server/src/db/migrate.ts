import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

// Resolve migrations path relative to this file so it works from any cwd:
// - tsx src/db/migrate.ts  (cwd = apps/server)
// - node dist/db/migrate.js (cwd = apps/server)
// - node apps/server/dist/db/migrate.js (cwd = /app, Docker runtime)
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../../src/db/migrations");

const runMigrations = async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // Ensure pgvector and uuid-ossp extensions exist BEFORE Drizzle migration
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    console.log("✅ Extensions ensured (vector, uuid-ossp)");

    // Run Drizzle migrations
    await migrate(db, { migrationsFolder });
    console.log("✅ Drizzle migrations applied");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    await pool.end();
    process.exit(1);
  }

  await pool.end();
  console.log("✅ Migration complete — pool closed");
  process.exit(0);
};

runMigrations();
