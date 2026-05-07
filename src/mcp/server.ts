import { FastifyRequest, FastifyReply } from "fastify";
import type { Logger } from "pino";
import { maskProjectId } from "../utils/logger.js";
import { recordToolDuration } from "../services/metrics.js";

// v1.0 list-returning tool names (AC-3). Adding a tool that returns a list
// without updating this union is a type error once Epic 2 tools are typed.
const listTools = new Set<string>([
  "query_lessons",
  "search_similar",
  "query_lessons_for_task",
  "get_pending_propagations",
  "get_patterns",
]);

const extractResultCount = (toolName: string, output: unknown): number | undefined => {
  if (!listTools.has(toolName)) return undefined;
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (Array.isArray(obj.lessons)) return obj.lessons.length;
    if (Array.isArray(obj.results)) return obj.results.length;
    if (Array.isArray(obj.patterns)) return obj.patterns.length;
    if (Array.isArray(obj.propagations)) return obj.propagations.length;
  }
  if (Array.isArray(output)) return output.length;
  return undefined;
};

const classifyError = (err: any): { code: string; retryable: boolean } => {
  const retryableCodes = ["EMBEDDING_FAILED"];
  if (err && typeof err.code === "string") {
    return {
      code: err.code,
      retryable: retryableCodes.includes(err.code),
    };
  }
  return { code: "UNEXPECTED", retryable: false };
};

/**
 * Generic tool wrapper for future Epic 2 MCP tool handlers.
 * Use `withMcpRouteLogging` for Fastify route handlers today.
 */
export const withToolLogging = <TInput, TOutput>(
  toolName: string,
  handler: (input: TInput, ctx: unknown) => Promise<TOutput>
): ((input: TInput, ctx: unknown) => Promise<TOutput>) => {
  return async (input, ctx) => {
    const t0 = performance.now();
    const projectId =
      ctx && typeof ctx === "object" && (ctx as any).project?.id
        ? maskProjectId((ctx as any).project.id)
        : "-";

    // For the generic wrapper we fall back to a no-op logger if none provided.
    // Epic 2 stories should inject the logger via ctx.
    const log: Logger | undefined = (ctx as any)?.log;

    try {
      const output = await handler(input, ctx);
      const durationMs = Math.round(performance.now() - t0);
      const resultCount = extractResultCount(toolName, output);

      const logLine: Record<string, unknown> = {
        tool: toolName,
        project_id: projectId,
        duration_ms: durationMs,
        success: true,
      };
      if (resultCount !== undefined) {
        logLine.result_count = resultCount;
      }

      if (log) log.info(logLine);
      recordToolDuration(toolName, durationMs);
      return output;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - t0);
      const { code, retryable } = classifyError(err);

      const logLine: Record<string, unknown> = {
        tool: toolName,
        project_id: projectId,
        duration_ms: durationMs,
        success: false,
        error_code: code,
        error_message: err.message || "Unknown error",
        retryable,
      };
      if (log?.isLevelEnabled("debug")) {
        logLine.stack = err.stack;
      }

      try {
        if (log) log.error(logLine);
      } catch (logErr) {
        // Absolute fallback: logging failure must not break the wire response
        // eslint-disable-next-line no-console
        console.error("Logging error in withToolLogging:", logErr);
      }

      recordToolDuration(toolName, durationMs);
      throw err;
    }
  };
};

/**
 * Fastify-route adapter for the §8.1 structured log envelope.
 * Apply this to every MCP tool route handler in src/api/routes/mcp.ts.
 */
export const withMcpRouteLogging = <T = unknown>(
  toolName: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
): ((request: FastifyRequest, reply: FastifyReply) => Promise<T>) => {
  return async (request, reply) => {
    const t0 = performance.now();
    const projectId = request.project?.id ? maskProjectId(request.project.id) : "-";
    const log = request.log;

    try {
      const output = await handler(request, reply);
      const durationMs = Math.round(performance.now() - t0);
      const resultCount = extractResultCount(toolName, output);

      const logLine: Record<string, unknown> = {
        tool: toolName,
        project_id: projectId,
        duration_ms: durationMs,
        success: true,
      };
      if (resultCount !== undefined) {
        logLine.result_count = resultCount;
      }

      log.info(logLine);
      recordToolDuration(toolName, durationMs);
      return output;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - t0);
      const { code, retryable } = classifyError(err);

      const logLine: Record<string, unknown> = {
        tool: toolName,
        project_id: projectId,
        duration_ms: durationMs,
        success: false,
        error_code: code,
        error_message: err.message || "Unknown error",
        retryable,
      };
      if ((log as any).isLevelEnabled("debug")) {
        logLine.stack = err.stack;
      }

      try {
        log.error(logLine);
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error("Logging error in withMcpRouteLogging:", logErr);
      }

      recordToolDuration(toolName, durationMs);
      // Prevent the Fastify error handler from emitting a second raw log line.
      // Setting statusCode causes it to take the typed-error branch (returns without
      // calling request.log.error) rather than the unhandled-error fallback.
      err.statusCode = err.statusCode ?? 500;
      throw err;
    }
  };
};
