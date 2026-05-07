import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { DrizzleClient, registerProject, listProjects, deleteProjectBySlug } from "../../services/projects.js";
import { requireAdminSecret } from "../middleware/admin-auth.js";
import { validationError, conflictError } from "../../utils/errors.js";

const slugRegex = /^[a-z0-9-]{2,40}$/;

interface RegisterBody {
  name: string;
  slug: string;
  stack_tags?: string[];
  repos?: Array<{ slug: string; stack_tags?: string[] }>;
}

export default function projectsRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { db: DrizzleClient },
  done: (err?: Error) => void
): void {
  const db = opts.db;

  app.post<{
    Body: RegisterBody;
  }>(
    "/register",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:POST:/api/projects/register" },
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
    async (request, reply) => {
      const { name, slug, stack_tags, repos } = request.body;

      if (!slugRegex.test(slug)) {
        throw validationError("Invalid slug format");
      }

      if (repos) {
        for (const repo of repos) {
          if (!slugRegex.test(repo.slug)) {
            throw validationError(`Invalid repo slug: ${repo.slug}`);
          }
        }
      }

      try {
        const result = await registerProject(db, {
          name,
          slug,
          stackTags: stack_tags,
          repos: repos?.map((r) => ({
            slug: r.slug,
            stackTags: r.stack_tags,
          })),
        });

        reply.status(201);
        return {
          project_id: result.projectId,
          api_key: result.apiKey,
          message: "Project registered. Store API key securely.",
        };
      } catch (err: any) {
        if (err.code === "23505" || err.message?.includes("unique constraint")) {
          throw conflictError(`Slug '${slug}' is already registered`);
        }
        throw err;
      }
    }
  );

  app.get(
    "/",
    { preHandler: [requireAdminSecret], config: { logTool: "rest:GET:/api/projects" } },
    async () => {
      const projects = await listProjects(db);
      return projects.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        stack_tags: p.stackTags,
        created_at: p.createdAt,
      }));
    }
  );

  app.delete<{
    Params: { slug: string };
  }>(
    "/:slug",
    { preHandler: [requireAdminSecret], config: { logTool: "rest:DELETE:/api/projects/:slug" } },
    async (request, reply) => {
      const deleted = await deleteProjectBySlug(db, request.params.slug);
      if (!deleted) {
        reply.status(404);
        return { error: "not_found" };
      }
      reply.status(204);
      return;
    }
  );

  done();
}
