import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthenticatedProject } from "../api/middleware/auth.js";
import type { DrizzleClient } from "../repositories/projects.repository.js";
import {
  saveLesson,
  incrementOccurrence,
  queryLessons,
  queryLessonsForTask,
} from "../services/lessons.service.js";
import { searchSimilar } from "../services/search-similar.service.js";
import {
  startSession,
  endSession,
  startSessionFromTask,
  linkLessonsToTask,
} from "../services/sessions.service.js";
import {
  getPendingPropagationsService,
  acceptPropagation,
  rejectPropagation,
} from "../services/propagation.js";
import { captureReviewFinding } from "../services/capture-review-finding.service.js";
import { validationError } from "../utils/errors.js";

// Tool-handler error tracking. The MCP SDK catches handler exceptions
// internally and converts them to `isError: true` content, so
// `transport.handleRequest` returns normally even when a tool failed.
// The route uses this state to decide COMMIT vs ROLLBACK — mirroring
// the REST path's `request.txShouldRollback` mechanism.
export interface ToolExecutionState {
  errored: boolean;
}

// Unknown tool names: we intentionally return the SDK's default
// `result.isError: true` content rather than a JSON-RPC INVALID_PARAMS
// (-32602) envelope. This is the idiomatic MCP pattern — wrapping the
// SDK's internal routing to change this would fight the SDK's design.

