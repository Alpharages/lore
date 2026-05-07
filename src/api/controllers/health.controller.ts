import { FastifyRequest, FastifyReply } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { probeDatabase } from "../../services/health.service.js";
import { getOpenAIStatus } from "../../services/health-probes.js";

interface RouteConfig {
  db: DrizzleClient;
}

const startedAt = Date.now();
let lastDbStatus: "connected" | "disconnected" | undefined;

export const health = async (request: FastifyRequest, reply: FastifyReply) => {
  const db = (request.routeOptions.config as unknown as RouteConfig).db;
  const { status: dbStatus, lessonsCount, projectsCount } = await probeDatabase(db);

  if (lastDbStatus !== undefined && lastDbStatus !== dbStatus) {
    request.log.warn({
      tool: "rest:GET:/health",
      project_id: "-",
      success: dbStatus === "connected",
      db_status: dbStatus,
      message: `DB transitioned from ${lastDbStatus} to ${dbStatus}`,
    });
  }
  lastDbStatus = dbStatus;

  const openaiStatus = await getOpenAIStatus();
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);

  const isDegraded = dbStatus !== "connected" || openaiStatus === "unreachable";

  reply.status(200);
  reply.header("Content-Type", "application/json");
  return {
    status: isDegraded ? "degraded" : "healthy",
    db: dbStatus,
    db_lessons_count: lessonsCount,
    db_projects_count: projectsCount,
    openai: openaiStatus,
    uptime_seconds: uptimeSeconds,
  };
};
