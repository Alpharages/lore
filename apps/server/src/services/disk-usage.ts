import { DrizzleClient } from "../repositories/projects.repository.js";
import { getPgDatabaseSizeBytes } from "../repositories/disk-usage.repository.js";

let cachedRatio = 0;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export const getDiskUsageRatio = async (db: DrizzleClient): Promise<number> => {
  const volumeBytes = Number(process.env.LORE_PG_VOLUME_BYTES || "0");
  if (volumeBytes <= 0) {
    return 0;
  }

  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) {
    return cachedRatio;
  }

  try {
    const dbSize = await getPgDatabaseSizeBytes(db);
    cachedRatio = dbSize / volumeBytes;
  } catch {
    cachedRatio = 0;
  }

  cachedAt = now;
  return cachedRatio;
};

// For testing: allow resetting cache state
export const _resetDiskUsageCache = () => {
  cachedRatio = 0;
  cachedAt = 0;
};
