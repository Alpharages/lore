# Lore Platform — Epics and Stories

Version: 1.0.0
Status: Final (Draft for Implementation)
Date: 2026-05-06

---

## Overview

Six epics mapped to PRD feature areas and the two-component
architecture (`@lore/cli`, `lore-memory-mcp`). Stories are ordered by
dependency — earlier epics must be substantially complete before later
ones can be tested end-to-end.

---

## Epic 1 — Memory Server Foundation

**Goal:** Stand up `lore-memory-mcp` with the full database schema, auth
middleware, Row-Level Security, and health endpoint. All other epics
depend on this.

**Acceptance (epic-level):** A running Docker container passes
`/health`, rejects unauthenticated requests, and enforces RLS so Project
A cannot read Project B data.

---

### Story 1.1 — Database Schema and Migrations

**As a** platform administrator,
**I want** the full Postgres schema with pgvector applied via a
repeatable migration,
**so that** all services start from a known, version-controlled state.

**Acceptance Criteria:**

- [ ] `npm run db:migrate` applies all Drizzle migrations idempotently
- [ ] Schema includes all 6 tables: `projects`, `repositories`,
      `lessons`, `patterns`, `sessions`, `lesson_propagations`
- [ ] `lessons` and `patterns` have `vector(1536)` embedding columns
- [ ] `lessons`, `patterns`, `sessions` have `external_task_id`,
      `external_task_ref`, `external_tracker_type` columns
- [ ] `lessons` has `provenance` JSONB column with default `'{}'`
- [ ] `sessions` has `bmad_skill`, `bmad_workflow`,
      `lessons_consulted` (UUID[]), `lessons_applied` (UUID[]) columns
- [ ] IVFFlat indexes created on both embedding columns
- [ ] GIN indexes created on all `stack_tags[]` columns
- [ ] Partial indexes created on `external_task_id` (WHERE NOT NULL)
- [ ] RLS enabled on all tables except `projects`
- [ ] Project isolation policy applied per architecture §4.2
- [ ] `db:migrate` can run against a fresh DB and an already-migrated
      DB without error

**Technical Notes:**

- Use Drizzle ORM schema definitions in `src/db/schema.ts`
- `pgvector/pgvector:pg16` Docker image provides the extension
- See architecture §4.2 for full DDL

---

### Story 1.2 — Auth Middleware and Project Registration

**As a** platform administrator,
**I want** projects to register via a REST API and receive an API key,
**so that** each project has a unique scoped credential for MCP access.

**Acceptance Criteria:**

- [ ] `POST /api/projects/register` accepts `{name, slug, stack_tags[],
repos[]}` and returns a one-time plain-text API key in format
      `lore_{slug}_{24_random_chars}`
- [ ] Plain-text key shown exactly once; only bcrypt hash (cost 12)
      stored in DB
- [ ] `GET /api/projects` returns a list of registered projects (no
      key data)
- [ ] `DELETE /api/projects/:slug` deregisters a project and cascades
      deletes
- [ ] Auth middleware extracts `Authorization: Bearer <key>` from every
      MCP request, resolves `project_id`, and sets
      `app.current_project_id` for the DB connection
- [ ] Requests with missing or invalid API keys return `401`
- [ ] Admin endpoints protected by a separate `ADMIN_SECRET` env var
- [ ] Rate limiting: max 20 failed auth attempts per IP per minute (NFR-06)

---

### Story 1.3 — Docker Compose and Health Endpoint

**As a** platform administrator,
**I want** a single `docker compose up` to bring up the full stack,
**so that** deployment is reproducible with no manual steps.

**Acceptance Criteria:**

- [ ] `docker compose up` starts `postgres`, `mcp-server`, and `nginx`
- [ ] `postgres` healthcheck passes before `mcp-server` starts
- [ ] `GET /health` returns JSON with `status`, `db`,
      `db_lessons_count`, `db_projects_count`, `openai`,
      `uptime_seconds`