export const createMcpProtocolServer = (
  project: AuthenticatedProject,
  db: DrizzleClient,
  state: ToolExecutionState
): McpServer => {
  const server = new McpServer({ name: "lore-memory", version: "1.0.0" });

  const wrap =
    <Args, R>(handler: (args: Args) => Promise<R>) =>
    async (args: Args): Promise<R> => {
      try {
        return await handler(args);
      } catch (err) {
        state.errored = true;
        throw err;
      }
    };

  server.registerTool(
    "save_lesson",
    {
      description:
        "Save a new lesson or increment occurrence of an existing semantically similar lesson.",
      inputSchema: {
        title: z.string().min(1),
        problem: z.string().min(1),
        fix: z.string().min(1),
        prevention_rule: z.string().min(1),
        root_cause: z.string().optional(),
        stack_tags: z.array(z.string()).default([]),
        category: z.string().optional(),
        severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
        repo_slug: z.string().optional(),
        session_id: z.string().uuid().optional(),
        user_handle: z.string().optional(),
      },
    },
    wrap(async (args) => {
      const result = await saveLesson(db, {
        title: args.title.trim(),
        problem: args.problem.trim(),
        rootCause: args.root_cause ?? null,
        fix: args.fix.trim(),
        preventionRule: args.prevention_rule.trim(),
        stackTags: args.stack_tags,
        category: args.category ?? null,
        severity: args.severity,
        repoSlug: args.repo_slug ?? null,
        sessionId: args.session_id ?? null,
        userHandle: args.user_handle ?? null,
        projectId: project.id,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              lesson_id: result.lessonId,
              embedding_status: result.embeddingStatus,
              action: result.action,
            }),
          },
        ],
      };
    })
  );

  server.registerTool(
    "increment_occurrence",
    {
      description: "Increment the occurrence count of an existing lesson.",
      inputSchema: {
        lesson_id: z.string().uuid(),
        user_handle: z.string().optional(),
      },
    },
    wrap(async (args) => {
      const result = await incrementOccurrence(
        db,
        args.lesson_id,
        project.id,
        args.user_handle ?? null
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              lesson_id: result.lessonId,
              new_count: result.newCount,
            }),
          },
        ],
      };
    })
  );

  server.registerTool(
    "query_lessons",
    {
      description: "Query lessons with filtering and relevance scoring.",
      inputSchema: {
        stack_tags: z.array(z.string()).default([]),
        category: z.string().optional(),
        severity: z.enum(["critical", "high", "medium", "low"]).optional(),
        last_n_days: z.number().optional(),
        repo_slug: z.string().optional(),
        limit: z.number().optional(),
      },
    },
    wrap(async (args) => {
      const result = await queryLessons(db, {
        stackTags: args.stack_tags,
        category: args.category,
        severity: args.severity,
        lastNDays: args.last_n_days,
        repoSlug: args.repo_slug,
        limit: args.limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    })
  );

  server.registerTool(
    "search_similar",
    {
      description: "Search for semantically similar lessons using natural language.",
      inputSchema: {
        text: z.string().min(1),
        threshold: z.number().default(0.7),
        limit: z.number().default(3),
      },
    },
    wrap(async (args) => {
      const result = await searchSimilar(db, {
        text: args.text.trim(),
        threshold: args.threshold,
        limit: Math.min(args.limit, 20),
        projectId: project.id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    })
  );

  server.registerTool(
    "start_session",
    {
      description: "Start a new work session.",
      inputSchema: {
        repo_slug: z.string().min(1),
        branch: z.string().min(1),
        task_summary: z.string().optional(),
        user_handle: z.string().optional(),
      },
    },
    wrap(async (args) => {
      const result = await startSession(db, {
        projectId: project.id,
        repoSlug: args.repo_slug.trim(),
        branch: args.branch.trim(),
        taskSummary: args.task_summary?.trim() ?? null,
        userHandle: args.user_handle?.trim() ?? null,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              session_id: result.sessionId,
              started_at: result.startedAt,
            }),
          },
        ],
      };
    })
  );

  server.registerTool(
    "end_session",
    {
      description: "End an active work session and record outcomes.",
      inputSchema: {
        session_id: z.string().uuid(),
        decisions: z
          .array(
            z.object({
              what: z.string().min(1),
              why: z.string().min(1),
            })
          )
          .default([]),
        lessons_applied: z.array(z.string().uuid()).default([]),
        files_touched: z.array(z.string()).default([]),
      },
    },
    wrap(async (args) => {
      const result = await endSession(db, {
        projectId: project.id,
        sessionId: args.session_id,
        decisions: args.decisions,
        lessonsApplied: args.lessons_applied,
        filesTouched: args.files_touched,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              session_id: result.sessionId,
              ended: result.ended,
              duration_minutes: result.durationMinutes,
            }),
          },
        ],
      };
    })
  );

  server.registerTool(
    "start_session_from_task",
    {
      description: "Start or resume a session associated with a tracker task.",
      inputSchema: {
        external_task_id: z.string().min(1),
        external_tracker_type: z.enum(["clickup", "jira", "asana"]),
        external_task_ref: z.string().optional(),
        task_summary: z.string().optional(),
        branch: z.string().optional(),
        user_handle: z.string().optional(),
        bmad_skill: z.string().optional(),
        bmad_workflow: z.string().optional(),
        repo_slug: z.string().optional(),
      },
    },
    wrap(async (args) => {
      const externalTaskId = args.external_task_id.trim();
      if (externalTaskId.length === 0) {
        throw validationError("external_task_id cannot be empty");
      }

      const result = await startSessionFromTask(db, {
        projectId: project.id,
        externalTaskId,
        externalTrackerType: args.external_tracker_type,
        externalTaskRef: args.external_task_ref?.trim() ?? null,
        taskSummary: args.task_summary?.trim() ?? null,
        branch: args.branch?.trim() ?? null,
        userHandle: args.user_handle?.trim() ?? null,
        bmadSkill: args.bmad_skill?.trim() ?? null,
        bmadWorkflow: args.bmad_workflow?.trim() ?? null,
        repoSlug: args.repo_slug?.trim() ?? null,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              session_id: result.sessionId,
              resumed: result.resumed,
              prior_session_summary: result.priorSessionSummary
                ? {
                    branch: result.priorSessionSummary.branch,
                    decisions: result.priorSessionSummary.decisions,
                    files_touched: result.priorSessionSummary.filesTouched,
                    started_at: result.priorSessionSummary.startedAt?.toISOString() ?? null,
                    ended_at: result.priorSessionSummary.endedAt?.toISOString() ?? null,
                  }
                : undefined,
            }),
          },
        ],
      };
    })
  );

  server.registerTool(
    "query_lessons_for_task",
    {
      description: "Query relevant lessons and patterns for a specific tracker task.",
      inputSchema: {
        external_task_id: z.string().min(1),
        task_context: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            acceptance_criteria: z.string().optional(),
            parent_epic_id: z.string().optional(),
            stack_tags: z.array(z.string()).optional(),
          })
          .optional(),
        limit: z.number().optional(),
      },
    },
    wrap(async (args) => {
      const result = await queryLessonsForTask(db, {
        externalTaskId: args.external_task_id,
        taskContext: args.task_context
          ? {
              title: args.task_context.title,
              description: args.task_context.description,
              acceptanceCriteria: args.task_context.acceptance_criteria,
              parentEpicId: args.task_context.parent_epic_id,
              stackTags: args.task_context.stack_tags,
            }
          : undefined,
        limit: args.limit,
        projectId: project.id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    })
  );

  server.registerTool(
    "link_lessons_to_task",
    {
      description: "Link consulted and applied lessons to the active session for a task.",
      inputSchema: {
        external_task_id: z.string().min(1),
        consulted: z.array(z.string().uuid()).default([]),
        applied: z.array(z.string().uuid()).default([]),
      },
    },
    wrap(async (args) => {
      const result = await linkLessonsToTask(db, {
        externalTaskId: args.external_task_id,
        consulted: args.consulted,
        applied: args.applied,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    })
  );

  server.registerTool(
    "get_pending_propagations",
    {
      description: "Get pending lesson propagation suggestions for this project.",
      inputSchema: {},
    },
    wrap(async () => {
      const results = await getPendingPropagationsService(db, project.id);
      const mappedResults = results.map((r) => ({
        id: r.id,
        title: r.title,
        problem: r.problem,
        severity: r.severity,
        stack_tags: r.stackTags || [],
        occurrence_count: r.occurrenceCount || 0,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(mappedResults) }],
      };
    })
  );

  server.registerTool(
    "accept_propagation",
    {
      description: "Accept a pending propagation suggestion and copy the lesson to this project.",
      inputSchema: {
        propagation_id: z.string().uuid(),
      },
    },
    wrap(async (args) => {
      const { newLessonId } = await acceptPropagation(db, args.propagation_id, project.id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ new_lesson_id: newLessonId, action: "accepted" }),
          },
        ],
      };
    })
  );

  server.registerTool(
    "reject_propagation",
    {
      description: "Reject a pending propagation suggestion.",
      inputSchema: {
        propagation_id: z.string().uuid(),
      },
    },
    wrap(async (args) => {
      await rejectPropagation(db, args.propagation_id, project.id);
      return {
        content: [{ type: "text", text: JSON.stringify({ action: "rejected" }) }],
      };
    })
  );

  server.registerTool(
    "capture_review_finding",
    {
      description: "Capture a code review finding as a lesson.",
      inputSchema: {
        external_task_id: z.string().min(1),
        external_tracker_type: z.enum(["clickup", "jira", "asana"]),
        external_task_ref: z.string().optional(),
        severity: z.enum(["critical", "high", "medium", "low"]),
        finding: z.object({
          title: z.string().min(1),
          problem: z.string().min(1),
          root_cause: z.string().optional(),
          fix: z.string().min(1),
          prevention_rule: z.string().min(1),
          stack_tags: z.array(z.string()).default([]),
          category: z.string().optional(),
          code_pointer: z
            .object({
              file: z.string().min(1),
              line_start: z.number(),
              line_end: z.number(),
            })
            .optional(),
        }),
        reviewer: z.string().optional(),
        workflow: z.string().optional(),
      },
    },
    wrap(async (args) => {
      const externalTaskId = args.external_task_id.trim();
      if (externalTaskId.length === 0) {
        throw validationError("external_task_id cannot be empty");
      }

      const finding = args.finding;
      if (finding.code_pointer && finding.code_pointer.line_end < finding.code_pointer.line_start) {
        throw validationError("code_pointer.line_end must be >= line_start");
      }

      const result = await captureReviewFinding(db, {
        externalTaskId,
        externalTrackerType: args.external_tracker_type,
        externalTaskRef: args.external_task_ref ?? null,
        severity: args.severity,
        finding: {
          title: finding.title.trim(),
          problem: finding.problem.trim(),
          rootCause: finding.root_cause ?? null,
          fix: finding.fix.trim(),
          preventionRule: finding.prevention_rule.trim(),
          stackTags: finding.stack_tags,
          category: finding.category ?? null,
          codePointer: finding.code_pointer
            ? {
                file: finding.code_pointer.file,
                lineStart: finding.code_pointer.line_start,
                lineEnd: finding.code_pointer.line_end,
              }
            : null,
        },
        reviewer: args.reviewer ?? null,
        workflow: args.workflow ?? null,
        projectId: project.id,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              lesson_id: result.lessonId,
              embedding_status: result.embeddingStatus,
              action: result.action,
            }),
          },
        ],
      };
    })
  );

  return server;
};
