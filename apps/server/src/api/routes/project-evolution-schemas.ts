/**
 * Shared JSON Schemas for the Project Evolution surface.
 *
 * The MCP tool routes (mcp.route.ts) and the Web UI REST routes
 * (project-evolution.route.ts) validate the same payloads, so the schemas live
 * here rather than being duplicated and drifting apart.
 *
 * `additionalProperties: false` combined with the app's `removeAdditional:
 * false` Ajv config means an unknown field is a 400, not a silent strip — a
 * caller cannot smuggle `status: "accepted"` past capture.
 */

export const PROJECT_EVOLUTION_ITEM_TYPES = [
  "requirement",
  "decision",
  "scope_change",
  "constraint",
  "research_finding",
] as const;

export const PROJECT_EVOLUTION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "superseded",
] as const;

export const PROJECT_EVOLUTION_RELATION_TYPES = [
  "supersedes",
  "supports",
  "contradicts",
  "caused_by",
  "implements",
  "related_to",
] as const;

export const PROJECT_EVOLUTION_REVIEW_ACTIONS = [
  "inspect",
  "revise",
  "accept",
  "reject",
  "add_evidence",
  "supersede_evidence",
  "redact_evidence",
] as const;

/**
 * FR-PE-58: `source_kind` is a free-form string, not an enum, so an adapter can
 * introduce a new source (`"notion"`, `"zoom"`, …) without a Lore Core release.
 */
export const evidenceSchema = {
  type: "object",
  required: ["source_kind"],
  additionalProperties: false,
  properties: {
    source_kind: { type: "string", minLength: 1, maxLength: 64 },
    source_reference: { type: "string", maxLength: 2048 },
    external_source_id: { type: "string", maxLength: 512 },
    excerpt: { type: "string", maxLength: 20000 },
    source_author: { type: "string", maxLength: 256 },
    provided_by: { type: "string", enum: ["human", "adapter", "workflow", "ai_agent"] },
    occurred_at: { type: "string" },
  },
} as const;

export const evidenceArraySchema = {
  type: "array",
  items: evidenceSchema,
  maxItems: 25,
} as const;

export const proposeProjectUpdateBodySchema = {
  type: "object",
  required: ["type"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: PROJECT_EVOLUTION_ITEM_TYPES },
    // title/statement are optional at the schema level: FR-PE-02 allows a
    // caller to send only evidence and let Lore draft the fields. The service
    // rejects the case where neither structured fields nor a usable excerpt
    // were supplied.
    title: { type: "string", maxLength: 500 },
    statement: { type: "string", maxLength: 20000 },
    rationale: { type: "string", maxLength: 20000 },
    occurred_at: { type: "string" },
    proposed_by: { type: "string", maxLength: 256 },
    capture_mode: { type: "string", enum: ["manual", "ai_assisted", "adapter", "workflow"] },
    ai_confidence: { type: "number", minimum: 0, maximum: 1 },
    ai_model: { type: "string", maxLength: 128 },
    supersedes_item_id: { type: "string", format: "uuid" },
    evidence: evidenceArraySchema,
  },
} as const;

export const reviewProjectUpdateBodySchema = {
  type: "object",
  required: ["item_id", "action"],
  additionalProperties: false,
  properties: {
    item_id: { type: "string", format: "uuid" },
    action: { type: "string", enum: PROJECT_EVOLUTION_REVIEW_ACTIONS },
    reviewer: { type: "string", maxLength: 256 },
    note: { type: "string", maxLength: 4000 },
    title: { type: "string", maxLength: 500 },
    statement: { type: "string", maxLength: 20000 },
    rationale: { type: "string", maxLength: 20000 },
    supersedes_item_id: { type: "string", format: "uuid" },
    evidence: evidenceArraySchema,
    evidence_id: { type: "string", format: "uuid" },
    redaction_reason: { type: "string", maxLength: 1000 },
  },
} as const;

export const queryProjectContextBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: { type: "string", maxLength: 4000 },
    task_context: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 500 },
        description: { type: "string", maxLength: 8000 },
        acceptance_criteria: { type: "string", maxLength: 8000 },
      },
    },
    types: { type: "array", items: { type: "string", enum: PROJECT_EVOLUTION_ITEM_TYPES } },
    // FR-PE-41: the cap is in the schema, so an over-large request is refused
    // rather than silently clamped.
    limit: { type: "number", minimum: 1, maximum: 50, default: 20 },
    hops: { type: "number", minimum: 0, maximum: 2, default: 1 },
    include_history: { type: "boolean", default: false },
  },
} as const;

export const getProjectHistoryBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    item_id: { type: "string", format: "uuid" },
    types: { type: "array", items: { type: "string", enum: PROJECT_EVOLUTION_ITEM_TYPES } },
    statuses: { type: "array", items: { type: "string", enum: PROJECT_EVOLUTION_STATUSES } },
    event_types: { type: "array", items: { type: "string" } },
    since: { type: "string" },
    until: { type: "string" },
    limit: { type: "number", minimum: 1, maximum: 200, default: 50 },
    offset: { type: "number", minimum: 0, default: 0 },
  },
} as const;

export const linkProjectUpdatesBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ["create", "retract"], default: "create" },
    actor: { type: "string", maxLength: 256 },
    from_item_id: { type: "string", format: "uuid" },
    to_item_id: { type: "string", format: "uuid" },
    relation_type: { type: "string", enum: PROJECT_EVOLUTION_RELATION_TYPES },
    item_id: { type: "string", format: "uuid" },
    session_id: { type: "string", format: "uuid" },
    external_task_id: { type: "string", minLength: 1, maxLength: 512 },
    external_task_ref: { type: "string", maxLength: 2048 },
    external_tracker_type: { type: "string", enum: ["clickup", "jira", "asana"] },
  },
} as const;
