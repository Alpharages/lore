import { sql } from "drizzle-orm";
import { DrizzleClient } from "./projects.repository.js";

export const getPgDatabaseSizeBytes = async (db: DrizzleClient): Promise<number> => {
  const result = await db.execute(sql`SELECT pg_database_size(current_database()) AS size`);
  const row = result.rows[0] as { size: number } | undefined;
  return row?.size ?? 0;
};
