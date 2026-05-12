import { FastifyInstance } from "fastify";
import { requireAdminSecret } from "../middleware/admin-auth.js";
import * as metricsController from "../controllers/metrics.controller.js";

const metricsRoute = (app: FastifyInstance, _opts: unknown, done: (err?: Error) => void): void => {
  app.get("/metrics", { preHandler: [requireAdminSecret] }, metricsController.metrics);
  done();
};

export default metricsRoute;
