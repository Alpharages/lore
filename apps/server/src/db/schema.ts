import { sql } from "drizzle-orm";

const EMBEDDING_DIMENSIONS = process.env.EMBEDDING_PROVIDER === "local" ? 768 : 1536;
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  check,
  unique,
  customType,
  foreignKey,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------
 * Custom pgvector type
 * ------------------------------------------------------------------ */
export const vector = customType<{
  data: number[];
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(val: number[]): string {
    return `[${val.join(",")}]`;
  },
  fromDriver(val: unknown): number[] {
    if (typeof val === "string") {
      return val
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map(Number);
    }
    return val as number[];
  },
});

/* ------------------------------------------------------------------
 * projects
 * ------------------------------------------------------------------ */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  apiKeyId: uuid("api_key_id"),
  apiKeyHash: text("api_key_hash"),
  stackTags: text("stack_tags").array().default([]),
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/* ------------------------------------------------------------------
 * repositories
 * ------------------------------------------------------------------ */
export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    stackTags: text("stack_tags").array().default([]),
    boundaries: text("boundaries").array().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("repositories_project_id_slug_unique").on(table.projectId, table.slug)]
);

/* ------------------------------------------------------------------
 * sessions
 * ------------------------------------------------------------------ */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    userHandle: text("user_handle"),
    branch: text("branch"),
    taskSummary: text("task_summary"),
    decisions: jsonb("decisions").default([]),
    lessonsConsulted: uuid("lessons_consulted").array().default([]),
    lessonsApplied: uuid("lessons_applied").array().default([]),
    filesTouched: text("files_touched").array().default([]),
    externalTaskId: text("external_task_id"),
    externalTaskRef: text("external_task_ref"),
    externalTrackerType: text("external_tracker_type"),
    bmadSkill: text("bmad_skill"),
    bmadWorkflow: text("bmad_workflow"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "sessions_external_tracker_type_check",
      sql`${table.externalTrackerType} IN ('clickup', 'jira', 'asana')`
    ),
  ]
);

/* ------------------------------------------------------------------
 * lessons
 * ------------------------------------------------------------------ */
export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    stackTags: text("stack_tags").array().default([]),
    category: text("category"),
    severity: text("severity").default("medium"),
    title: text("title").notNull(),
    problem: text("problem").notNull(),
    rootCause: text("root_cause"),
    fix: text("fix").notNull(),
    preventionRule: text("prevention_rule").notNull(),
    occurrenceCount: integer("occurrence_count").default(1),
    hitByUsers: text("hit_by_users").array().default([]),
    capturedByUser: text("captured_by_user"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    propagatedFrom: uuid("propagated_from"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingStatus: text("embedding_status").default("pending"),
    externalTaskId: text("external_task_id"),
    externalTaskRef: text("external_task_ref"),
    externalTrackerType: text("external_tracker_type"),
    provenance: jsonb("provenance").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      "lessons_severity_check",
      sql`${table.severity} IN ('critical', 'high', 'medium', 'low')`
    ),
    check(
      "lessons_embedding_status_check",
      sql`${table.embeddingStatus} IN ('pending', 'complete', 'failed')`
    ),
    check(
      "lessons_external_tracker_type_check",
      sql`${table.externalTrackerType} IN ('clickup', 'jira', 'asana')`
    ),
    foreignKey({
      columns: [table.propagatedFrom],
      foreignColumns: [table.id],
      name: "lessons_propagated_from_fk",
    }).onDelete("set null"),
  ]
);

/* ------------------------------------------------------------------
 * patterns
 * ------------------------------------------------------------------ */
export const patterns = pgTable(
  "patterns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    stackTags: text("stack_tags").array().default([]),
    category: text("category"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    codeExample: text("code_example"),
    usageCount: integer("usage_count").default(1),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    externalTaskId: text("external_task_id"),
    externalTaskRef: text("external_task_ref"),
    externalTrackerType: text("external_tracker_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      "patterns_external_tracker_type_check",
      sql`${table.externalTrackerType} IN ('clickup', 'jira', 'asana')`
    ),
  ]
);

/* ------------------------------------------------------------------
 * lesson_propagations
 * ------------------------------------------------------------------ */
