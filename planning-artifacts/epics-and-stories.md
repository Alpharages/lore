# Lore Platform — Epics and Stories

Version: 1.0.0
Status: Draft
Date: April 2026

---

## Overview

Seven epics mapped to PRD feature areas and the three-component architecture
(@lore/cli, lore-memory-mcp, lore-platform skills). Stories are ordered by
dependency — earlier epics must be substantially complete before later ones
can be tested end-to-end.

---

## Epic 1: Memory Server Foundation

**Goal:** Stand up the lore-memory-mcp service with database schema, auth
middleware, Row-Level Security, and health endpoint. All other epics depend
on this.

**Acceptance (Epic-level):** A running Docker container passes `/health`,
rejects unauthenticated requests, and enforces RLS so Project A cannot read
Project B data.

---

### Story 1.1 — Database Schema and Migrations

**As a** platform administrator,  
**I want** the full Postgres schema with pgvector applied via a repeatable
migration,  
**so that** all services start from a known, version-controlled state.

**Acceptance Criteria:**
- [ ] `npm run db:migrate` applies all Drizzle migrations idempotently
- [ ] Schema includes all 7 tables: `projects`, `repositories`, `lessons`,
      `patterns`, `sessions`, `lesson_propagations`, `preferences`
- [ ] `vector(1536)` column exists on `lessons.embedding` and
      `patterns.embedding`
- [ ] IVFFlat indexes created on both embedding columns
- [ ] GIN indexes created on all `stack_tags[]` columns
- [ ] RLS enabled on all tables except `projects`
- [ ] Project isolation policy applied: rows visible only when
      `project_id = current_setting('app.current_project_id')` or
      `project_id IS NULL` (for global lessons)
- [ ] `db:migrate` can run against a fresh DB and an already-migrated DB
      without error

**Technical Notes:**
- Use Drizzle ORM schema definitions in `src/db/schema.ts`
- `pgvector/pgvector:pg16` Docker image provides the extension
- See Architecture §4.2 for full DDL

---

### Story 1.2 — Auth Middleware and Project Registration

**As a** platform administrator,  
**I want** projects to register via a REST API and receive an API key,  
**so that** each project has a unique scoped credential for MCP access.

**Acceptance Criteria:**
- [ ] `POST /api/projects` accepts `{name, slug, stack_tags[]}` and returns
      a one-time plain-text API key in format `lore_{slug}_{24_random_chars}`
- [ ] The plain-text key is shown exactly once; only bcrypt hash (cost 12)
      stored in DB
- [ ] `GET /api/projects` returns a list of registered projects (no key data)
- [ ] `DELETE /api/projects/:slug` deregisters a project and cascades deletes
- [ ] Auth middleware extracts `Authorization: Bearer <key>` from every MCP
      request, resolves `project_id`, and sets `app.current_project_id` for
      the DB connection
- [ ] Requests with missing or invalid API keys return `401`
- [ ] Admin endpoints are protected by a separate `ADMIN_SECRET` env var

---

### Story 1.3 — Docker Compose and Health Endpoint

**As a** platform administrator,  
**I want** a single `docker compose up` to bring up the full stack,  
**so that** deployment is reproducible with no manual steps.

**Acceptance Criteria:**
- [ ] `docker compose up` starts `postgres`, `mcp-server`, and `nginx`
      services
- [ ] `postgres` healthcheck passes before `mcp-server` starts
- [ ] `GET /health` returns JSON with `status`, `db`, `db_lessons_count`,
      `db_projects_count`, `openai`, `uptime_seconds`
- [ ] `GET /metrics` returns Prometheus-compatible metrics for all alert
      thresholds in Architecture §8.3
- [ ] Nginx terminates TLS and proxies to `mcp-server:3100`
- [ ] All secrets supplied via environment variables; no secrets in
      `docker-compose.yml`

---

### Story 1.4 — Structured Logging

**As a** platform administrator,  
**I want** every MCP tool call logged in structured JSON,  
**so that** I can monitor performance and debug failures.

**Acceptance Criteria:**
- [ ] Every MCP tool call emits a log entry with: `tool`, `project_id`,
      `duration_ms`, `result_count` (where applicable), `success`, `timestamp`
