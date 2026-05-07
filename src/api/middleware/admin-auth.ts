import { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "crypto";
import { adminUnauthorized, rateLimited } from "../../utils/errors.js";
import { isRateLimited, recordFailure, getFailureCount } from "./rate-limit.js";
import { maskIp } from "../../utils/logger.js";

export async function requireAdminSecret(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const ip = request.ip;
  const log = request.log;

  if (isRateLimited(ip)) {
    log.warn({
      tool: "auth:rate_limit",
      project_id: "-",
      success: false,
      reason: "rate_limit_exceeded",
      failure_count: getFailureCount(ip),
      ip: maskIp(ip),
    });
    throw rateLimited(60);
  }

  const header = request.headers["x-admin-secret"];
  if (typeof header !== "string") {
    recordFailure(ip);
    log.warn({
      tool: "auth:admin",
      project_id: "-",
      success: false,
      reason: "missing_admin_secret",
      ip: maskIp(ip),
    });
    throw adminUnauthorized();
  }

  const secret = process.env.ADMIN_SECRET ?? "";
  if (
    header.length !== secret.length ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(secret))
  ) {
    recordFailure(ip);
    log.warn({
      tool: "auth:admin",
      project_id: "-",
      success: false,
      reason: "admin_secret_mismatch",
      ip: maskIp(ip),
    });
    throw adminUnauthorized();
  }
}
