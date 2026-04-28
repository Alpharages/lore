-- Initial schema migration for lore-memory-mcp.
-- Source: architecture §4.2 Full DDL + tech-spec §5.1 pgvector index config
--         + tech-spec §5.2 RLS policy template.
-- Run via: drizzle-kit migrate  (or psql -f 0000_initial.sql)

-- Extensions (architecture §4.2)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL,
  stack_tags    TEXT[] DEFAULT '{}',
  config        JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repositories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  stack_tags    TEXT[] DEFAULT '{}',
  boundaries    TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_id         UUID REFERENCES repositories(id) ON DELETE SET NULL,
  user_handle     TEXT,
  branch          TEXT,
  task_summary    TEXT,
  decisions       JSONB DEFAULT '[]',
  errors_hit      UUID[] DEFAULT '{}',
  files_touched   TEXT[] DEFAULT '{}',
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lessons (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  repo_id           UUID REFERENCES repositories(id) ON DELETE SET NULL,
  stack_tags        TEXT[] DEFAULT '{}',
  category          TEXT,
  severity          TEXT DEFAULT 'medium'
                    CHECK (severity IN ('critical','high','medium','low')),
  title             TEXT NOT NULL,
  problem           TEXT NOT NULL,
  root_cause        TEXT,
  fix               TEXT NOT NULL,
  prevention_rule   TEXT NOT NULL,
  occurrence_count  INT DEFAULT 1,
  hit_by_users      TEXT[] DEFAULT '{}',
  captured_by_user  TEXT,
  first_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  session_id        UUID REFERENCES sessions(id) ON DELETE SET NULL,
  propagated_from   UUID REFERENCES lessons(id) ON DELETE SET NULL,
  embedding         vector(1536),
  embedding_status  TEXT DEFAULT 'pending'
                    CHECK (embedding_status IN ('pending','complete','failed')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patterns (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  repo_id       UUID REFERENCES repositories(id) ON DELETE SET NULL,
  stack_tags    TEXT[] DEFAULT '{}',
  category      TEXT,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  code_example  TEXT,
  usage_count   INT DEFAULT 1,
  last_used_at  TIMESTAMPTZ DEFAULT NOW(),
  embedding     vector(1536),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lesson_propagations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  target_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status            TEXT DEFAULT 'suggested'
                    CHECK (status IN ('suggested','accepted','rejected')),
  suggested_at      TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  UNIQUE(source_lesson_id, target_project_id)
);

CREATE TABLE IF NOT EXISTS preferences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_handle TEXT NOT NULL,
  prefs       JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_handle)
);

-- ── Row-Level Security (architecture §4.2; tech-spec §5.2) ───────────────────
-- project_isolation policy: rows visible when project_id matches the session
-- setting OR project_id IS NULL (global lessons/patterns).
-- Application code sets: SET LOCAL app.current_project_id = '<uuid>'
-- before executing any query (see src/db/client.ts withProjectContext).

ALTER TABLE lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_propagations ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_isolation ON lessons
  USING (project_id = current_setting('app.current_project_id', true)::UUID
         OR project_id IS NULL);

CREATE POLICY project_isolation ON patterns
  USING (project_id = current_setting('app.current_project_id', true)::UUID
         OR project_id IS NULL);

CREATE POLICY project_isolation ON sessions
  USING (project_id = current_setting('app.current_project_id', true)::UUID);

CREATE POLICY project_isolation ON repositories
  USING (project_id = current_setting('app.current_project_id', true)::UUID);

CREATE POLICY project_isolation ON preferences
  USING (project_id = current_setting('app.current_project_id', true)::UUID);

CREATE POLICY project_isolation ON lesson_propagations
  USING (target_project_id = current_setting('app.current_project_id', true)::UUID);

-- ── Indexes (architecture §4.2; tech-spec §5.1) ──────────────────────────────

-- lessons
CREATE INDEX idx_lessons_project   ON lessons(project_id);
CREATE INDEX idx_lessons_repo      ON lessons(repo_id);
CREATE INDEX idx_lessons_severity  ON lessons(severity);
CREATE INDEX idx_lessons_last_seen ON lessons(last_seen_at DESC);
CREATE INDEX idx_lessons_stack     ON lessons USING GIN(stack_tags);

-- pgvector IVFFlat index for cosine similarity search on lessons.
-- IVFFlat with lists=100 is optimal for <= 100,000 vectors (tech-spec §5.1).
-- Switch to HNSW (m=16, ef_construction=64) when vector count exceeds 100k.
CREATE INDEX idx_lessons_embedding ON lessons
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- projects
CREATE INDEX idx_projects_stack ON projects USING GIN(stack_tags);

-- repositories
CREATE INDEX idx_repositories_stack ON repositories USING GIN(stack_tags);

-- patterns
CREATE INDEX idx_patterns_project   ON patterns(project_id);
CREATE INDEX idx_patterns_stack     ON patterns USING GIN(stack_tags);
CREATE INDEX idx_patterns_embedding ON patterns
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- sessions
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_started ON sessions(started_at DESC);

-- lesson_propagations
CREATE INDEX idx_propagations_target ON lesson_propagations(target_project_id);
CREATE INDEX idx_propagations_status ON lesson_propagations(status)
  WHERE status = 'suggested';