- [ ] `project_id` is redacted (masked) in log output, not the full UUID
- [ ] Log level controlled by `LOG_LEVEL` env var (`debug|info|warn|error`)
- [ ] Errors include stack trace at `debug` level only

---

## Epic 2: Memory Server — Lessons and Sessions

**Goal:** Implement all MCP tools for lessons and sessions as defined in
PRD §7.4 and §7.5.

**Depends on:** Epic 1 complete.

---

### Story 2.1 — save_lesson Tool

**As a** developer (via AI agent),  
**I want** the agent to save a lesson after encountering a problem,  
**so that** the team's institutional knowledge is preserved.

**Acceptance Criteria:**
- [ ] Tool accepts: `title`, `problem`, `root_cause`, `fix`,
      `prevention_rule`, `stack_tags[]`, `category`, `severity`
      (`critical|high|medium|low`), optional `repo_id`
- [ ] On save, triggers async embedding generation via OpenAI
      (`text-embedding-3-small`, 1536 dims)
- [ ] `embedding_status` starts as `pending`, transitions to `complete` or
      `failed`
- [ ] Returns the new lesson `id` and `embedding_status`
- [ ] Scoped to authenticated project's `project_id`

---

### Story 2.2 — Semantic Deduplication on save_lesson

**As a** platform,  
**I want** duplicate lessons to be merged automatically,  
**so that** the lesson database stays clean and occurrence counts are accurate.

**Acceptance Criteria:**
- [ ] Before inserting a new lesson, `search_similar` runs against existing
      project lessons
- [ ] If cosine similarity >= 0.90, `increment_occurrence` is called on the
      existing lesson instead of inserting a new one
- [ ] `increment_occurrence` increments `occurrence_count`, appends to
      `hit_by_users[]`, and updates `last_seen_at`
- [ ] The tool response indicates whether a new lesson was created or an
      existing one was updated, including the matched lesson `id`
- [ ] Deduplication runs only within the same project (not cross-project)

---

### Story 2.3 — query_lessons Tool

**As a** developer (via AI agent),  
**I want** to retrieve relevant past lessons at session start,  
**so that** I avoid mistakes my team has already made.

**Acceptance Criteria:**
- [ ] Tool accepts optional filters: `stack_tags[]`, `category`, `severity`,
      `date_from`, `date_to`, `repo_id`
- [ ] Results ranked by relevance score combining: recency, frequency
      (occurrence_count), stack tag overlap, and severity weight
- [ ] Returns lessons scoped to the authenticated project plus global lessons
      (where `project_id IS NULL`)
- [ ] Response time < 200ms for projects with up to 10,000 lessons (NFR-01)
- [ ] Returns max 20 results by default; accepts `limit` parameter up to 100

---

### Story 2.4 — search_similar Tool

**As a** developer (via AI agent),  
**I want** to find lessons semantically related to a natural language query,  
**so that** I can discover relevant knowledge even without exact keyword matches.

**Acceptance Criteria:**
- [ ] Tool accepts a `text` string (natural language description of a problem
      or task)
- [ ] Embeds the input and runs pgvector cosine similarity search
- [ ] Returns lessons ordered by cosine similarity descending
- [ ] Response time < 500ms (NFR-02)
- [ ] Scoped to authenticated project + global lessons
- [ ] Accepts optional `threshold` (default 0.75) and `limit` (default 10)

---

### Story 2.5 — start_session and end_session Tools

**As a** developer (via AI agent),  
**I want** my work sessions recorded with context and outcomes,  
**so that** my teammates can pick up where I left off.

**Acceptance Criteria:**
- [ ] `start_session` accepts: `repo_id`, `branch`, `task_summary`,
      `user_handle`; returns `session_id`
- [ ] `end_session` accepts: `session_id`, `decisions[]`, `errors_hit[]`
      (lesson IDs), `files_touched[]`; marks session `ended_at`
- [ ] Both tools scoped to authenticated project

---

### Story 2.6 — get_session_handoff Tool

**As a** developer (via AI agent),  
**I want** to see a summary of the most recent session for this repo,  
**so that** I can resume work without losing context.

