-- Row-Level Security enablement and policies
-- Idempotent: safe to re-run on an already-migrated database

-- Enable RLS on all application tables (except projects, which is admin-only)
ALTER TABLE IF EXISTS lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS patterns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS repositories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lesson_propagations ENABLE ROW LEVEL SECURITY;

-- Force RLS so that even the table owner cannot bypass policies
ALTER TABLE IF EXISTS lessons             FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS patterns            FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions            FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS repositories        FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lesson_propagations FORCE ROW LEVEL SECURITY;

-- lessons: project isolation (allows global rows where project_id IS NULL)
DROP POLICY IF EXISTS project_isolation ON lessons;
CREATE POLICY project_isolation ON lessons
  USING (project_id = current_setting('app.current_project_id', true)::UUID
         OR project_id IS NULL);

-- patterns: project isolation (allows global rows where project_id IS NULL)
DROP POLICY IF EXISTS project_isolation ON patterns;
CREATE POLICY project_isolation ON patterns
  USING (project_id = current_setting('app.current_project_id', true)::UUID
         OR project_id IS NULL);

-- sessions: strict project isolation (no global rows)
DROP POLICY IF EXISTS project_isolation ON sessions;
CREATE POLICY project_isolation ON sessions
  USING (project_id = current_setting('app.current_project_id', true)::UUID);

-- repositories: strict project isolation (no global rows)
DROP POLICY IF EXISTS project_isolation ON repositories;
CREATE POLICY project_isolation ON repositories
  USING (project_id = current_setting('app.current_project_id', true)::UUID);

-- lesson_propagations: isolation by target_project_id
DROP POLICY IF EXISTS project_isolation ON lesson_propagations;
CREATE POLICY project_isolation ON lesson_propagations
  USING (target_project_id = current_setting('app.current_project_id', true)::UUID);