- [ ] `GET /metrics` returns Prometheus-compatible metrics for all
      alert thresholds in architecture §8.3
- [ ] Nginx terminates TLS and proxies to `mcp-server:3100`
- [ ] All secrets supplied via environment variables; no secrets in
      `docker-compose.yml`

---

### Story 1.4 — Structured Logging

**As a** platform administrator,
**I want** every MCP tool call logged in structured JSON,
**so that** I can monitor performance and debug failures.

**Acceptance Criteria:**

- [ ] Every MCP tool call emits a log entry with: `tool`, `project_id`
      (masked), `duration_ms`, `result_count` (where applicable),
      `success`, `timestamp`
- [ ] Log level controlled by `LOG_LEVEL` env var
      (`debug|info|warn|error`)
- [ ] Errors include stack trace at `debug` level only

---

## Epic 2 — Lessons, Sessions, and BMAD Integration

**Goal:** Implement all MCP tools for lessons, sessions, and the BMAD
bridge as defined in PRD §7.5 and §7.6. This is the largest epic and the
heart of Lore's value proposition.

**Depends on:** Epic 1 complete.

---

### Story 2.1 — `save_lesson` Tool

**As a** developer (via AI agent),
**I want** to save a lesson manually after solving a hard bug,
**so that** the team's institutional knowledge is preserved.

**Acceptance Criteria:**

- [ ] Tool accepts: `title`, `problem`, `root_cause`, `fix`,
      `prevention_rule`, `stack_tags[]`, `category`, `severity`,
      optional `repo_slug` and `session_id`
- [ ] On save, triggers async embedding generation via OpenAI
      (`text-embedding-3-small`, 1536 dims)
- [ ] `embedding_status` starts as `pending`, transitions to `complete`
      or `failed`
- [ ] Server-stamps `provenance = { source: "manual",
captured_by: <user_handle>, trust_tier: "manual" }`
- [ ] Returns the new lesson `id` and embedding status, or matched
      `lesson_id` and `action: "incremented"` on duplicate
- [ ] Scoped to authenticated project's `project_id`

---

### Story 2.2 — Semantic Deduplication on `save_lesson`

**As a** platform,
**I want** duplicate lessons to be merged automatically,
**so that** the lesson database stays clean and occurrence counts are
accurate.

**Acceptance Criteria:**

- [ ] Before inserting, runs vector similarity check against existing
      project lessons
- [ ] If cosine similarity ≥ 0.90, calls `increment_occurrence` on the
      matched lesson instead of inserting
- [ ] `increment_occurrence` increments `occurrence_count`, appends to
      `hit_by_users[]`, updates `last_seen_at`
- [ ] Response indicates whether new lesson was created or existing one
      updated, including matched lesson ID
- [ ] Deduplication runs only within the same project (not
      cross-project)

---

### Story 2.3 — `query_lessons` Tool

**As a** developer (via AI agent),
**I want** to retrieve relevant past lessons by filter,
**so that** I avoid mistakes my team has already made.

**Acceptance Criteria:**

- [ ] Tool accepts optional filters: `stack_tags[]`, `category`,
      `severity`, `last_n_days`, `repo_slug`
- [ ] Results ranked by relevance score combining: recency, frequency,
      stack-tag overlap, severity, semantic similarity (when context
      provided)
- [ ] Returns lessons scoped to authenticated project plus global
      lessons (where `project_id IS NULL`)
- [ ] Response time < 200ms for projects with up to 10,000 lessons
      (NFR-01)
- [ ] Returns max 5 results by default; accepts `limit` parameter up to
      20

---

### Story 2.4 — `search_similar` Tool

**As a** developer (via AI agent),
**I want** to find lessons semantically related to a natural language
query,
**so that** I can discover relevant knowledge even without exact
keyword matches.

**Acceptance Criteria:**

- [ ] Tool accepts a `text` string
- [ ] Embeds the input and runs pgvector cosine similarity search
- [ ] Returns lessons (and optionally patterns) ordered by cosine
      similarity descending
