import { FastifyRequest, FastifyReply } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { probeDatabase } from "../../services/health.service.js";

interface RouteConfig {
  db: DrizzleClient;
}

let lastDbStatus: "connected" | "disconnected" | undefined;

export const health = async (request: FastifyRequest, reply: FastifyReply) => {
  const db = (request.routeOptions.config as unknown as RouteConfig).db;
  const { status: dbStatus } = await probeDatabase(db);

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

  reply.status(200);
  reply.header("Content-Type", "application/json");
  return {
    status: dbStatus === "connected" ? "healthy" : "degraded",
    db: dbStatus,
  };
};
