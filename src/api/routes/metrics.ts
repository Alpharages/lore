import { FastifyInstance } from "fastify";
import { register } from "../../services/metrics.js";

export default async function metricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (_request, reply) => {
    const metrics = await register.metrics();
    reply.status(200);
    reply.header("Content-Type", register.contentType);
    return metrics;
  });
}