- [ ] Response time < 500ms (NFR-02)
- [ ] Scoped to authenticated project + global lessons
- [ ] Accepts optional `threshold` (default 0.70) and `limit`
      (default 3)

---

### Story 2.5 — `start_session` and `end_session` Tools

**As a** developer (via AI agent),
**I want** my work sessions recorded with context and outcomes,
**so that** my teammates can pick up where I left off.

**Acceptance Criteria:**

- [ ] `start_session` accepts: `repo_slug`, `branch`, `task_summary`,
      `user_handle`; returns `session_id`
- [ ] `end_session` accepts: `session_id`, `decisions[]`,
      `lessons_applied[]` (lesson UUIDs), `files_touched[]`; marks
      session `ended_at`
- [ ] Both tools scoped to authenticated project

---

### Story 2.6 — `start_session_from_task` Tool (NEW)

**As a** developer (via BMAD `clickup-dev-implement`),
**I want** my session automatically started or resumed when I begin
work on a tracker task,
**so that** session continuity is preserved across days without manual
hand-off.

**Acceptance Criteria:**

- [ ] Tool accepts: `external_task_id`, `external_tracker_type`,
      optional `external_task_ref`, `task_summary`, `branch`,
      `user_handle`, `bmad_skill`, `bmad_workflow`, `repo_slug`
- [ ] If an open session exists for `(project_id, external_task_id,
external_tracker_type)` → return `resumed: true` with
      `prior_session_summary` (branch, decisions, files_touched,
      started_at, ended_at)
- [ ] Otherwise → INSERT new session with all task / BMAD fields
      populated; return `resumed: false`
- [ ] Scoped to authenticated project

---

### Story 2.7 — `query_lessons_for_task` Tool (NEW)

**As a** developer (via BMAD execution skill),
**I want** lessons relevant to a specific tracker task surfaced
automatically,
**so that** the agent starts work knowing what already failed and what
already worked.

**Acceptance Criteria:**

- [ ] Tool accepts: `external_task_id`, optional `task_context` (title,
      description, acceptance_criteria, parent_epic_id, stack_tags),
      `limit` (default 10)
- [ ] If `task_context.title` + `description` present, generates an
      embedding and includes semantic similarity in scoring
- [ ] Filters by stack-tag overlap when `task_context.stack_tags`
      present
- [ ] If `parent_epic_id` present, also includes lessons attached to
      sibling tasks (lessons.external_task_id IN (sibling task IDs))
- [ ] Returns combined `lessons` + `patterns` ranked by relevance score
- [ ] Each lesson result includes `match_reason` (semantic | stack |
      epic-sibling) for explainability
- [ ] Response time < 500ms (NFR-03)

---

### Story 2.8 — `link_lessons_to_task` Tool (NEW)

**As a** platform,
**I want** to record which lessons were consulted vs applied during a
task,
**so that** trust scoring can later reward lessons that proved useful.

**Acceptance Criteria:**

- [ ] Tool accepts: `external_task_id`, `consulted: UUID[]`,
      `applied: UUID[]`
- [ ] Updates the OPEN session for that task (the most recent session
      where ended_at IS NULL)
- [ ] Sets `lessons_consulted = lessons_consulted UNION consulted`
- [ ] Sets `lessons_applied = lessons_applied UNION applied`
- [ ] Returns `{ linked: <count> }`
- [ ] Idempotent — calling with the same lesson IDs does not
      duplicate entries

---

### Story 2.9 — `capture_review_finding` Tool (NEW, highest leverage)

**As a** BMAD `clickup-code-review` skill,
**I want** structured review findings captured as lessons automatically,
**so that** every PR review compounds the team's institutional memory.

**Acceptance Criteria:**

- [ ] Tool accepts: `external_task_id`, `external_tracker_type`,
      optional `external_task_ref`, `severity`, `finding` (title,
      problem, root_cause, fix, prevention_rule, stack_tags, category,
      code_pointer), optional `reviewer`, `workflow`