**Acceptance Criteria:**
- [ ] Returns the most recent session for the project/repo combination
- [ ] Includes: `task_summary`, `branch`, `decisions[]`, `files_touched[]`,
      `started_at`, `ended_at`, and lesson titles for `errors_hit[]`
- [ ] If no previous session exists, returns a clear empty state (not an error)
- [ ] Response is human-readable (formatted for display in AI agent output)

---

### Story 2.7 — Patterns Tools (save_pattern, get_patterns)

**As a** developer (via AI agent),  
**I want** to save and retrieve reusable code patterns,  
**so that** the team converges on proven implementation approaches.

**Acceptance Criteria:**
- [ ] `save_pattern` accepts: `title`, `description`, `code_example`,
      `stack_tags[]`, `category`; generates embedding
- [ ] `get_patterns` filters by `stack_tags[]` and `category`; returns
      results sorted by `usage_count` descending
- [ ] Scoped to authenticated project + global patterns
- [ ] Calling `get_patterns` increments `usage_count` for returned patterns

---

### Story 2.8 — update_preferences Tool

**As a** developer (via AI agent),  
**I want** my per-developer preferences persisted on the server,  
**so that** my AI agent behaves consistently across machines.

**Acceptance Criteria:**
- [ ] `update_preferences` accepts: `user_handle`, `prefs` (JSONB — any
      key-value structure)
- [ ] Upserts on `(project_id, user_handle)` unique constraint
- [ ] Returns the full merged `prefs` object after update
- [ ] Preferences are isolated per project

---

## Epic 3: Memory Server — Cross-Project Propagation

**Goal:** Implement the background propagation engine and the
`suggest_propagations` / `accept_propagation` MCP tools as defined in
PRD §7.6.

**Depends on:** Epic 2 complete.

---

### Story 3.1 — Propagation Engine (Background Job)

**As a** platform,  
**I want** proven lessons to be automatically suggested to projects with
similar stacks,  
**so that** knowledge spreads without manual coordination.

**Acceptance Criteria:**
- [ ] Background job runs on configurable interval (default 1 hour via
      `PROPAGATION_INTERVAL_MS` env var)
- [ ] Job selects lessons where `occurrence_count >= 2` AND
      `severity IN ('critical', 'high')`
- [ ] For each qualifying lesson, finds other projects with at least one
      overlapping `stack_tag`
- [ ] Excludes: source project, projects that already have this suggestion
      (unique constraint on `source_lesson_id, target_project_id`)
- [ ] Inserts `lesson_propagations` record with `status = 'suggested'`
- [ ] Job is enabled/disabled via `PROPAGATION_ENABLED` env var
- [ ] Job logs run start, lessons evaluated, and suggestions created

---

### Story 3.2 — suggest_propagations Tool

**As a** developer (via AI agent),  
**I want** to see pending lesson suggestions from other projects at session
start,  
**so that** I can benefit from other teams' hard-won knowledge.

**Acceptance Criteria:**
- [ ] Returns all `lesson_propagations` where `target_project_id` matches
      authenticated project and `status = 'suggested'`
- [ ] Each result includes: lesson `title`, `problem` summary, `severity`,
      source project `stack_tags`, `occurrence_count`
- [ ] Does not include source project name (privacy — projects may not know
      each other)
- [ ] Returns empty array if no pending suggestions

---

### Story 3.3 — accept_propagation and reject_propagation Tools

**As a** developer (via AI agent),  
**I want** to accept or reject lesson suggestions from other projects,  
**so that** I control what enters my project's knowledge base.

**Acceptance Criteria:**
- [ ] `accept_propagation` accepts `propagation_id`; copies source lesson
      to target project with `propagated_from` reference set; sets
      `status = 'accepted'`, records `reviewed_at`
- [ ] `reject_propagation` accepts `propagation_id`; sets
      `status = 'rejected'`, records `reviewed_at`
- [ ] Copied lessons have `occurrence_count = 1` (fresh start in new project)
- [ ] Both tools are scoped to authenticated project — cannot act on another
      project's propagations

---

## Epic 4: @lore/cli — Project Initialization

**Goal:** Implement `lore init` so a project lead can initialize a new
project's AI configuration in under 5 minutes (US-06, FR-09–FR-12).

**Depends on:** Epic 1 complete (needs project registration endpoint).

