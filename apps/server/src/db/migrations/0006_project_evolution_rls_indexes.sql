-- Project Evolution — Row-Level Security and indexes
-- planning-artifacts/project-evolution-prd.md NFR-PE-01, FR-PE-44, NFR-PE-04
-- Idempotent: safe to re-run on an already-migrated database.

-- Strict project isolation on every Project Evolution table: no global rows,
-- unlike lessons/patterns which allow project_id IS NULL.
ALTER TABLE IF EXISTS project_evolution_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_evidence      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_relations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_events        ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE IF EXISTS project_evolution_items         FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_item_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_evidence      FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_relations     FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_links         FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_evolution_events        FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS project_isolation ON project_evolution_items;
CREATE POLICY project_isolation ON project_evolution_items
  USING (project_id = current_setting('app.current_project_id', true)::UUID);
--> statement-breakpoint

DROP POLICY IF EXISTS project_isolation ON project_evolution_item_versions;
CREATE POLICY project_isolation ON project_evolution_item_versions
  USING (project_id = current_setting('app.current_project_id', true)::UUID);
--> statement-breakpoint

DROP POLICY IF EXISTS project_isolation ON project_evolution_evidence;
CREATE POLICY project_isolation ON project_evolution_evidence
  USING (project_id = current_setting('app.current_project_id', true)::UUID);
--> statement-breakpoint

DROP POLICY IF EXISTS project_isolation ON project_evolution_relations;
CREATE POLICY project_isolation ON project_evolution_relations
  USING (project_id = current_setting('app.current_project_id', true)::UUID);
--> statement-breakpoint

DROP POLICY IF EXISTS project_isolation ON project_evolution_links;
CREATE POLICY project_isolation ON project_evolution_links
  USING (project_id = current_setting('app.current_project_id', true)::UUID);
--> statement-breakpoint

DROP POLICY IF EXISTS project_isolation ON project_evolution_events;
CREATE POLICY project_isolation ON project_evolution_events
  USING (project_id = current_setting('app.current_project_id', true)::UUID);
--> statement-breakpoint

-- items: current-state derivation (FR-PE-19) is a project_id + status scan, so
-- the composite index covers the hottest path. type/occurred_at support the
-- grouped current-context view and the chronological timeline.
CREATE INDEX IF NOT EXISTS idx_pe_items_project_status ON project_evolution_items(project_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_items_project_type   ON project_evolution_items(project_id, type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_items_occurred       ON project_evolution_items(occurred_at DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_items_created        ON project_evolution_items(created_at DESC);
--> statement-breakpoint
-- FR-PE-08: exact-duplicate detection before semantic suggestions.
CREATE INDEX IF NOT EXISTS idx_pe_items_statement_hash ON project_evolution_items(project_id, type, statement_hash);
--> statement-breakpoint
-- FR-PE-36: lexical half of hybrid retrieval.
CREATE INDEX IF NOT EXISTS idx_pe_items_search         ON project_evolution_items USING GIN(search_vector);
--> statement-breakpoint
-- FR-PE-36: semantic half of hybrid retrieval.
CREATE INDEX IF NOT EXISTS idx_pe_items_embedding      ON project_evolution_items
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_items_superseded_by  ON project_evolution_items(superseded_by_item_id)
  WHERE superseded_by_item_id IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pe_versions_item     ON project_evolution_item_versions(item_id, revision DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_evidence_item     ON project_evolution_evidence(item_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_evidence_project  ON project_evolution_evidence(project_id);
--> statement-breakpoint

-- FR-PE-32: one- and two-hop relationship expansion walks both directions.
CREATE INDEX IF NOT EXISTS idx_pe_relations_from    ON project_evolution_relations(from_item_id)
  WHERE retracted_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_relations_to      ON project_evolution_relations(to_item_id)
  WHERE retracted_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_relations_project ON project_evolution_relations(project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pe_links_item        ON project_evolution_links(item_id)
  WHERE retracted_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_links_session     ON project_evolution_links(session_id)
  WHERE session_id IS NOT NULL AND retracted_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_links_task        ON project_evolution_links(external_task_id)
  WHERE external_task_id IS NOT NULL AND retracted_at IS NULL;
--> statement-breakpoint

-- FR-PE-39/40: history is a project-scoped reverse-chronological event scan.
CREATE INDEX IF NOT EXISTS idx_pe_events_project    ON project_evolution_events(project_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pe_events_item       ON project_evolution_events(item_id, created_at DESC);
