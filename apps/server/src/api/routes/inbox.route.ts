import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Pool } from "pg";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { createRequireProjectAuth } from "../middleware/auth.js";
import { getInboxHandler } from "../controllers/inbox.controller.js";
import {
  acceptPropagationRestHandler,
  rejectPropagationRestHandler,
} from "../controllers/propagation-rest.controller.js";

const inboxRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { pool: Pool; db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  const requireProjectAuth = createRequireProjectAuth(opts.pool, opts.db);

  app.get<{ Params: { slug: string } }>(
    "/projects/:slug/inbox",
    {
      preHandler: [requireProjectAuth],
      config: { logTool: "rest:GET:/api/projects/:slug/inbox" },
    },
    getInboxHandler
  );

  app.post<{ Params: { id: string } }>(
    "/propagations/:id/accept",
    {
      preHandler: [requireProjectAuth],
      config: { logTool: "rest:POST:/api/propagations/:id/accept" },
    },
    acceptPropagationRestHandler
  );

  app.post<{ Params: { id: string } }>(
    "/propagations/:id/reject",
    {
      preHandler: [requireProjectAuth],
      config: { logTool: "rest:POST:/api/propagations/:id/reject" },
    },
    rejectPropagationRestHandler
  );

  done();
};

export default inboxRoute;
