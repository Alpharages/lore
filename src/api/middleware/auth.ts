import { FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { DrizzleClient, findProjectBySlug } from "../../services/projects.js";
import { compareApiKey } from "../../services/api-key.js";
import { unauthorized, rateLimited } from "../../utils/errors.js";
import { isRateLimited, recordFailure } from "./rate-limit.js";
import { logger } from "../../utils/logger.js";

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

export function createRequireProjectAuth(pool: Pool, db: DrizzleClient) {
  return async function requireProjectAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ip = request.ip;

    if (isRateLimited(ip)) {
      throw rateLimited(60);
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      recordFailure(ip);
      logger.warn({ ip, reason: "missing_or_malformed_bearer" }, "auth failed");
      throw unauthorized();
    }

    const token = authHeader.slice(7);

    // Minimum length check: "lore_" + slug + "_" + 24
    if (token.length < "lore__".length + 24) {
      recordFailure(ip);
      logger.warn({ ip, reason: "token_too_short" }, "auth failed");
      throw unauthorized();
    }

    // Parse slug from token format: lore_<slug>_<24_chars>
    const parts = token.split("_");
    if (parts.length < 3 || parts[0] !== "lore") {
      recordFailure(ip);
      logger.warn({ ip, reason: "invalid_token_format" }, "auth failed");
      throw unauthorized();
    }

    const slug = parts[1];
    if (!slug) {
      recordFailure(ip);
      logger.warn({ ip, reason: "missing_slug_in_token" }, "auth failed");
      throw unauthorized();
    }

    const project = await findProjectBySlug(db, slug);
    if (!project) {
      recordFailure(ip);
      logger.warn({ ip, slug, reason: "project_not_found" }, "auth failed");
      throw unauthorized();
    }

    const match = await compareApiKey(token, project.apiKeyHash);
    if (!match) {
      recordFailure(ip);
      logger.warn(
        { ip, slug: project.slug, reason: "hash_mismatch" },
        "auth failed"
      );
      throw unauthorized();
    }

    // Authenticated — acquire a connection and set transaction-local GUC
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.current_project_id', $1, true)",
        [project.id]
      );
    } catch (err) {
      client.release();
      throw err;
    }

    request.project = { id: project.id, slug: project.slug };
    request.tx = client;
  };
}
