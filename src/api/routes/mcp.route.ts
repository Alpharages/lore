import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Pool } from "pg";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { createRequireProjectAuth } from "../middleware/auth.js";
import { withMcpRouteLogging } from "../../mcp/server.js";
import * as mcpController from "../controllers/mcp.controller.js";
import * as saveLessonController from "../controllers/save-lesson.controller.js";
import * as incrementOccurrenceController from "../controllers/increment-occurrence.controller.js";
import * as queryLessonsController from "../controllers/query-lessons.controller.js";
import * as searchSimilarController from "../controllers/search-similar.controller.js";
import * as startSessionController from "../controllers/start-session.controller.js";
import * as endSessionController from "../controllers/end-session.controller.js";
import * as startSessionFromTaskController from "../controllers/start-session-from-task.controller.js";
import * as queryLessonsForTaskController from "../controllers/query-lessons-for-task.controller.js";
import * as linkLessonsToTaskController from "../controllers/link-lessons-to-task.controller.js";
import * as getPendingPropagationsController from "../controllers/get-pending-propagations.controller.js";

const saveLessonBodySchema = {
  type: "object",
  required: ["title", "problem", "fix", "prevention_rule"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1 },
    problem: { type: "string", minLength: 1 },
    root_cause: { type: "string" },
    fix: { type: "string", minLength: 1 },
    prevention_rule: { type: "string", minLength: 1 },
    stack_tags: { type: "array", items: { type: "string" }, default: [] },
    category: { type: "string" },
    severity: {
      type: "string",
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    repo_slug: { type: "string", minLength: 1 },
    session_id: { type: "string", format: "uuid" },
    user_handle: { type: "string" },
  },
};

const incrementOccurrenceBodySchema = {
  type: "object",
  required: ["lesson_id"],
  additionalProperties: false,
  properties: {
    lesson_id: { type: "string", format: "uuid" },
    user_handle: { type: "string" },
  },
};

const queryLessonsBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stack_tags: { type: "array", items: { type: "string" }, default: [] },
    category: { type: "string", minLength: 1 },
    severity: {
      type: "string",
      enum: ["critical", "high", "medium", "low"],
    },
    last_n_days: { type: "number", minimum: 1 },
    repo_slug: { type: "string", minLength: 1 },
    limit: { type: "number", minimum: 1, maximum: 20, default: 5 },
  },
};

const startSessionBodySchema = {
  type: "object",
  required: ["repo_slug", "branch"],
  additionalProperties: false,
  properties: {
    repo_slug: { type: "string", minLength: 1 },
    branch: { type: "string", minLength: 1 },
    task_summary: { type: "string" },
    user_handle: { type: "string" },
  },
};

const startSessionFromTaskBodySchema = {
  type: "object",
  required: ["external_task_id", "external_tracker_type"],
  additionalProperties: false,
  properties: {
    external_task_id: { type: "string", minLength: 1 },
    external_tracker_type: { type: "string", enum: ["clickup", "jira", "asana"] },
    external_task_ref: { type: "string" },
    task_summary: { type: "string" },
    branch: { type: "string" },
    user_handle: { type: "string" },
    bmad_skill: { type: "string" },
    bmad_workflow: { type: "string" },
    repo_slug: { type: "string", minLength: 1 },
  },
};

const endSessionBodySchema = {
  type: "object",
  required: ["session_id"],
  additionalProperties: false,
  properties: {
    session_id: { type: "string", format: "uuid" },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["what", "why"],
        properties: {
          what: { type: "string", minLength: 1 },
          why: { type: "string", minLength: 1 },
        },
      },
      default: [],
    },
    lessons_applied: {
      type: "array",
      items: { type: "string", format: "uuid" },
      default: [],
    },
    files_touched: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
  },
};

const searchSimilarBodySchema = {
  type: "object",
  required: ["text"],
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1 },
    threshold: { type: "number", minimum: 0, maximum: 1, default: 0.7 },
    limit: { type: "number", minimum: 1, default: 3 },
  },
};

