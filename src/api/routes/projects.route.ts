import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { requireAdminSecret } from "../middleware/admin-auth.js";
import * as projectsController from "../controllers/projects.controller.js";

interface RegisterBody {
  name: string;
  slug: string;
  stack_tags?: string[];
  repos?: Array<{ slug: string; stack_tags?: string[] }>;
}

const projectsRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  app.post<{ Body: RegisterBody }>(
    "/register",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:POST:/api/projects/register", db: opts.db },
      schema: {
        body: {
          type: "object",
          required: ["name", "slug"],
          properties: {
            name: { type: "string", minLength: 1 },
            slug: { type: "string", pattern: "^[a-z0-9-]{2,40}$" },
            stack_tags: { type: "array", items: { type: "string" } },
            repos: {
              type: "array",
              items: {
                type: "object",
                required: ["slug"],
                properties: {
                  slug: { type: "string", pattern: "^[a-z0-9-]{2,40}$" },
                  stack_tags: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    projectsController.register
  );

  app.get(
    "/",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/projects", db: opts.db },
    },
    projectsController.list
  );

  app.delete<{ Params: { slug: string } }>(
    "/:slug",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:DELETE:/api/projects/:slug", db: opts.db },
    },
    projectsController.remove
  );

  app.get<{ Params: { slug: string } }>(
    "/:slug/key",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/projects/:slug/key", db: opts.db },
    },
    projectsController.getKey
  );

  app.delete<{ Params: { slug: string; keyId: string } }>(
    "/:slug/keys/:keyId",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:DELETE:/api/projects/:slug/keys/:keyId", db: opts.db },
    },
    projectsController.revokeKey
  );

  app.post<{ Params: { slug: string } }>(
    "/:slug/keys/regenerate",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:POST:/api/projects/:slug/keys/regenerate", db: opts.db },
    },
    projectsController.regenerateKey
  );

  done();
};

export default projectsRoute;
