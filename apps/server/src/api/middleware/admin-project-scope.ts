import { FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema.js";
import { DrizzleClient, findProjectBySlug } from "../../services/projects.service.js";
import { requireAdminSecret } from "./admin-auth.js";
import { validationError, notFoundError } from "../../utils/errors.js";

/**
 * Admin-secret auth plus explicit project scoping.
 *
 * The Web UI authenticates to the server with the shared admin secret rather
 * than a per-project API key, so unlike `createRequireProjectAuth` there is no
 * key to derive the project from — the caller names it with `?project=<slug>`.
 *
 * Project Evolution holds more sensitive material than lessons or patterns
 * (§14), so this middleware still opens a transaction and sets
 * `app.current_project_id`. That keeps every Web UI read and write inside the
 * same RLS envelope the MCP path uses (NFR-PE-01, FR-PE-44) instead of relying
 * on the query's WHERE clause alone.
 *
 * The transaction is committed/rolled back and the connection released by the
 * global `onSend`/`onResponse` hooks in app.ts, the same as the MCP path.
 */
export const createRequireAdminProjectScope = (pool: Pool, db: DrizzleClient) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAdminSecret(request, reply);

    const query = request.query as { project?: string } | undefined;
    const slug = query?.project?.trim();
    if (!slug) {
      throw validationError("project query parameter is required");
    }

    const project = await findProjectBySlug(db, slug);
    if (!project) {
      throw notFoundError(`Project "${slug}" not found`);
    }

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
    request.txDb = drizzle(client, { schema });
    request.pool = pool;
  };
};
