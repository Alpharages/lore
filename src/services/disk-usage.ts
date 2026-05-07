import { sql } from "drizzle-orm";
import { DrizzleClient } from "./projects.js";

let cachedRatio = 0;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getDiskUsageRatio(db: DrizzleClient): Promise<number> {
  const volumeBytes = Number(process.env.LORE_PG_VOLUME_BYTES || "0");
  if (volumeBytes <= 0) {
    return 0;
  }

  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) {
    return cachedRatio;
  }

  try {
    const result = await db.execute(sql`SELECT pg_database_size(current_database()) AS size`);
    const row = result.rows[0] as { size: number } | undefined;
    const dbSize = row?.size ?? 0;
    cachedRatio = dbSize / volumeBytes;
  } catch {
    cachedRatio = 0;
  }

  cachedAt = now;
  return cachedRatio;
}

// For testing: allow resetting cache state
export function _resetDiskUsageCache() {
  cachedRatio = 0;
  cachedAt = 0;
}
