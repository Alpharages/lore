import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { requireAdminSecret } from "../middleware/admin-auth.js";
import {
  getStats,
  getPropagationMetadata,
  getPendingPropagationsAdmin,
  acceptPropagationAdmin,
  rejectPropagationAdmin,
} from "../controllers/admin-stats.controller.js";

const adminStatsRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  app.get<{ Querystring: { project?: string } }>(
    "/stats",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/stats", db: opts.db },
    },
    getStats(opts.db)
  );

  app.get<{ Querystring: { project?: string } }>(
    "/propagations/pending",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/propagations/pending", db: opts.db },
    },
    getPendingPropagationsAdmin(opts.db)
  );

  app.get<{ Querystring: { project?: string } }>(
    "/propagations/metadata",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/propagations/metadata", db: opts.db },
    },
    getPropagationMetadata(opts.db)
  );

  app.post<{ Params: { id: string } }>(
    "/admin/propagations/:id/accept",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:POST:/api/admin/propagations/:id/accept", db: opts.db },
    },
    acceptPropagationAdmin
  );

  app.post<{ Params: { id: string } }>(
    "/admin/propagations/:id/reject",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:POST:/api/admin/propagations/:id/reject", db: opts.db },
    },
    rejectPropagationAdmin
  );

  done();
};

export default adminStatsRoute;
