import { sql } from "drizzle-orm";
import { DrizzleClient } from "./projects.repository.js";

export const ping = async (db: DrizzleClient): Promise<void> => {
  await db.execute(sql`SELECT 1`);
};

export const countLessons = async (db: DrizzleClient): Promise<number> => {
  const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM lessons`);
  return (result.rows[0] as { count: number } | undefined)?.count ?? 0;
};

export const countProjects = async (db: DrizzleClient): Promise<number> => {
  const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM projects`);
  return (result.rows[0] as { count: number } | undefined)?.count ?? 0;
};
