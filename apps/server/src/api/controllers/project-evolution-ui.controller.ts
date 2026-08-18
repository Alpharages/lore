import { FastifyRequest, FastifyReply } from "fastify";
import {
  listCurrentState,
  listProposals,
  getProjectHistory,
  getItemDetail,
  reviewProjectUpdate,
  exportProjectHistory,
  exportProjectHistoryJsonl,
  type ReviewAction,
} from "../../services/project-evolution.service.js";
import { toEvidenceInput } from "./project-evolution.controller.js";

/**
 * Web UI surface (FR-PE-60 … FR-PE-65). Every handler here runs behind
 * `createRequireAdminProjectScope`, so `request.txDb` is already inside a
 * transaction with `app.current_project_id` set.
 */

const parseCsv = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
};

const parseIntOrUndefined = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/** FR-PE-62: current project context, grouped by type client-side. */
export const listCurrentStateHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const query = request.query as { types?: string; limit?: string; offset?: string };

  const result = await listCurrentState(request.txDb!, {
    projectId: request.project!.id,
    types: parseCsv(query.types) ?? null,
    limit: parseIntOrUndefined(query.limit) ?? null,
    offset: parseIntOrUndefined(query.offset) ?? null,
  });

  reply.status(200);
  return result;
};

/** FR-PE-60: the review inbox. */
export const listProposalsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const query = request.query as { limit?: string; offset?: string };

  const result = await listProposals(request.txDb!, {
    projectId: request.project!.id,
    limit: parseIntOrUndefined(query.limit) ?? null,
    offset: parseIntOrUndefined(query.offset) ?? null,
  });

  reply.status(200);
  return result;
};

/** FR-PE-63: the chronological timeline. */
export const historyHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const query = request.query as {
    types?: string;
    statuses?: string;
    event_types?: string;
    item_id?: string;
    since?: string;
    until?: string;
    limit?: string;
    offset?: string;
  };

  const result = await getProjectHistory(request.txDb!, {
    projectId: request.project!.id,
    itemId: query.item_id ?? null,
    types: parseCsv(query.types) ?? null,
    statuses: parseCsv(query.statuses) ?? null,
    eventTypes: parseCsv(query.event_types) ?? null,
    since: query.since ?? null,
    until: query.until ?? null,
    limit: parseIntOrUndefined(query.limit) ?? null,
    offset: parseIntOrUndefined(query.offset) ?? null,
  });

  reply.status(200);
  return result;
};

/** FR-PE-61/64: item detail — status, rationale, full evidence, review history,
 *  typed relations. This is the reviewer's evidence-inspection surface. */
export const getItemHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };

  const detail = await getItemDetail(request.txDb!, id, request.project!.id);

  reply.status(200);
  return detail;
};

/** FR-PE-13: accept/reject/revise from the Web UI. */
export const reviewItemHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  const body = request.body as {
    action: ReviewAction;
    reviewer?: string;
    note?: string;
    title?: string;
    statement?: string;
    rationale?: string;
    supersedes_item_id?: string;
    evidence?: Parameters<typeof toEvidenceInput>[0];
    evidence_id?: string;
    redaction_reason?: string;
  };

  const result = await reviewProjectUpdate(request.txDb!, {
    projectId: request.project!.id,
    itemId: id,
    action: body.action,
    reviewer: body.reviewer ?? null,
    note: body.note ?? null,
    title: body.title ?? null,
    statement: body.statement ?? null,
    rationale: "rationale" in body ? (body.rationale ?? null) : undefined,
    supersedesItemId: body.supersedes_item_id ?? null,
    evidence: toEvidenceInput(body.evidence),
    evidenceId: body.evidence_id ?? null,
    redactionReason: body.redaction_reason ?? null,
  });

  reply.status(200);
  return result;
};

/**
 * NFR-PE-11: project history export. `format=jsonl` streams one record per
 * line for large projects; `format=json` returns a single versioned document.
 * Evidence excerpts are excluded unless explicitly requested (§14.6).
 */
export const exportHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const query = request.query as { format?: string; include_excerpts?: string };
  const includeExcerpts = query.include_excerpts === "true";

  if (query.format === "jsonl") {
    const body = await exportProjectHistoryJsonl(request.txDb!, {
      projectId: request.project!.id,
      includeExcerpts,
    });
    reply.status(200).header("content-type", "application/x-ndjson; charset=utf-8");
    return body;
  }

  const result = await exportProjectHistory(request.txDb!, {
    projectId: request.project!.id,
    includeExcerpts,
  });

  reply.status(200);
  return result;
};
