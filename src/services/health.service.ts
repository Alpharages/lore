import { DrizzleClient } from "../repositories/projects.repository.js";
import * as healthRepo from "../repositories/health.repository.js";

export interface DbProbeResult {
  status: "connected" | "disconnected";
}

export const probeDatabase = async (db: DrizzleClient): Promise<DbProbeResult> => {
  try {
    await healthRepo.ping(db);
    return { status: "connected" };
  } catch {
    return { status: "disconnected" };
  }
};