- [ ] Server-stamps `provenance = { source: "bmad-code-review",
workflow, skill: "clickup-code-review", task_id: <id>,
reviewer, trust_tier: "high", captured_at: <now> }`
- [ ] Sets `external_task_id`, `external_task_ref`,
      `external_tracker_type` on the lesson row
- [ ] Runs the same semantic deduplication check as `save_lesson`
- [ ] If duplicate → call `increment_occurrence` on existing
- [ ] Returns `{ action: "created" | "incremented", lesson_id: string }`
- [ ] Lesson is queryable via `query_lessons` and `search_similar`
      immediately after embedding completes
- [ ] Cross-project propagation engine picks it up after `occurrence_count
  > = 2` with no engine-side changes

---

### Story 2.10 — Patterns Tools (`save_pattern`, `get_patterns`)

**As a** developer (via AI agent),
**I want** to save and retrieve reusable code patterns,
**so that** the team converges on proven implementation approaches.

**Acceptance Criteria:**

- [ ] `save_pattern` accepts: `title`, `description`, `code_example`,
      `stack_tags[]`, `category`; generates embedding
- [ ] `get_patterns` filters by `stack_tags[]` and `category`; returns
      results sorted by `usage_count` descending
- [ ] Scoped to authenticated project + global patterns
- [ ] Calling `get_patterns` increments `usage_count` for returned
      patterns

---

## Epic 3 — Cross-Project Propagation

**Goal:** Implement the background propagation engine, the
`get_pending_propagations` / `accept_propagation` / `reject_propagation`
MCP tools, and the `lore inbox` CLI surface.

**Depends on:** Epic 2 complete.

---

### Story 3.1 — Propagation Engine (Background Job)

**As a** platform,
**I want** proven lessons automatically suggested to projects with
similar stacks,
**so that** knowledge spreads without manual coordination.

**Acceptance Criteria:**

- [ ] Background job runs on configurable interval (default 1 hour via
      `PROPAGATION_INTERVAL_MS`)
- [ ] Job selects lessons where `occurrence_count >= 2` AND
      `severity IN ('critical', 'high')`
- [ ] For each qualifying lesson, finds other projects with at least
      one overlapping `stack_tag`
- [ ] **Tracker-agnostic** — propagation does not consider tracker type
      (a ClickUp lesson can propagate to a Jira project)
- [ ] Excludes: source project, projects already suggested
- [ ] Inserts `lesson_propagations` record with `status = 'suggested'`
- [ ] Job enabled/disabled via `PROPAGATION_ENABLED`
- [ ] Job logs run start, lessons evaluated, suggestions created

---

### Story 3.2 — `get_pending_propagations` Tool

**As a** developer (via AI agent or CLI),
**I want** to see pending lesson suggestions from other projects,
**so that** I can benefit from sister-project knowledge.

**Acceptance Criteria:**

- [ ] Returns all `lesson_propagations` where `target_project_id`
      matches authenticated project and `status = 'suggested'`
- [ ] Each result includes: lesson `title`, `problem` summary,
      `severity`, source `stack_tags`, `occurrence_count`
- [ ] Does **not** include source project name (privacy)
- [ ] Returns empty array if no pending suggestions

---

### Story 3.3 — `accept_propagation` and `reject_propagation` Tools

**As a** developer (via AI agent or CLI),
**I want** to accept or reject lesson suggestions from other projects,
**so that** I control what enters my project's knowledge base.

**Acceptance Criteria:**

- [ ] `accept_propagation` accepts `propagation_id`; copies source
      lesson to target project with `propagated_from` reference set;
      sets `status = 'accepted'`, records `reviewed_at`
- [ ] Copied lesson has `occurrence_count = 1` (fresh start)
- [ ] Copied lesson gets a new embedding generated (target context may
      differ semantically)
- [ ] `reject_propagation` accepts `propagation_id`; sets
      `status = 'rejected'`, records `reviewed_at`
- [ ] Both tools scoped to authenticated project — cannot act on another
      project's propagations

---

