import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import * as healthController from "../controllers/health.controller.js";

const healthRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  app.get("/health", { config: { db: opts.db } }, healthController.health);
  done();
};

export default healthRoute;
