import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { requireAdminSecret } from "../middleware/admin-auth.js";
import {
  searchLessonsHandler,
  getLessonHandler,
} from "../controllers/search-lessons.controller.js";

const lessonsRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  app.get(
    "/search",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/lessons/search", db: opts.db },
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string" },
            project: { type: "string" },
            tags: { type: "string" },
            severity: { type: "string" },
            category: { type: "string" },
            limit: { type: "string", pattern: "^[0-9]+$" },
          },
        },
      },
    },
    searchLessonsHandler
  );

  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/lessons/:id", db: opts.db },
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
    },
    getLessonHandler
  );

  done();
};

export default lessonsRoute;