---

### Story 4.1 — lore.yaml Discovery and Parsing

**As a** CLI,  
**I want** to find `lore.yaml` by walking up the directory tree,  
**so that** developers can run CLI commands from any subdirectory of a project.

**Acceptance Criteria:**
- [ ] `config-finder.ts` walks from cwd toward filesystem root
- [ ] Returns the first `lore.yaml` found; errors if none found
- [ ] `config-parser.ts` validates required fields: `name`, `slug`,
      `mcp_server`, `skill_version`, `repos[]`
- [ ] Validation errors report the missing field and the file path
- [ ] Parsed config is typed (TypeScript interface)

---

### Story 4.2 — lore init Interactive Wizard

**As a** project lead,  
**I want** an interactive CLI wizard to generate all project configuration
files,  
**so that** I can set up a new project without writing config by hand.

**Acceptance Criteria:**
- [ ] Wizard prompts for: project name, slug, list of repo paths, tech
      stacks per repo, MCP server URL, skill version
- [ ] Generates `lore.yaml` in current directory
- [ ] Generates `CLAUDE.md` from Handlebars template for each declared repo
- [ ] Generates `constitution.md` for each declared repo
- [ ] Generates `REPO_IDENTITY.md` for each declared repo
- [ ] Calls `POST /api/projects` on the MCP server to register the project
- [ ] Validates MCP server is reachable before proceeding (FR-12)
- [ ] Displays the one-time API key and instructs user to add it to their
      secrets store
- [ ] Completes in under 5 minutes for a typical 3-repo project (US-06)

---

## Epic 5: @lore/cli — Install and Update

**Goal:** Implement `lore install` and `lore update` so developers can set
up and maintain AI assistance with one command (US-01, FR-01–FR-16).

**Depends on:** Epic 4 complete (needs `lore.yaml` structure finalized).

---

### Story 5.1 — lore install: Skill Download

**As a** developer,  
**I want** `lore install` to download the correct skill version declared in
`lore.yaml`,  
**so that** my AI agent uses the team's approved behavior configuration.

**Acceptance Criteria:**
- [ ] CLI reads `skill_version` from `lore.yaml`
- [ ] Fetches release metadata from GitHub Releases for `lore-platform`
- [ ] Downloads `skills.tar.gz` for the specified version
- [ ] Extracts skills to `~/.lore/skills/{project_slug}/v{version}/`
- [ ] Records installed version in `~/.lore/install-state.json`
- [ ] Idempotent: if correct version already installed, skips download
- [ ] Download completes within 60 seconds on a typical connection (FR-07)

---

### Story 5.2 — lore install: Cursor and Claude MCP Configuration

**As a** developer,  
**I want** `lore install` to configure my AI tools automatically,  
**so that** I never manually edit MCP config files.

**Acceptance Criteria:**
- [ ] Writes/updates `~/.cursor/mcp.json` to include the lore-memory-mcp
      server entry with `url` and `Authorization` header (FR-03)
- [ ] Appends the `lore.yaml` skills path include to `~/.claude/CLAUDE.md`
      (FR-06)
- [ ] Both operations are idempotent — running install twice does not
      duplicate entries
- [ ] If existing entries are found for the same project, they are updated
      in place

---

### Story 5.3 — lore install: Git Hooks

**As a** developer,  
**I want** git hooks installed in every project repo declared in `lore.yaml`,  
**so that** the GitNexus index stays current after every commit and merge.

**Acceptance Criteria:**
- [ ] Installs `post-commit` hook in each declared repo running
      `npx gitnexus analyze --incremental --quiet` in background (FR-05)
- [ ] Installs `post-merge` hook running the same command (FR-46)
- [ ] Hooks are non-blocking (fire and forget, exit 0 always)
- [ ] If a hook already exists, appends the gitnexus command rather than
      overwriting
- [ ] Idempotent: does not add the command twice if already present

---

### Story 5.4 — lore install: GitNexus Initial Analysis

**As a** developer,  
**I want** `lore install` to run `gitnexus analyze` for each declared repo,  
**so that** the code intelligence index is ready from the first session.

**Acceptance Criteria:**
- [ ] Runs `npx gitnexus analyze` for each repo listed in `lore.yaml`
      (FR-04, FR-44)