### Story 3.4 — `lore inbox` CLI Command (NEW)

**As a** project lead,
**I want** a CLI command to triage propagation suggestions,
**so that** I can review them without leaving the terminal.

**Acceptance Criteria:**

- [ ] `lore inbox` reads `lore.yaml`, fetches the project's API key
      from environment (`LORE_API_KEY`)
- [ ] Calls `GET /api/projects/:slug/inbox` (which internally uses
      `get_pending_propagations`)
- [ ] Prints each suggestion in human-readable form (title, problem
      summary, severity, source stack tags, occurrence count)
- [ ] For each suggestion, prompts: `[a]ccept | [r]eject | [s]kip |
[q]uit`
- [ ] Calls `accept_propagation` or `reject_propagation` accordingly
- [ ] Empty inbox prints a clear "no pending suggestions" message and
      exits 0

---

## Epic 4 — `@lore/cli` — Project Initialization

**Goal:** Implement `lore init` so a project lead can initialize a new
project's configuration in under 5 minutes (US-06, FR-08–FR-13).

**Depends on:** Epic 1 complete (needs project registration endpoint).

---

### Story 4.1 — `lore.yaml` Discovery and Parsing

**As a** CLI,
**I want** to find `lore.yaml` by walking up the directory tree,
**so that** developers can run CLI commands from any subdirectory of a
project.

**Acceptance Criteria:**

- [ ] `config-finder.ts` walks from cwd toward filesystem root
- [ ] Returns the first `lore.yaml` found; errors if none found
- [ ] `config-parser.ts` validates required fields: `lore.version`,
      `project.name`, `project.slug`, `mcp.server`, `repos[]`
- [ ] If `methodology:` is present, validates `tracker:` is also present
- [ ] Validation errors report the missing field and the file path
- [ ] Parsed config is fully typed (TypeScript interface)

---

### Story 4.2 — `lore init` Interactive Wizard

**As a** project lead,
**I want** an interactive CLI wizard to generate all project
configuration,
**so that** I can set up a new project without writing config by hand.

**Acceptance Criteria:**

- [ ] Wizard prompts for: project name, slug, list of repo paths, tech
      stacks per repo, Lore server URL
- [ ] Wizard offers: "Use a methodology layer? (Y/n)" — when yes,
      prompts for methodology type, version range, tracker type, and
      tracker-specific identifiers (space, lists, custom fields)
- [ ] When methodology declared, validates the tracker connection by
      calling bmad-mcp-server's tracker check tool
- [ ] Generates `lore.yaml` in current directory
- [ ] Generates `CLAUDE.md` from Handlebars template
- [ ] Generates `constitution.md` and `REPO_IDENTITY.md` for each
      declared repo
- [ ] Calls `POST /api/projects/register` on the Lore server
- [ ] Validates the Lore server is reachable before proceeding
- [ ] Displays the one-time API key and storage instructions
- [ ] Completes in under 5 minutes for a typical 3-repo project (US-06)

---

## Epic 5 — `@lore/cli` — Install and Update

**Goal:** Implement `lore install`, `lore update`, and the
ecosystem-integration steps so developers can set up and maintain AI
assistance with one command (US-01, FR-01–FR-07, FR-14–FR-17,
FR-50–FR-52).

**Depends on:** Epic 4 complete.

---

### Story 5.1 — `lore install`: MCP Configuration

**As a** developer,
**I want** `lore install` to configure my AI tools automatically,
**so that** I never manually edit MCP config files.

**Acceptance Criteria:**

- [ ] Writes/updates `~/.cursor/mcp.json` with `lore-memory`,
      `gitnexus`, and (when methodology declared) `bmad` server entries
- [ ] `bmad` entry pins version per `methodology.version` in
      `lore.yaml`
- [ ] Appends the CLAUDE.md include to `~/.claude/CLAUDE.md`
- [ ] Both operations are idempotent — running install twice does not
      duplicate entries
- [ ] If existing entries are found for the same project, updates them
      in place

---

