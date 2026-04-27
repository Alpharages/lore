// Drizzle ORM schema — mirrors architecture §4.2 Full DDL exactly.
// Tables: projects, repositories, sessions, lessons, patterns,
//         lesson_propagations, preferences.
// RLS policies and pgvector indexes are declared in the initial migration SQL,
// not here — Drizzle does not manage RLS or pgvector index types natively.
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom column type for pgvector — Drizzle has no native vector() type.
// The raw DDL (`embedding vector(1536)`) is declared in the migration SQL;
// here we expose it as `text` for Drizzle's type system and cast at query time.
// Design decision: use migration SQL for the vector column to preserve the
// exact `vector(1536)` type (architecture §4.2; tech-spec §6.2 — 1536 dims
// from text-embedding-3-small).
const vectorColumn = (name: string) =>
  text(name).$type<number[]>().notNull();

// ── projects ─────────────────────────────────────────────────────────────────
export const projects = pgTable(
  'projects',
  {
    id:          uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    slug:        text('slug').notNull().unique(),
    name:        text('name').notNull(),
    apiKeyHash:  text('api_key_hash').notNull(),
    stackTags:   text('stack_tags').array().default(sql`'{}'`),
    config:      jsonb('config').default(sql`'{}'`),
    createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
);

// ── repositories ─────────────────────────────────────────────────────────────
export const repositories = pgTable(
  'repositories',
  {
    id:        uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    slug:      text('slug').notNull(),
    name:      text('name').notNull(),
    stackTags: text('stack_tags').array().default(sql`'{}'`),
    boundaries: text('boundaries').array().default(sql`'{}'`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    uniqProjectSlug: uniqueIndex('repositories_project_id_slug_unique').on(t.projectId, t.slug),
  }),
);

// ── sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable(
  'sessions',
  {
    id:          uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    repoId:      uuid('repo_id').references(() => repositories.id, { onDelete: 'set null' }),
    userHandle:  text('user_handle'),
    branch:      text('branch'),
    taskSummary: text('task_summary'),
    decisions:   jsonb('decisions').default(sql`'[]'`),
    errorsHit:   uuid('errors_hit').array().default(sql`'{}'`),
    filesTouched: text('files_touched').array().default(sql`'{}'`),
    startedAt:   timestamp('started_at', { withTimezone: true }).defaultNow(),
    endedAt:     timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({
    idxSessionsProject: index('idx_sessions_project').on(t.projectId),
    idxSessionsStarted: index('idx_sessions_started').on(t.startedAt),
  }),
);

// ── lessons ───────────────────────────────────────────────────────────────────
// embedding column declared as text here; the migration creates it as
// vector(1536) (architecture §4.2; tech-spec §5.1 IVFFlat index with lists=100
// for <= 100 k vectors).
export const lessons = pgTable(
  'lessons',
  {
    id:              uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    projectId:       uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    repoId:          uuid('repo_id').references(() => repositories.id, { onDelete: 'set null' }),
    stackTags:       text('stack_tags').array().default(sql`'{}'`),
    category:        text('category'),
    severity:        text('severity').default('medium'),
    title:           text('title').notNull(),
    problem:         text('problem').notNull(),
    rootCause:       text('root_cause'),
    fix:             text('fix').notNull(),
    preventionRule:  text('prevention_rule').notNull(),
    occurrenceCount: integer('occurrence_count').default(1),
    hitByUsers:      text('hit_by_users').array().default(sql`'{}'`),
    capturedByUser:  text('captured_by_user'),
    firstSeenAt:     timestamp('first_seen_at', { withTimezone: true }).defaultNow(),
    lastSeenAt:      timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
    sessionId:       uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    propagatedFrom:  uuid('propagated_from'),
    // embedding stored as text in Drizzle type system; vector(1536) in the DB
    embedding:       text('embedding'),
    embeddingStatus: text('embedding_status').default('pending'),
    createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    idxLessonsProject:  index('idx_lessons_project').on(t.projectId),
    idxLessonsRepo:     index('idx_lessons_repo').on(t.repoId),
    idxLessonsSeverity: index('idx_lessons_severity').on(t.severity),
    idxLessonsLastSeen: index('idx_lessons_last_seen').on(t.lastSeenAt),
    // GIN on stack_tags and IVFFlat on embedding are in migration SQL;
    // Drizzle does not support these index types natively.
  }),
);

// ── patterns ──────────────────────────────────────────────────────────────────
export const patterns = pgTable(
  'patterns',
  {
    id:          uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    projectId:   uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    repoId:      uuid('repo_id').references(() => repositories.id, { onDelete: 'set null' }),
    stackTags:   text('stack_tags').array().default(sql`'{}'`),
    category:    text('category'),
    title:       text('title').notNull(),
    description: text('description').notNull(),
    codeExample: text('code_example'),
    usageCount:  integer('usage_count').default(1),
    lastUsedAt:  timestamp('last_used_at', { withTimezone: true }).defaultNow(),
    // embedding stored as text in Drizzle; vector(1536) in DB
    embedding:   text('embedding'),
    createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    idxPatternsProject: index('idx_patterns_project').on(t.projectId),
    // GIN and IVFFlat indexes in migration SQL
  }),
);

// ── lesson_propagations ───────────────────────────────────────────────────────
export const lessonPropagations = pgTable(
  'lesson_propagations',
  {
    id:              uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    sourceLessonId:  uuid('source_lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
    targetProjectId: uuid('target_project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    status:          text('status').default('suggested'),
    suggestedAt:     timestamp('suggested_at', { withTimezone: true }).defaultNow(),
    reviewedAt:      timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => ({
    uniqSourceTarget:       uniqueIndex('lesson_propagations_source_target_unique').on(t.sourceLessonId, t.targetProjectId),
    idxPropagationsTarget:  index('idx_propagations_target').on(t.targetProjectId),
    idxPropagationsStatus:  index('idx_propagations_status').on(t.status),
  }),
);

// ── preferences ───────────────────────────────────────────────────────────────
export const preferences = pgTable(
  'preferences',
  {
    id:         uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    projectId:  uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userHandle: text('user_handle').notNull(),
    prefs:      jsonb('prefs').default(sql`'{}'`),
    updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    uniqProjectUser: uniqueIndex('preferences_project_id_user_handle_unique').on(t.projectId, t.userHandle),
  }),
);

// Type exports for use in services / tools
export type Project            = typeof projects.$inferSelect;
export type NewProject         = typeof projects.$inferInsert;
export type Repository         = typeof repositories.$inferSelect;
export type NewRepository      = typeof repositories.$inferInsert;
export type Session            = typeof sessions.$inferSelect;
export type NewSession         = typeof sessions.$inferInsert;
export type Lesson             = typeof lessons.$inferSelect;
export type NewLesson          = typeof lessons.$inferInsert;
export type Pattern            = typeof patterns.$inferSelect;
export type NewPattern         = typeof patterns.$inferInsert;
export type LessonPropagation  = typeof lessonPropagations.$inferSelect;
export type Preference         = typeof preferences.$inferSelect;
