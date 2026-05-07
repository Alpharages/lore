-- Indexes for performance
-- Idempotent: safe to re-run on an already-migrated database

-- lessons indexes
CREATE INDEX IF NOT EXISTS idx_lessons_project       ON lessons(project_id);
CREATE INDEX IF NOT EXISTS idx_lessons_repo          ON lessons(repo_id);
CREATE INDEX IF NOT EXISTS idx_lessons_severity      ON lessons(severity);
CREATE INDEX IF NOT EXISTS idx_lessons_last_seen     ON lessons(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_stack         ON lessons USING GIN(stack_tags);
CREATE INDEX IF NOT EXISTS idx_lessons_external_task ON lessons(external_task_id)
  WHERE external_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_embedding     ON lessons
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- patterns indexes
CREATE INDEX IF NOT EXISTS idx_patterns_project      ON patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_patterns_stack        ON patterns USING GIN(stack_tags);
CREATE INDEX IF NOT EXISTS idx_patterns_embedding    ON patterns
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_project       ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started       ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_external_task ON sessions(external_task_id)
  WHERE external_task_id IS NOT NULL;

-- lesson_propagations indexes
CREATE INDEX IF NOT EXISTS idx_propagations_target ON lesson_propagations(target_project_id);
CREATE INDEX IF NOT EXISTS idx_propagations_status ON lesson_propagations(status)
  WHERE status = 'suggested';
