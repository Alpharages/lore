import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { createRequireProjectAuth } from "../middleware/auth.js";
import { Pool } from "pg";
import { DrizzleClient } from "../../services/projects.js";

export default function mcpRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { pool: Pool; db: DrizzleClient },
  done: (err?: Error) => void
): void {
  const requireProjectAuth = createRequireProjectAuth(opts.pool, opts.db);

  app.get(
    "/whoami",
    { preHandler: [requireProjectAuth] },
    async (request) => {
      return {
        project_id: request.project!.id,
        slug: request.project!.slug,
      };
    }
  );

  // Test-only route: returns the count of lessons visible to the authenticated
  // project via the transaction-scoped RLS context. Only registered when
  // NODE_ENV is not "production" so it is never exposed in production builds.
  if (process.env.NODE_ENV !== "production") {
    app.get(
      "/_test/lesson-count",
      { preHandler: [requireProjectAuth] },
      async (request) => {
        const result = await request.tx!.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM lessons"
        );
        return { count: parseInt(result.rows[0].count, 10) };
      }
    );
  }

  done();
}
