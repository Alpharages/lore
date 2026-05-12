import { sql } from "drizzle-orm";
import { DrizzleClient } from "./projects.repository.js";

export const ping = async (db: DrizzleClient): Promise<void> => {
  await db.execute(sql`SELECT 1`);
};
