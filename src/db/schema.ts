import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  check,
  unique,
  customType,
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
});

/* ------------------------------------------------------------------
 * projects
 * ------------------------------------------------------------------ */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  apiKeyHash: text("api_key_hash").notNull(),
  stackTags: text("stack_tags").array().default([]),
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/* ------------------------------------------------------------------
 * repositories
 * ------------------------------------------------------------------ */
export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  stackTags: text("stack_tags").array().default([]),
  boundaries: text("boundaries").array().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  unique("repositories_project_id_slug_unique").on(table.projectId, table.slug),
]);

/* ------------------------------------------------------------------
 * sessions
 * ------------------------------------------------------------------ */
export const sessions = pgTable("sessions", {
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
}, (table) => [
  check("sessions_external_tracker_type_check", sql`${table.externalTrackerType} IN ('clickup', 'jira', 'asana')`),
]);

/* ------------------------------------------------------------------
 * lessons
 * ------------------------------------------------------------------ */
export const lessons = pgTable("lessons", {
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
  propagatedFrom: uuid("propagated_from").references(() => lessons.id, { onDelete: "set null" }),
  embedding: vector("embedding", { dimensions: 1536 }),
  embeddingStatus: text("embedding_status").default("pending"),
  externalTaskId: text("external_task_id"),
  externalTaskRef: text("external_task_ref"),
  externalTrackerType: text("external_tracker_type"),
  provenance: jsonb("provenance").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  check("lessons_severity_check", sql`${table.severity} IN ('critical', 'high', 'medium', 'low')`),
  check("lessons_embedding_status_check", sql`${table.embeddingStatus} IN ('pending', 'complete', 'failed')`),
  check("lessons_external_tracker_type_check", sql`${table.externalTrackerType} IN ('clickup', 'jira', 'asana')`),
]);

/* ------------------------------------------------------------------
 * patterns
 * ------------------------------------------------------------------ */
export const patterns = pgTable("patterns", {
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
  embedding: vector("embedding", { dimensions: 1536 }),
  externalTaskId: text("external_task_id"),
  externalTaskRef: text("external_task_ref"),
  externalTrackerType: text("external_tracker_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  check("patterns_external_tracker_type_check", sql`${table.externalTrackerType} IN ('clickup', 'jira', 'asana')`),
]);

/* ------------------------------------------------------------------
 * lesson_propagations
 * ------------------------------------------------------------------ */
export const lessonPropagations = pgTable("lesson_propagations", {
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
}, (table) => [
  check("lesson_propagations_status_check", sql`${table.status} IN ('suggested', 'accepted', 'rejected')`),
  unique("lesson_propagations_source_target_unique").on(table.sourceLessonId, table.targetProjectId),
]);