export const lessonPropagations = pgTable(
  "lesson_propagations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceLessonId: uuid("source_lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    targetProjectId: uuid("target_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status").default("suggested"),
    suggestedAt: timestamp("suggested_at", { withTimezone: true }).defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "lesson_propagations_status_check",
      sql`${table.status} IN ('suggested', 'accepted', 'rejected')`
    ),
    unique("lesson_propagations_source_target_unique").on(
      table.sourceLessonId,
      table.targetProjectId
    ),
  ]
);

/* ==================================================================
 * Project Evolution (PRD project-evolution-prd.md §10)
 *
 * Canonical history is append-only (NFR-PE-13): versions, evidence,
 * events, relations and links are never updated in place — a relation
 * or link is "retracted" by stamping retracted_at, never deleted.
 *
 * The mutable columns on projectEvolutionItems (title, statement,
 * rationale, revision, status, reviewedAt, approvedBy,
 * supersededByItemId, embedding) are the current-state PROJECTION and
 * are rebuildable from the append-only tables.
 *
 * `search_vector` is a generated stored tsvector maintained by
 * PostgreSQL (see migration 0005). It is deliberately absent here —
 * queries that use it go through raw SQL in the repository.
 * ================================================================== */

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

export const PROJECT_EVOLUTION_EVENT_TYPES = [
  "proposed",
  "revised",
  "accepted",
  "rejected",
  "superseded",
  "evidence_added",
  "evidence_superseded",
  "evidence_redacted",
  "relation_created",
  "relation_retracted",
  "link_created",
  "link_retracted",
] as const;

export type ProjectEvolutionItemType = (typeof PROJECT_EVOLUTION_ITEM_TYPES)[number];
export type ProjectEvolutionStatus = (typeof PROJECT_EVOLUTION_STATUSES)[number];
export type ProjectEvolutionRelationType = (typeof PROJECT_EVOLUTION_RELATION_TYPES)[number];
export type ProjectEvolutionEventType = (typeof PROJECT_EVOLUTION_EVENT_TYPES)[number];

/* ------------------------------------------------------------------
 * project_evolution_items
 * ------------------------------------------------------------------ */
export const projectEvolutionItems = pgTable(
  "project_evolution_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    revision: integer("revision").notNull().default(1),
    title: text("title").notNull(),
    statement: text("statement").notNull(),
    rationale: text("rationale"),
    statementHash: text("statement_hash").notNull(),
    status: text("status").notNull().default("proposed"),
    captureMode: text("capture_mode").notNull().default("manual"),
    proposedBy: text("proposed_by"),
    approvedBy: text("approved_by"),
    proposedSupersedesItemId: uuid("proposed_supersedes_item_id"),
    supersededByItemId: uuid("superseded_by_item_id"),
    aiConfidence: numeric("ai_confidence"),
    aiModel: text("ai_model"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingStatus: text("embedding_status").notNull().default("pending"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "project_evolution_items_type_check",
      sql`${table.type} IN ('requirement', 'decision', 'scope_change', 'constraint', 'research_finding')`
    ),
    check(
      "project_evolution_items_status_check",
      sql`${table.status} IN ('proposed', 'accepted', 'rejected', 'superseded')`
    ),
    check(
      "project_evolution_items_capture_mode_check",
      sql`${table.captureMode} IN ('manual', 'ai_assisted', 'adapter', 'workflow')`
    ),
    check(
      "project_evolution_items_embedding_status_check",
      sql`${table.embeddingStatus} IN ('pending', 'complete', 'failed')`
    ),
    check(
      "project_evolution_items_ai_confidence_check",
      sql`${table.aiConfidence} IS NULL OR (${table.aiConfidence} >= 0 AND ${table.aiConfidence} <= 1)`
    ),
    foreignKey({
      columns: [table.proposedSupersedesItemId],
      foreignColumns: [table.id],
      name: "project_evolution_items_proposed_supersedes_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.supersededByItemId],
      foreignColumns: [table.id],
      name: "project_evolution_items_superseded_by_fk",
    }).onDelete("set null"),
  ]
);

/* ------------------------------------------------------------------
 * project_evolution_item_versions — append-only proposal revisions
 * ------------------------------------------------------------------ */
export const projectEvolutionItemVersions = pgTable(
  "project_evolution_item_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => projectEvolutionItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    statement: text("statement").notNull(),
    rationale: text("rationale"),
    authoredBy: text("authored_by"),
    aiConfidence: numeric("ai_confidence"),
    aiModel: text("ai_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("project_evolution_item_versions_item_revision_unique").on(table.itemId, table.revision),
  ]
);

