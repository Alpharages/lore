import { FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { DrizzleClient, findProjectBySlug } from "../../repositories/projects.repository.js";
import { compareApiKey } from "../../services/api-key.js";
import { unauthorized, rateLimited } from "../../utils/errors.js";
import { isRateLimited, recordFailure, getFailureCount } from "./rate-limit.js";
import { maskProjectId, maskIp } from "../../utils/logger.js";

export interface AuthenticatedProject {
  id: string;
  slug: string;
}

declare module "fastify" {
  interface FastifyRequest {
    project?: AuthenticatedProject;
    tx?: import("pg").PoolClient;
    txShouldRollback?: boolean;
  }
}

export const createRequireProjectAuth = (pool: Pool, db: DrizzleClient) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      recordFailure(ip);
      log.warn({
        tool: "auth:bearer",
        project_id: "-",
        success: false,
        reason: "missing_header",
        ip: maskIp(ip),
      });
      throw unauthorized();
    }

    const token = authHeader.slice(7);

    // Minimum length check: "lore_" + slug + "_" + 24
    if (token.length < "lore__".length + 24) {
      recordFailure(ip);
      log.warn({
        tool: "auth:bearer",
        project_id: "-",
        success: false,
        reason: "malformed_token",
        ip: maskIp(ip),
        token_prefix: token.startsWith("lore_") ? `lore_${token.split("_")[1] ?? ""}_***` : "***",
      });
      throw unauthorized();
    }

    // Parse slug from token format: lore_<slug>_<24_chars>
    const parts = token.split("_");
    if (parts.length < 3 || parts[0] !== "lore") {
      recordFailure(ip);
      log.warn({
        tool: "auth:bearer",
        project_id: "-",
        success: false,
        reason: "malformed_token",
        ip: maskIp(ip),
        token_prefix: "***",
      });
      throw unauthorized();
    }

    const slug = parts[1];
    if (!slug) {
      recordFailure(ip);
      log.warn({
        tool: "auth:bearer",
        project_id: "-",
        success: false,
        reason: "malformed_token",
        ip: maskIp(ip),
        token_prefix: "lore_***",
      });
      throw unauthorized();
    }

    const project = await findProjectBySlug(db, slug);
    if (!project) {
      recordFailure(ip);
      log.warn({
        tool: "auth:bearer",
        project_id: "-",
        success: false,
        reason: "no_match",
        ip: maskIp(ip),
        token_prefix: `lore_${slug}_***`,
      });
      throw unauthorized();
    }

    const match = await compareApiKey(token, project.apiKeyHash);
    if (!match) {
      recordFailure(ip);
      log.warn({
        tool: "auth:bearer",
        project_id: maskProjectId(project.id),
        success: false,
        reason: "hash_mismatch",
        ip: maskIp(ip),
        token_prefix: `lore_${slug}_***`,
      });
      throw unauthorized();
    }

    // Authenticated — acquire a connection and set transaction-local GUC
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_project_id', $1, true)", [project.id]);
    } catch (err) {
      client.release();
      throw err;
    }

    request.project = { id: project.id, slug: project.slug };
    request.tx = client;
  };
};