- [ ] Analysis runs sequentially per repo with progress indicator
- [ ] On failure, warns but does not abort install (GitNexus is non-blocking)
- [ ] Records analysis timestamp in `~/.lore/install-state.json`

---

### Story 5.5 — lore install: Idempotency and State

**As a** developer,  
**I want** `lore install` to be safely re-runnable,  
**so that** I can run it again after config changes without corrupting state.

**Acceptance Criteria:**
- [ ] `~/.lore/install-state.json` records: last install timestamp, installed
      skill version, repos analyzed, hooks installed per repo
- [ ] Re-running install checks state and skips steps that are already current
- [ ] `--force` flag bypasses state check and reinstalls everything
- [ ] Full install of a 3–5 repo project with ~1000 files each completes
      in under 60 seconds (FR-07)

---

### Story 5.6 — lore update

**As a** project lead,  
**I want** `lore update` to check for and apply new skill versions,  
**so that** the team benefits from improvements without manual file management.

**Acceptance Criteria:**
- [ ] Checks GitHub Releases for versions newer than `skill_version` in
      `lore.yaml` (FR-13)
- [ ] Displays a changelog diff (release notes) between current and latest
      version before applying (FR-14)
- [ ] Prompts for confirmation before applying major version bumps (FR-15)
- [ ] On confirmation, downloads new skills tarball and updates
      `~/.lore/skills/` and `lore.yaml` version field (FR-16)
- [ ] On cancellation or failure, existing version remains unchanged

---

## Epic 6: Skills — Bootstrap and Auto-Capture

**Goal:** Implement the `/bootstrap` and lesson auto-capture skills as
markdown skill files in the `lore-platform` repository (PRD §7.8, §7.9).

**Depends on:** Epics 2 and 5 complete (needs MCP tools and installed skills
path).

---

### Story 6.1 — Bootstrap Skill

**As a** developer,  
**I want** to type `/bootstrap` at session start and immediately receive all
relevant context,  
**so that** I can begin productive work without any manual setup.

**Acceptance Criteria:**
- [ ] Skill reads `lore.yaml` by walking up from the cwd (FR-35)
- [ ] Fires all MCP calls as parallel tool calls in a single response:
      `query_lessons`, `search_similar`, `get_session_handoff`,
      `suggest_propagations` (FR-36)
- [ ] Simultaneously queries GitNexus for repo stats and staged diff context
- [ ] Displays a session report with all sections defined in FR-37:
      constitution status, repo identity, top 5 lessons, semantic matches,
      session handoff, MCP status, GitNexus stats, cross-project suggestions
- [ ] Checks current git branch and blocks work if branch is in
      `protected_branches` list in `lore.yaml` (FR-38)
- [ ] Asks: "New task or continuing existing work?" and guides branch
      creation or sync accordingly (FR-39)
- [ ] Total time from `/bootstrap` to displayed report < 3 seconds (NFR-03)
- [ ] If MCP server is unreachable, bootstrap completes without memory
      context (degraded mode) rather than blocking (Architecture principle 4)

---

### Story 6.2 — GitNexus Staleness Check in Bootstrap

**As a** developer,  
**I want** bootstrap to warn me if the GitNexus index is stale,  
**so that** code intelligence reflects the current state of the repo.

**Acceptance Criteria:**
- [ ] Bootstrap checks `~/.lore/install-state.json` for last GitNexus
      analysis timestamp per repo (FR-48)
- [ ] If index is older than 24 hours, triggers
      `npx gitnexus analyze --incremental --quiet` in background
- [ ] Displays a brief "Re-indexing in background" notice (non-blocking)

---

### Story 6.3 — Auto-Capture Skill (Lesson Tracking)

**As a** developer,  
**I want** the AI agent to automatically capture lessons when I hit the same
error twice,  
**so that** institutional knowledge is built without any effort on my part.

**Acceptance Criteria:**
- [ ] Skill silently tracks error types encountered during a session (FR-40)
- [ ] On second occurrence of the same error type in a session, automatically
      calls `save_lesson` without prompting (FR-41)
- [ ] Auto-captured lesson includes: error message, current repo's
      `stack_tags`, inferred `category` from error type, inferred `severity`
      from impact (FR-42)