### Story 5.2 — `lore install`: Version Compatibility Check

**As a** developer,
**I want** install to verify CLI compatibility with the running Lore
server,
**so that** I get a clear error early instead of mysterious runtime
failures.

**Acceptance Criteria:**

- [ ] Reads `lore.version` range from `lore.yaml`
- [ ] Calls `GET /health` on the Lore server, reads server version from
      response
- [ ] Aborts with a clear error if server version is outside the
      declared range
- [ ] Suggests `lore update` if the server is older

---

### Story 5.3 — `lore install`: Git Hooks

**As a** developer,
**I want** git hooks installed in every project repo declared in
`lore.yaml`,
**so that** the GitNexus index stays current after every commit and
merge.

**Acceptance Criteria:**

- [ ] Installs `post-commit` hook in each declared repo running
      `npx gitnexus analyze --incremental --quiet` in background
- [ ] Installs `post-merge` hook running the same command
- [ ] Hooks are non-blocking (fire and forget, exit 0 always)
- [ ] If a hook already exists, appends the gitnexus command rather
      than overwriting
- [ ] Idempotent: does not add the command twice if already present

---

### Story 5.4 — `lore install`: GitNexus Initial Analysis

**As a** developer,
**I want** `lore install` to run `gitnexus analyze` for each declared
repo,
**so that** the code-intelligence index is ready from the first
session.

**Acceptance Criteria:**

- [ ] Runs `npx gitnexus analyze` for each repo in `lore.yaml`
- [ ] Analysis runs sequentially per repo with progress indicator
- [ ] On failure, warns but does not abort install (GitNexus is
      non-blocking)
- [ ] Records analysis timestamp in `~/.lore/install-state.json`

---

### Story 5.5 — `lore install`: Idempotency and State

**As a** developer,
**I want** `lore install` to be safely re-runnable,
**so that** I can run it again after config changes without corrupting
state.

**Acceptance Criteria:**

- [ ] `~/.lore/install-state.json` records: last install timestamp,
      Lore server version verified, repos analyzed, hooks installed per
      repo
- [ ] Re-running install checks state and skips steps that are already
      current
- [ ] `--force` flag bypasses state check and reinstalls everything
- [ ] Full install of a 3–5 repo project completes in under 30 seconds
      (FR-07)

---

### Story 5.6 — `lore update`

**As a** project lead,
**I want** `lore update` to upgrade my Lore server image safely,
**so that** the team benefits from server improvements without breaking
the project.

**Acceptance Criteria:**

- [ ] Compares `lore.version` field in `lore.yaml` to available image
      tags in the Docker registry
- [ ] If newer compatible version exists: - Display image release notes - Verify backward-compatible schema migrations exist - Prompt for confirmation
- [ ] On confirmation: pulls new image, runs `db:migrate`, restarts
      `lore-memory-mcp`
- [ ] Updates `lore.version` field in `lore.yaml`
- [ ] On cancellation or failure, existing version remains unchanged

---

## Epic 6 — Security Hardening and NFR Validation

**Goal:** Verify and document that all security and performance
non-functional requirements are met before first deployment.

**Depends on:** Epics 1–5 complete.

---

### Story 6.1 — RLS Isolation Audit

**As a** security reviewer,
**I want** a documented test proving RLS prevents cross-project data
access,
**so that** we can deploy with confidence that project isolation holds.

**Acceptance Criteria:**

- [ ] Integration test creates two projects (A and B) with separate
      API keys
- [ ] Project A creates a lesson; Project B's `query_lessons` returns
      no results from Project A
- [ ] Project B's `search_similar` returns no results from Project A's
      lessons
- [ ] Project B's `query_lessons_for_task` returns no results from
      Project A
- [ ] Attempting `accept_propagation` with a propagation ID belonging
      to Project A from Project B's API key returns `403`
- [ ] Test in CI; merge blocked on failure

---

### Story 6.2 — Performance Benchmarks

**As a** platform administrator,
**I want** verified performance benchmarks for all NFRs,
**so that** I know the system will hold under expected load.

