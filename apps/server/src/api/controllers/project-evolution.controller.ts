import { FastifyRequest, FastifyReply } from "fastify";
import {
  proposeProjectUpdate,
  reviewProjectUpdate,
  queryProjectContext,
  getProjectHistory,
  linkProjectUpdates,
  type EvidenceInput,
  type ReviewAction,
} from "../../services/project-evolution.service.js";

/* ------------------------------------------------------------------
 * Wire shapes. The MCP tool surface is snake_case (§11); these
 * controllers are the single translation boundary to the service's
 * camelCase inputs.
 * ------------------------------------------------------------------ */

interface WireEvidence {
  source_kind: string;
  source_reference?: string;
  external_source_id?: string;
  excerpt?: string;
  source_author?: string;
  provided_by?: "human" | "adapter" | "workflow" | "ai_agent";
  occurred_at?: string;
}

export const toEvidenceInput = (evidence: WireEvidence[] | undefined): EvidenceInput[] =>
  (evidence ?? []).map((e) => ({
    sourceKind: e.source_kind,
    sourceReference: e.source_reference ?? null,
    externalSourceId: e.external_source_id ?? null,
    excerpt: e.excerpt ?? null,
    sourceAuthor: e.source_author ?? null,
    providedBy: e.provided_by ?? null,
    occurredAt: e.occurred_at ?? null,
  }));

interface ProposeBody {
  type: string;
  title?: string;
  statement?: string;
  rationale?: string;
  occurred_at?: string;
  proposed_by?: string;
  capture_mode?: "manual" | "ai_assisted" | "adapter" | "workflow";
  ai_confidence?: number;
  ai_model?: string;
  supersedes_item_id?: string;
  evidence?: WireEvidence[];
}

export const proposeProjectUpdateHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = request.body as ProposeBody;

  const result = await proposeProjectUpdate(request.txDb!, {
    projectId: request.project!.id,
    type: body.type,
    title: body.title ?? null,
    statement: body.statement ?? null,
    rationale: body.rationale ?? null,
    occurredAt: body.occurred_at ?? null,
    proposedBy: body.proposed_by ?? null,
    captureMode: body.capture_mode ?? null,
    aiConfidence: body.ai_confidence ?? null,
    aiModel: body.ai_model ?? null,
    supersedesItemId: body.supersedes_item_id ?? null,
    evidence: toEvidenceInput(body.evidence),
  });

  // A brand-new proposal is a creation; an idempotent replay or a collapse onto
  // an existing item is not, so those answer 200 rather than 201.
  reply.status(result.action === "created" ? 201 : 200);
  return result;
};

interface ReviewBody {
  item_id: string;
  action: ReviewAction;
  reviewer?: string;
  note?: string;
  title?: string;
  statement?: string;
  rationale?: string;
  supersedes_item_id?: string;
  evidence?: WireEvidence[];
  evidence_id?: string;
  redaction_reason?: string;
}

export const reviewProjectUpdateHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = request.body as ReviewBody;

  const result = await reviewProjectUpdate(request.txDb!, {
    projectId: request.project!.id,
    itemId: body.item_id,
    action: body.action,
    reviewer: body.reviewer ?? null,
    note: body.note ?? null,
    title: body.title ?? null,
    statement: body.statement ?? null,
    // `rationale` is distinguished from "absent" so a reviewer can clear it.
    rationale: "rationale" in body ? (body.rationale ?? null) : undefined,
    supersedesItemId: body.supersedes_item_id ?? null,
    evidence: toEvidenceInput(body.evidence),
    evidenceId: body.evidence_id ?? null,
    redactionReason: body.redaction_reason ?? null,
  });

  reply.status(200);
  return result;
};

interface QueryContextBody {
  query?: string;
  task_context?: {
    title?: string;
    description?: string;
    acceptance_criteria?: string;
  };
  types?: string[];
  limit?: number;
  hops?: number;
  include_history?: boolean;
}

export const queryProjectContextHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = (request.body ?? {}) as QueryContextBody;

  const result = await queryProjectContext(request.txDb!, {
    projectId: request.project!.id,
    query: body.query ?? null,
    taskContext: body.task_context
      ? {
          title: body.task_context.title ?? null,
          description: body.task_context.description ?? null,
          acceptanceCriteria: body.task_context.acceptance_criteria ?? null,
        }
      : null,
    types: body.types ?? null,
    limit: body.limit ?? null,
    hops: body.hops ?? null,
    includeHistory: body.include_history ?? null,
  });

  reply.status(200);
  return result;
};

interface HistoryBody {
  item_id?: string;
  types?: string[];
  statuses?: string[];
  event_types?: string[];
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export const getProjectHistoryHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = (request.body ?? {}) as HistoryBody;

  const result = await getProjectHistory(request.txDb!, {
    projectId: request.project!.id,
    itemId: body.item_id ?? null,
    types: body.types ?? null,
    statuses: body.statuses ?? null,
    eventTypes: body.event_types ?? null,
    since: body.since ?? null,
    until: body.until ?? null,
    limit: body.limit ?? null,
    offset: body.offset ?? null,
  });

  reply.status(200);
  return result;
};

interface LinkBody {
  action?: "create" | "retract";
  actor?: string;
  from_item_id?: string;
  to_item_id?: string;
  relation_type?: string;
  item_id?: string;
  session_id?: string;
  external_task_id?: string;
  external_task_ref?: string;
  external_tracker_type?: "clickup" | "jira" | "asana";
}

export const linkProjectUpdatesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = request.body as LinkBody;

  const result = await linkProjectUpdates(request.txDb!, {
    projectId: request.project!.id,
    action: body.action ?? null,
    actor: body.actor ?? null,
    fromItemId: body.from_item_id ?? null,
    toItemId: body.to_item_id ?? null,
    relationType: body.relation_type ?? null,
    itemId: body.item_id ?? null,
    sessionId: body.session_id ?? null,
    externalTaskId: body.external_task_id ?? null,
    externalTaskRef: body.external_task_ref ?? null,
    externalTrackerType: body.external_tracker_type ?? null,
  });

  reply.status(result.action === "create" && !result.already_existed ? 201 : 200);
  return result;
};
