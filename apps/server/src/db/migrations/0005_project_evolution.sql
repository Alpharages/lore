-- Project Evolution — Phase 1 (Trusted Project Evolution Core)
-- planning-artifacts/project-evolution-prd.md §10, §12.1
--
-- Additive and backward-compatible (NFR-PE-02): no existing table is altered.
--
-- Append-only canonical history (NFR-PE-13):
--   * project_evolution_item_versions  — every proposal revision
--   * project_evolution_evidence       — every evidence record
--   * project_evolution_events         — every lifecycle action
--   * project_evolution_relations      — typed relations (retracted, never deleted)
--   * project_evolution_links          — session/task links (retracted, never deleted)
-- The mutable columns on project_evolution_items (title, statement, rationale,
-- revision, status, reviewed_at, approved_by, superseded_by_item_id) are the
-- current-state PROJECTION and are fully rebuildable from the tables above.
--
-- Embedding dimension is vector(768) to match migration 0003, which set every
-- existing embedding column to the local-provider dimension.

CREATE TABLE IF NOT EXISTS project_evolution_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type                        text NOT NULL,
  revision                    integer NOT NULL DEFAULT 1,
  title                       text NOT NULL,
  statement                   text NOT NULL,
  rationale                   text,
  statement_hash              text NOT NULL,
  status                      text NOT NULL DEFAULT 'proposed',
  capture_mode                text NOT NULL DEFAULT 'manual',
  proposed_by                 text,
  approved_by                 text,
  proposed_supersedes_item_id uuid,
  superseded_by_item_id       uuid,
  ai_confidence               numeric(4, 3),
  ai_model                    text,
  embedding                   vector(768),
  embedding_status            text NOT NULL DEFAULT 'pending',
  search_vector               tsvector GENERATED ALWAYS AS (
                                to_tsvector(
                                  'english',
                                  coalesce(title, '') || ' ' ||
                                  coalesce(statement, '') || ' ' ||
                                  coalesce(rationale, '')
                                )
                              ) STORED,
  occurred_at                 timestamptz,
  created_at                  timestamptz DEFAULT now(),
  reviewed_at                 timestamptz,
  CONSTRAINT project_evolution_items_type_check CHECK (
    type IN ('requirement', 'decision', 'scope_change', 'constraint', 'research_finding')
  ),
  CONSTRAINT project_evolution_items_status_check CHECK (
    status IN ('proposed', 'accepted', 'rejected', 'superseded')
  ),
  CONSTRAINT project_evolution_items_capture_mode_check CHECK (
    capture_mode IN ('manual', 'ai_assisted', 'adapter', 'workflow')
  ),
  CONSTRAINT project_evolution_items_embedding_status_check CHECK (
    embedding_status IN ('pending', 'complete', 'failed')
  ),
  CONSTRAINT project_evolution_items_ai_confidence_check CHECK (
    ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)
  ),
  CONSTRAINT project_evolution_items_proposed_supersedes_fk
    FOREIGN KEY (proposed_supersedes_item_id) REFERENCES project_evolution_items(id)
    ON DELETE SET NULL,
  CONSTRAINT project_evolution_items_superseded_by_fk
    FOREIGN KEY (superseded_by_item_id) REFERENCES project_evolution_items(id)
    ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS project_evolution_item_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES project_evolution_items(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision      integer NOT NULL,
  title         text NOT NULL,
  statement     text NOT NULL,
  rationale     text,
  authored_by   text,
  ai_confidence numeric(4, 3),
  ai_model      text,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT project_evolution_item_versions_item_revision_unique UNIQUE (item_id, revision)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS project_evolution_evidence (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                   uuid NOT NULL REFERENCES project_evolution_items(id) ON DELETE CASCADE,
  project_id                uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_kind               text NOT NULL,
  source_reference          text,
  external_source_id        text,
  excerpt                   text,
  source_author             text,
  excerpt_provided_by       text NOT NULL DEFAULT 'human',
  captured_by               text,
  occurred_at               timestamptz,
  superseded_by_evidence_id uuid,
  redacted_at               timestamptz,
  redaction_reason          text,
  -- clock_timestamp(), not now(): now() returns the transaction start time, so
  -- several evidence records appended by one request would share an identical
  -- created_at and lose their order. clock_timestamp() advances per statement.
  created_at                timestamptz DEFAULT clock_timestamp(),
  CONSTRAINT project_evolution_evidence_provided_by_check CHECK (
    excerpt_provided_by IN ('human', 'adapter', 'workflow', 'ai_agent')
  ),
  CONSTRAINT project_evolution_evidence_source_kind_check CHECK (length(btrim(source_kind)) > 0),
  CONSTRAINT project_evolution_evidence_superseded_by_fk
    FOREIGN KEY (superseded_by_evidence_id) REFERENCES project_evolution_evidence(id)
    ON DELETE SET NULL
);
--> statement-breakpoint

-- FR-PE-07: repeated capture with the same project + source_kind + external_source_id
-- must be idempotent. The partial unique index makes a duplicate insert impossible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pe_evidence_idempotency
  ON project_evolution_evidence(project_id, source_kind, external_source_id)
  WHERE external_source_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS project_evolution_relations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_item_id  uuid NOT NULL REFERENCES project_evolution_items(id) ON DELETE CASCADE,
  to_item_id    uuid NOT NULL REFERENCES project_evolution_items(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  created_by    text,
  created_at    timestamptz DEFAULT now(),
  retracted_at  timestamptz,
  retracted_by  text,
  CONSTRAINT project_evolution_relations_type_check CHECK (
    relation_type IN ('supersedes', 'supports', 'contradicts', 'caused_by', 'implements', 'related_to')
  ),
  CONSTRAINT project_evolution_relations_no_self_edge CHECK (from_item_id <> to_item_id)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS idx_pe_relations_live_unique
  ON project_evolution_relations(from_item_id, to_item_id, relation_type)
  WHERE retracted_at IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS project_evolution_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES project_evolution_items(id) ON DELETE CASCADE,
  target_kind           text NOT NULL,
  session_id            uuid REFERENCES sessions(id) ON DELETE CASCADE,
  external_task_id      text,
  external_task_ref     text,
  external_tracker_type text,
  created_by            text,
  created_at            timestamptz DEFAULT now(),
  retracted_at          timestamptz,
  retracted_by          text,
  CONSTRAINT project_evolution_links_target_kind_check CHECK (target_kind IN ('session', 'task')),
  CONSTRAINT project_evolution_links_tracker_type_check CHECK (
    external_tracker_type IS NULL OR external_tracker_type IN ('clickup', 'jira', 'asana')
  ),
  CONSTRAINT project_evolution_links_target_present_check CHECK (
    (target_kind = 'session' AND session_id IS NOT NULL) OR
    (target_kind = 'task' AND external_task_id IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS project_evolution_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id      uuid REFERENCES project_evolution_items(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  revision     integer,
  actor        text,
  actor_key_id uuid,
  note         text,
  payload      jsonb DEFAULT '{}'::jsonb,
  -- clock_timestamp(): a single request appends several events (proposed,
  -- evidence_added, ...) and the audit log must preserve their real order.
  -- now() would stamp them all with the transaction start time.
  created_at   timestamptz DEFAULT clock_timestamp(),
  CONSTRAINT project_evolution_events_type_check CHECK (
    event_type IN (
      'proposed', 'revised', 'accepted', 'rejected', 'superseded',
      'evidence_added', 'evidence_superseded', 'evidence_redacted',
      'relation_created', 'relation_retracted',
      'link_created', 'link_retracted'
    )
  )
);