**Acceptance Criteria:**

- [ ] Load test seeds a project with 10,000 lessons and validates
      `query_lessons` P95 < 200ms (NFR-01)
- [ ] `search_similar` P95 < 500ms under same conditions (NFR-02)
- [ ] `query_lessons_for_task` P95 < 500ms under same conditions
      (NFR-03)
- [ ] Results documented in `docs/benchmarks.md` with test methodology

---

### Story 6.3 — API Key Security

**As a** platform administrator,
**I want** verified API key security guarantees,
**so that** compromised keys have limited blast radius.

**Acceptance Criteria:**

- [ ] `api_key_hash` column stores only bcrypt hash (cost 12); plain
      text never persisted (NFR-06, FR-49)
- [ ] `GET /api/projects` response never includes hash or any key
      material
- [ ] Auth middleware validates via `bcrypt.compare`, not string
      equality
- [ ] Rate limiting on auth: max 20 failed attempts per IP per minute
      → `429`
- [ ] Unit test confirms plain key not stored in DB after registration

---

### Story 6.4 — TLS and HTTPS Enforcement

**As a** platform administrator,
**I want** all MCP communication over HTTPS in production,
**so that** API keys and lesson content are not transmitted in the
clear.

**Acceptance Criteria:**

- [ ] Nginx configuration enforces TLS 1.2+ only (NFR-07)
- [ ] HTTP requests (port 80) redirected to HTTPS
- [ ] `lore.yaml` schema validation rejects `mcp.server` URLs without
      `https://` scheme (except `localhost` for development)
- [ ] `lore init` warns if the provided MCP server URL uses HTTP

---

### Story 6.5 — Provenance Integrity

**As a** security reviewer,
**I want** `provenance` data on lessons to be server-stamped, not
caller-supplied,
**so that** trust tiers cannot be falsified by a malicious or buggy
caller.

**Acceptance Criteria:**

- [ ] `capture_review_finding` ignores any `provenance` value passed by
      the caller and constructs the field server-side
- [ ] `save_lesson` ignores any `provenance` value passed by the caller
      and stamps `{ source: "manual", captured_by: <user_handle>,
trust_tier: "manual" }`
- [ ] Test: caller attempts to set `provenance.trust_tier = "high"` via
      `save_lesson` — server overrides and persists
      `trust_tier = "manual"`

---

## Story Sizing Summary

| Epic                                    | Stories | Complexity |
| --------------------------------------- | ------- | ---------- |
| 1 — Memory Server Foundation            | 4       | Medium     |
| 2 — Lessons, Sessions, BMAD Integration | 10      | High       |
| 3 — Cross-Project Propagation           | 4       | Medium     |
| 4 — CLI Init                            | 2       | Medium     |
| 5 — CLI Install & Update                | 6       | Medium     |
| 6 — Security and NFRs                   | 5       | Medium     |
| **Total**                               | **31**  |            |

## Recommended Sprint Sequence

| Sprint   | Epics                     | Goal                                                                                         |
| -------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| Sprint 1 | Epic 1 + Epic 2 (2.1–2.4) | Memory server up; lessons queryable; basic save/query/search working                         |
| Sprint 2 | Epic 2 (2.5–2.10)         | Sessions, BMAD bridge tools, patterns — full MCP surface for both core and BMAD-driven flows |
| Sprint 3 | Epic 3 + Epic 4           | Propagation + `lore inbox` + CLI init                                                        |
| Sprint 4 | Epic 5                    | Full CLI install + update + ecosystem wiring                                                 |
| Sprint 5 | Epic 6                    | Hardening, benchmarks, prod-ready                                                            |

**Highest-leverage validation milestone:** end of Sprint 2, when Story
2.9 (`capture_review_finding`) lands and BMAD's `clickup-code-review`
can be wired to it. That's the moment lessons start accumulating from
real PR reviews — the integration slice flagged in
`lore-bmad-ecosystem.md` §11.
