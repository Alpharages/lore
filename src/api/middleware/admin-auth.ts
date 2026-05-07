import { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "crypto";
import { adminUnauthorized, rateLimited } from "../../utils/errors.js";
import { isRateLimited, recordFailure } from "./rate-limit.js";
import { logger } from "../../utils/logger.js";

export async function requireAdminSecret(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const ip = request.ip;

  if (isRateLimited(ip)) {
    throw rateLimited(60);
  }

  const header = request.headers["x-admin-secret"];
  if (typeof header !== "string") {
    recordFailure(ip);
    logger.warn({ ip, reason: "missing_admin_secret" }, "admin auth failed");
    throw adminUnauthorized();
  }

  const secret = process.env.ADMIN_SECRET ?? "";
  if (
    header.length !== secret.length ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(secret))
  ) {
    recordFailure(ip);
    logger.warn({ ip, reason: "invalid_admin_secret" }, "admin auth failed");
    throw adminUnauthorized();
  }
}
