import { FastifyReply } from "fastify";
import { register } from "../../services/metrics.js";

export const metrics = async (_request: unknown, reply: FastifyReply) => {
  const metrics = await register.metrics();
  reply.status(200);
  reply.header("Content-Type", register.contentType);
  return metrics;
};