- [ ] Before `save_lesson`, calls `search_similar` with the error message
- [ ] If similarity >= 0.90, calls `increment_occurrence` instead of creating
      a new lesson (FR-43)
- [ ] No user-visible output during tracking; only surfaces on
      "Lesson captured" or "Occurrence count updated" events

---

## Epic 7: Security Hardening and NFR Validation

**Goal:** Verify and document that all security and performance non-functional
requirements are met before first deployment.

**Depends on:** Epics 1–6 complete.

---

### Story 7.1 — RLS Isolation Audit

**As a** security reviewer,  
**I want** a documented test proving RLS prevents cross-project data access,  
**so that** we can deploy with confidence that project isolation holds.

**Acceptance Criteria:**
- [ ] Integration test creates two projects (A and B) with separate API keys
- [ ] Project A creates a lesson; Project B's `query_lessons` returns no
      results from Project A
- [ ] Project B's `search_similar` returns no results from Project A's lessons
- [ ] Attempting to call `accept_propagation` with a propagation ID
      belonging to Project A from Project B's API key returns `403`
- [ ] Test is in CI and blocks merge on failure

---

### Story 7.2 — Performance Benchmarks

**As a** platform administrator,  
**I want** verified performance benchmarks for all NFRs,  
**so that** I know the system will hold under expected load.

**Acceptance Criteria:**
- [ ] Load test seeds a project with 10,000 lessons and validates
      `query_lessons` P95 < 200ms (NFR-01)
- [ ] `search_similar` P95 < 500ms under same conditions (NFR-02)
- [ ] Bootstrap end-to-end (all parallel MCP calls) completes < 3s on a
      clean project with 100 lessons (NFR-03)
- [ ] Results are documented in `docs/benchmarks.md` with test methodology

---

### Story 7.3 — API Key Security

**As a** platform administrator,  
**I want** verified API key security guarantees,  
**so that** compromised keys have limited blast radius.

**Acceptance Criteria:**
- [ ] `api_key_hash` column in `projects` table stores only bcrypt hash
      (cost 12); plain text never persisted (NFR-06)
- [ ] `GET /api/projects` response never includes key hash or any key material
- [ ] Auth middleware validates via `bcrypt.compare`, not string equality
- [ ] Rate limiting on auth: max 20 failed attempts per IP per minute before
      `429`
- [ ] Unit test confirms plain key is not stored in DB after registration

---

### Story 7.4 — TLS and HTTPS Enforcement

**As a** platform administrator,  
**I want** all MCP communication over HTTPS in production,  
**so that** API keys and lesson content are not transmitted in the clear.

**Acceptance Criteria:**
- [ ] Nginx configuration enforces TLS 1.2+ only (NFR-07)
- [ ] HTTP requests (port 80) redirected to HTTPS
- [ ] `lore.yaml` schema validation rejects `mcp_server` URLs without
      `https://` scheme (except `localhost` for development)
- [ ] `lore init` warns if the provided MCP server URL uses HTTP

---

## Story Sizing Summary

| Epic | Stories | Complexity |
|------|---------|------------|
| 1 — Memory Server Foundation | 4 | Medium |
| 2 — Lessons and Sessions | 8 | High |
| 3 — Cross-Project Propagation | 3 | Medium |
| 4 — CLI Init | 2 | Medium |
| 5 — CLI Install and Update | 6 | Medium |
| 6 — Skills | 3 | Low-Medium |
| 7 — Security and NFRs | 4 | Medium |
| **Total** | **30** | |

## Recommended Sprint Sequence

| Sprint | Epics | Goal |
|--------|-------|------|
| Sprint 1 | Epic 1 + Epic 2 (Stories 2.1–2.4) | Memory server up, lessons queryable |
| Sprint 2 | Epic 2 (Stories 2.5–2.8) + Epic 3 | Sessions, propagation, full MCP surface |
| Sprint 3 | Epic 4 + Epic 5 (Stories 5.1–5.3) | CLI init + core install |
| Sprint 4 | Epic 5 (Stories 5.4–5.6) + Epic 6 | Full CLI + skills |
| Sprint 5 | Epic 7 | Hardening, benchmarks, prod-ready |