import { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { DrizzleClient } from "../../services/projects.js";
import { getOpenAIStatus } from "../../services/health-probes.js";

const startedAt = Date.now();

interface HealthDeps {
  db: DrizzleClient;
}

export default async function healthRoutes(app: FastifyInstance, opts: HealthDeps) {
  app.get("/health", async (_request, reply) => {
    let dbStatus: "connected" | "disconnected" = "disconnected";
    let lessonsCount = 0;
    let projectsCount = 0;

    try {
      await opts.db.execute(sql`SELECT 1`);
      dbStatus = "connected";

      const lessonsResult = await opts.db.execute(sql`SELECT COUNT(*)::int AS count FROM lessons`);
      lessonsCount = (lessonsResult.rows[0] as { count: number } | undefined)?.count ?? 0;

      const projectsResult = await opts.db.execute(sql`SELECT COUNT(*)::int AS count FROM projects`);
      projectsCount = (projectsResult.rows[0] as { count: number } | undefined)?.count ?? 0;
    } catch {
      dbStatus = "disconnected";
    }

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
  });
}
