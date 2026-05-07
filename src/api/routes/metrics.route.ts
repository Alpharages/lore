import { FastifyInstance } from "fastify";
import * as metricsController from "../controllers/metrics.controller.js";

const metricsRoute = (app: FastifyInstance, _opts: unknown, done: (err?: Error) => void): void => {
  app.get("/metrics", metricsController.metrics);
  done();
};

export default metricsRoute;
