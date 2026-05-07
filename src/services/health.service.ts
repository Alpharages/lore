import { DrizzleClient } from "../repositories/projects.repository.js";
import * as healthRepo from "../repositories/health.repository.js";

export interface DbProbeResult {
  status: "connected" | "disconnected";
  lessonsCount: number;
  projectsCount: number;
}

// PostgreSQL error code 42P01: relation does not exist — DB reachable but migrations pending
const PG_UNDEFINED_TABLE = "42P01";

export const probeDatabase = async (db: DrizzleClient): Promise<DbProbeResult> => {
  try {
    await healthRepo.ping(db);
    const [lessonsCount, projectsCount] = await Promise.all([
      healthRepo.countLessons(db),
      healthRepo.countProjects(db),
    ]);
    return { status: "connected", lessonsCount, projectsCount };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === PG_UNDEFINED_TABLE) {
      return { status: "connected", lessonsCount: 0, projectsCount: 0 };
    }
    return { status: "disconnected", lessonsCount: 0, projectsCount: 0 };
  }
};