/* ------------------------------------------------------------------
 * project_evolution_evidence — append-only; corrections supersede,
 * mandated erasure leaves a tombstone (FR-PE-27)
 * ------------------------------------------------------------------ */
export const projectEvolutionEvidence = pgTable(
  "project_evolution_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => projectEvolutionItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    sourceReference: text("source_reference"),
    externalSourceId: text("external_source_id"),
    excerpt: text("excerpt"),
    sourceAuthor: text("source_author"),
    excerptProvidedBy: text("excerpt_provided_by").notNull().default("human"),
    capturedBy: text("captured_by"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    supersededByEvidenceId: uuid("superseded_by_evidence_id"),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    redactionReason: text("redaction_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      "project_evolution_evidence_provided_by_check",
      sql`${table.excerptProvidedBy} IN ('human', 'adapter', 'workflow', 'ai_agent')`
    ),
    check(
      "project_evolution_evidence_source_kind_check",
      sql`length(btrim(${table.sourceKind})) > 0`
    ),
    foreignKey({
      columns: [table.supersededByEvidenceId],
      foreignColumns: [table.id],
      name: "project_evolution_evidence_superseded_by_fk",
    }).onDelete("set null"),
  ]
);

/* ------------------------------------------------------------------
 * project_evolution_relations — the logical knowledge graph
 * ------------------------------------------------------------------ */
export const projectEvolutionRelations = pgTable(
  "project_evolution_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromItemId: uuid("from_item_id")
      .notNull()
      .references(() => projectEvolutionItems.id, { onDelete: "cascade" }),
    toItemId: uuid("to_item_id")
      .notNull()
      .references(() => projectEvolutionItems.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    retractedAt: timestamp("retracted_at", { withTimezone: true }),
    retractedBy: text("retracted_by"),
  },
  (table) => [
    check(
      "project_evolution_relations_type_check",
      sql`${table.relationType} IN ('supersedes', 'supports', 'contradicts', 'caused_by', 'implements', 'related_to')`
    ),
    check(
      "project_evolution_relations_no_self_edge",
      sql`${table.fromItemId} <> ${table.toItemId}`
    ),
  ]
);

/* ------------------------------------------------------------------
 * project_evolution_links — links to sessions and external tasks
 * (FR-PE-45; lesson/pattern links are deferred to Phase 2 per FR-PE-46)
 * ------------------------------------------------------------------ */
export const projectEvolutionLinks = pgTable(
  "project_evolution_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => projectEvolutionItems.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    externalTaskId: text("external_task_id"),
    externalTaskRef: text("external_task_ref"),
    externalTrackerType: text("external_tracker_type"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    retractedAt: timestamp("retracted_at", { withTimezone: true }),
    retractedBy: text("retracted_by"),
  },
  (table) => [
    check(
      "project_evolution_links_target_kind_check",
      sql`${table.targetKind} IN ('session', 'task')`
    ),
    check(
      "project_evolution_links_tracker_type_check",
      sql`${table.externalTrackerType} IS NULL OR ${table.externalTrackerType} IN ('clickup', 'jira', 'asana')`
    ),
    check(
      "project_evolution_links_target_present_check",
      sql`(${table.targetKind} = 'session' AND ${table.sessionId} IS NOT NULL) OR (${table.targetKind} = 'task' AND ${table.externalTaskId} IS NOT NULL)`
    ),
  ]
);

/* ------------------------------------------------------------------
 * project_evolution_events — the append-only audit log (FR-PE-17)
 * ------------------------------------------------------------------ */
export const projectEvolutionEvents = pgTable(
  "project_evolution_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => projectEvolutionItems.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    revision: integer("revision"),
    actor: text("actor"),
    actorKeyId: uuid("actor_key_id"),
    note: text("note"),
    payload: jsonb("payload").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check(
      "project_evolution_events_type_check",
      sql`${table.eventType} IN ('proposed', 'revised', 'accepted', 'rejected', 'superseded', 'evidence_added', 'evidence_superseded', 'evidence_redacted', 'relation_created', 'relation_retracted', 'link_created', 'link_retracted')`
    ),
  ]
);