const queryLessonsForTaskBodySchema = {
  type: "object",
  required: ["external_task_id"],
  additionalProperties: false,
  properties: {
    external_task_id: { type: "string", minLength: 1 },
    task_context: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        acceptance_criteria: { type: "string" },
        parent_epic_id: { type: "string" },
        stack_tags: { type: "array", items: { type: "string" } },
      },
    },
    limit: { type: "number", minimum: 1, maximum: 20, default: 10 },
  },
};

const linkLessonsToTaskBodySchema = {
  type: "object",
  required: ["external_task_id"],
  additionalProperties: false,
  properties: {
    external_task_id: { type: "string", minLength: 1 },
    consulted: { type: "array", items: { type: "string", format: "uuid" }, default: [] },
    applied: { type: "array", items: { type: "string", format: "uuid" }, default: [] },
  },
};

const getPendingPropagationsBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const mcpRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { pool: Pool; db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  const requireProjectAuth = createRequireProjectAuth(opts.pool, opts.db);

  app.get(
    "/whoami",
    { preHandler: [requireProjectAuth] },
    withMcpRouteLogging("whoami", mcpController.whoami)
  );

  app.post(
    "/tools/save_lesson",
    { preHandler: [requireProjectAuth], schema: { body: saveLessonBodySchema } },
    withMcpRouteLogging("save_lesson", saveLessonController.saveLessonHandler)
  );

  app.post(
    "/tools/increment_occurrence",
    {
      preHandler: [requireProjectAuth],
      schema: { body: incrementOccurrenceBodySchema },
    },
    withMcpRouteLogging(
      "increment_occurrence",
      incrementOccurrenceController.incrementOccurrenceHandler
    )
  );

  app.post(
    "/tools/query_lessons",
    {
      preHandler: [requireProjectAuth],
      schema: { body: queryLessonsBodySchema },
    },
    withMcpRouteLogging("query_lessons", queryLessonsController.queryLessonsHandler)
  );

  app.post(
    "/tools/start_session",
    {
      preHandler: [requireProjectAuth],
      schema: { body: startSessionBodySchema },
    },
    withMcpRouteLogging("start_session", startSessionController.startSessionHandler)
  );

  app.post(
    "/tools/end_session",
    {
      preHandler: [requireProjectAuth],
      schema: { body: endSessionBodySchema },
    },
    withMcpRouteLogging("end_session", endSessionController.endSessionHandler)
  );

  app.post(
    "/tools/start_session_from_task",
    {
      preHandler: [requireProjectAuth],
      schema: { body: startSessionFromTaskBodySchema },
    },
    withMcpRouteLogging(
      "start_session_from_task",
      startSessionFromTaskController.startSessionFromTaskHandler
    )
  );

  app.post(
    "/tools/search_similar",
    {
      preHandler: [requireProjectAuth],
      schema: { body: searchSimilarBodySchema },
    },
    withMcpRouteLogging("search_similar", searchSimilarController.searchSimilarHandler)
  );

  app.post(
    "/tools/query_lessons_for_task",
    {
      preHandler: [requireProjectAuth],
      schema: { body: queryLessonsForTaskBodySchema },
    },
    withMcpRouteLogging(
      "query_lessons_for_task",
      queryLessonsForTaskController.queryLessonsForTaskHandler
    )
  );

  app.post(
    "/tools/link_lessons_to_task",
    {
      preHandler: [requireProjectAuth],
      schema: { body: linkLessonsToTaskBodySchema },
    },
    withMcpRouteLogging(
      "link_lessons_to_task",
      linkLessonsToTaskController.linkLessonsToTaskHandler
    )
  );

  app.post(
    "/tools/get_pending_propagations",
    {
      preHandler: [requireProjectAuth],
      schema: { body: getPendingPropagationsBodySchema },
    },
    withMcpRouteLogging(
      "get_pending_propagations",
      getPendingPropagationsController.getPendingPropagationsHandler
    )
  );

  if (process.env.NODE_ENV !== "production") {
    app.get(
      "/_test/lesson-count",
      { preHandler: [requireProjectAuth] },
      withMcpRouteLogging("_test:lesson_count", mcpController.testLessonCount)
    );
  }

  done();
};

export default mcpRoute;
