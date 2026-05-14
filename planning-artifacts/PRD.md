# Lore Platform — Product Requirements Document

Version: 1.0.0
Status: Final (Draft for Implementation)
Date: 2026-05-06

---

## 1. Executive Summary

Lore is the institutional memory layer for BMAD-driven development. It
captures, recalls, and propagates lessons learned across sessions,
developers, and projects so that AI coding agents stop repeating mistakes
the team has already solved.

Lore consists of two components: a self-hosted memory server
(`lore-memory-mcp`, Postgres + pgvector + MCP tools) and a CLI
(`@alpharages/lore`) that wires the development ecosystem together. Lore does not
own methodology, tracker integration, or AI agent behavior — those belong
to bmad-mcp-server. Lore exposes MCP tools; BMAD custom-skills call them
by convention.

The system is designed to compound. Every code review captured by BMAD's
`clickup-code-review` becomes a lesson. Lessons accumulate across projects
on the same stack. BMAD planning agents query Lore before producing PRDs
and architecture documents — making the next planning cycle smarter than
the last.

Design rationale: see `lore-bmad-ecosystem.md` for the discussion that
shaped these scope decisions.

---

## 2. Problem Statement

### 2.1 Current State

Teams using AI coding assistants face these problems:

1. **Zero institutional memory.** Every session starts from scratch. The
   agent has no knowledge of past mistakes, team decisions, or proven
   patterns.

2. **Knowledge loss.** When a developer solves a hard bug, that knowledge
   lives only in their head or in a closed PR comment. The next developer
   hits the same bug.

3. **Code-review insights die in PR comments.** Reviewers (human or AI)
   flag the same anti-patterns repeatedly because findings are not
   captured anywhere queryable.

4. **No cross-project learning.** A team running NestJS in two projects
   relearns the same database mistakes in each.

5. **Onboarding friction.** New developers spend weeks learning lessons
   the team already learned the hard way.

### 2.2 Impact

- Repeated bugs across developers, sessions, and projects
- Inconsistent code quality despite adversarial review
- High cognitive load on developers to manually provide context
- No compounding improvement in AI assistance over time

---

## 3. Vision

> Every code review automatically teaches the team's AI agents. Every
> lesson learned propagates to other projects on the same stack. Every
> BMAD planning workflow starts informed by what already failed and what
> already worked.

AI assistance compounds when memory is shared. The longer a team uses
Lore, the more BMAD's left side (planning) is shaped by what BMAD's right
side (execution) discovered.

---

## 4. Goals and Non-Goals

### 4.1 Goals

- **G1** Persistent, semantically searchable memory of lessons and
  patterns, scoped per project with cross-project propagation
- **G2** Automatic capture from BMAD code-review findings via
  `capture_review_finding`
- **G3** Just-in-time memory recall during BMAD execution skills via
  `query_lessons_for_task` and `start_session_from_task`
- **G4** Project isolation enforced at the database level via Row-Level
  Security
- **G5** Zero-friction install — one CLI command wires lore-memory +
  bmad-mcp-server + GitNexus into Cursor/Claude
- **G6** Tracker-agnostic — works with ClickUp today, Jira/Asana when
  bmad-mcp-server adds them
- **G7** Self-hostable; no SaaS dependency

### 4.2 Non-Goals

- **NOT** a methodology or workflow system (bmad-mcp-server's domain)
- **NOT** a tracker or PM tool (ClickUp/Jira/Asana via bmad-mcp-server)
- **NOT** a code-intelligence layer (GitNexus's domain)
- **NOT** a behavior platform — Lore exposes MCP tools, not skills
- **NOT** a code-review tool — review is BMAD's job; Lore captures the
  findings
- **NOT** a session-bootstrap or git-workflow tool
- **NOT** a SaaS product (self-hosted only)
- **NOT** a per-developer separate memory pool — memory is team-shared,
  project-isolated

---

## 5. Users and Personas

### 5.1 Developer (Primary)

**Profile:** Software engineer using Cursor or Claude Code on a project
with bmad-mcp-server installed.

**Goals:**

- Get relevant past lessons surfaced automatically when starting a
  tracked task
- Have AI code reviews automatically capture findings as reusable lessons
- Avoid repeating bugs the team already solved

**Interaction with Lore:**

- Runs `lore install` once
- Invokes BMAD skills (`clickup-dev-implement`, `clickup-code-review`);
  Lore is invisibly queried/updated by those skills
- Occasionally runs `lore inbox` to triage propagation suggestions

### 5.2 Project Lead (Secondary)

**Profile:** Tech lead responsible for a project's setup and
AI-assistance quality.

**Goals:**

- Initialize a new project so all developers benefit from team memory
- Ensure proven lessons propagate from sister projects on the same stack

**Interaction with Lore:**

- Runs `lore init` to create `lore.yaml`, register the project, and
  obtain an API key
- Reviews `lore inbox` periodically to accept/reject cross-project
  propagation suggestions

### 5.3 Platform Administrator (Tertiary)

**Profile:** DevOps or platform engineer maintaining the Lore
infrastructure.

**Goals:**

- Keep `lore-memory-mcp` running reliably
- Manage project registration and API keys

**Interaction with Lore:**

- Manages Docker deployment
- Creates/revokes project API keys via admin REST endpoints

---

## 6. System Components

Lore is two components plus a per-project config artifact.

### 6.1 `@alpharages/lore` (npm package)

The developer-facing CLI. Handles install, project initialization, MCP
config writing for all three ecosystem servers (lore-memory +
bmad-mcp-server + GitNexus), the `lore inbox` propagation surface, and
version-compatibility checks. Installed globally once per developer.

### 6.2 `lore-memory-mcp` (Docker, self-hosted)

Always-on HTTP server exposing memory tools via MCP. Backed by PostgreSQL
with pgvector. Stores lessons, patterns, sessions, and propagation
suggestions. Enforces project isolation via Row-Level Security. Runs the
cross-project propagation engine on a schedule.

### 6.3 `lore.yaml` (per-project config artifact)

A single YAML file committed to the project's primary repository.
Declares project identity, repos, stack tags, methodology + tracker
(when used), Lore server URL, and version pins. Acts as the project's
**ratification document** — `@alpharages/lore` reads it to wire everything
else.

---

## 7. Feature Requirements

### 7.1 CLI — `lore install`

- **FR-01** CLI must read `lore.yaml` from the current directory or any
  parent directory.
- **FR-02** CLI must validate `lore.yaml` against the v1.0 schema; abort
  on missing required fields with a clear error.
- **FR-03** CLI must write or update `~/.cursor/mcp.json` with entries
  for `lore-memory`, `gitnexus`, and (when methodology is declared)
  `bmad-mcp-server`.
- **FR-04** CLI must write the CLAUDE.md include path to
  `~/.claude/CLAUDE.md`.
- **FR-05** CLI must verify `lore-memory-mcp` server reachability and
  version compatibility against the `lore.version` range in `lore.yaml`.
- **FR-06** CLI must be idempotent — running `lore install` multiple
  times must not corrupt MCP config or duplicate entries.
- **FR-07** Install must complete in under 30 seconds for a typical
  project.

### 7.2 CLI — `lore init`

- **FR-08** CLI must interactively gather project name, slug, repo list,
  stack tags per repo, and Lore server URL.
- **FR-09** CLI must offer a methodology layer (BMAD). When accepted, it
  prompts for tracker type (`clickup` | `jira` | `asana`) and
  tracker-specific identifiers (space, lists, custom fields).
- **FR-10** CLI must validate the tracker connection during init when
  methodology is declared (by calling bmad-mcp-server's tracker check
  tool).
- **FR-11** CLI must generate `lore.yaml`, `CLAUDE.md`,
  `constitution.md`, and `REPO_IDENTITY.md` for each declared repo.
- **FR-12** CLI must register the project with `lore-memory-mcp` via REST
  and display the one-time API key with storage instructions.
- **FR-13** CLI must complete in under 5 minutes for a typical 3-repo
  project.

### 7.3 CLI — `lore update`

- **FR-14** CLI must check the `lore-memory-mcp` Docker image registry
  for newer versions matching the `lore.version` range in `lore.yaml`.
- **FR-15** CLI must display a changelog before applying updates.
- **FR-16** CLI must verify backward-compatible schema migrations exist
  before pulling a new image.
- **FR-17** CLI must update the `lore.version` field in `lore.yaml` after
  a successful update.

### 7.4 CLI — `lore inbox`

- **FR-18** CLI must list all pending lesson-propagation suggestions for
  the current project.
- **FR-19** For each suggestion, CLI must display the source lesson
  title, problem summary, severity, source stack tags, and occurrence
  count — without revealing the source project name.
- **FR-20** CLI must accept interactive accept/reject responses and call
  the corresponding MCP tools.

### 7.5 Memory Server — Lessons

- **FR-21** Server must store lessons with: `title`, `problem`,
  `root_cause`, `fix`, `prevention_rule`, `stack_tags`, `category`,
  `severity`, `occurrence_count`, `provenance` (JSONB), and optional
  `external_task_id` / `external_task_ref` / `external_tracker_type`.
- **FR-22** Server must generate OpenAI embeddings for every lesson on
  save (`text-embedding-3-small`, 1536 dims).
- **FR-23** `query_lessons` must support filtering by `stack_tags`,
  `category`, `severity`, date range, and `repo_id`.
- **FR-24** `query_lessons` must rank results by a relevance score that
  combines recency, frequency, stack-tag overlap, severity, and
  provenance trust tier.
- **FR-25** `search_similar` must accept a natural-language string and
  return semantically similar lessons via pgvector cosine similarity.
- **FR-26** `save_lesson` must check for semantic duplicates (cosine
  similarity ≥ 0.90) and increment `occurrence_count` on the matched
  lesson rather than inserting a new row.
- **FR-27** Lessons must be scoped to one of: global (null `project_id`),
  project-level, or repo-level.

### 7.6 Memory Server — Sessions and BMAD Integration

- **FR-28** `start_session_from_task` must accept `external_task_id` +
  `external_tracker_type` and either resume an existing session for that
  task or create a new one. Resume returns a `prior_session_summary`.
- **FR-29** `start_session_from_task` must record `bmad_skill`,
  `bmad_workflow`, `branch`, and `user_handle`.
- **FR-30** `start_session` (no task ID) must remain available for
  manual sessions outside a tracker.
- **FR-31** `end_session` must record `decisions` (JSONB), `lessons_applied`
  (UUIDs), and `files_touched` (text array).
- **FR-32** `query_lessons_for_task` must accept an `external_task_id`
  plus optional `task_context` (title, description, parent_epic_id,
  stack_tags) and return relevant lessons + patterns ranked by combined
  semantic, tag-overlap, and epic-scoped relevance.
- **FR-33** `link_lessons_to_task` must record both `consulted` (lesson
  IDs shown to the agent) and `applied` (lesson IDs the agent acted on)
  against the active session.
- **FR-34** `capture_review_finding` must accept structured review
  output (severity + finding fields per the tech-spec) plus
  `external_task_id` and create a lesson with
  `provenance.trust_tier = "high"` and
  `provenance.source = "bmad-code-review"`.
- **FR-35** `capture_review_finding` must run the same
  semantic-deduplication check as `save_lesson`.

### 7.7 Memory Server — Patterns

- **FR-36** `save_pattern` must accept `title`, `description`,
  `code_example`, `stack_tags`, `category`; generate an embedding.
- **FR-37** `get_patterns` must filter by `stack_tags` and `category`,
  return results sorted by `usage_count` descending.
- **FR-38** Calling `get_patterns` must increment `usage_count` for
  returned patterns.

### 7.8 Memory Server — Cross-Project Propagation

- **FR-39** A background job must run on a configurable interval
  (default: 1 hour) to identify lessons with `occurrence_count >= 2` and
  `severity IN ('critical','high')`.
- **FR-40** For each qualifying lesson, the job must identify other
  projects with overlapping `stack_tags` and create
  `lesson_propagations` records with `status = 'suggested'`.
- **FR-41** Propagation must be tracker-agnostic — a lesson captured in
  a ClickUp-tracked project can propagate to a Jira-tracked project on
  the same stack.
- **FR-42** `get_pending_propagations` MCP tool must return pending
  suggestions for the current project (also the data source for
  `lore inbox`).
- **FR-43** `accept_propagation` must copy the source lesson to the
  target project with `propagated_from` set and `occurrence_count` reset
  to 1.
- **FR-44** `reject_propagation` must mark the suggestion as `rejected`
  with `reviewed_at` timestamp.

### 7.9 Memory Server — Project Isolation

- **FR-45** Every project must have a unique API key issued at
  registration.
- **FR-46** Row-Level Security must be enabled on all data tables
  (`lessons`, `patterns`, `sessions`, `repositories`,
  `lesson_propagations`).
- **FR-47** An authenticated request must only be able to read or write
  data belonging to its own project, plus global (null `project_id`)
  records where the table allows.
- **FR-48** No application-level filtering for isolation — isolation
  must be enforced at the database level only.
- **FR-49** API keys must be stored as bcrypt hashes (cost 12); plain
  text must never be persisted.

### 7.10 Ecosystem Integration

- **FR-50** `lore install` must run `npx gitnexus analyze` for each repo
  on first install.
- **FR-51** `lore install` must install `post-commit` and `post-merge`
  git hooks that run `npx gitnexus analyze --incremental --quiet` in
  the background.
- **FR-52** When methodology is declared, `lore install` must add the
  bmad-mcp-server entry to `~/.cursor/mcp.json` with the version pinned
  per `methodology.version` in `lore.yaml`.
- **FR-53** BMAD custom-skills are expected (by convention, not
  enforcement) to call Lore MCP tools at the documented integration
  points (see `lore-bmad-ecosystem.md` §8.1). Lore does not validate
  that they do.

---

## 8. Non-Functional Requirements

- **NFR-01 Performance:** `query_lessons` must respond in < 200ms for
  projects with up to 10,000 lessons.
- **NFR-02 Performance:** `search_similar` must respond in < 500ms.
- **NFR-03 Performance:** `query_lessons_for_task` must respond in
  < 500ms (includes embedding generation + epic-scoped query).
- **NFR-04 Availability:** Memory server must target 99.5% uptime
  (self-hosted, best effort).
- **NFR-05 Scalability:** Single Postgres instance must support 50+
  projects and 100,000+ lessons without schema changes.
- **NFR-06 Security:** API keys stored as bcrypt hashes (cost 12); rate
  limiting on auth (max 20 failed attempts per IP per minute before
  `429`).
- **NFR-07 Security:** All MCP communication over HTTPS in production.
  HTTP allowed only for `localhost`.
- **NFR-08 Privacy:** No code content stored — only natural-language
  metadata and `code_pointer` (file + line range references).
- **NFR-09 Observability:** All MCP calls logged with `project_id` (masked),
  tool name, duration, success/failure.
- **NFR-10 Maintainability:** Lessons and patterns must be valid
  JSON-serializable structures; no opaque blobs.

---

## 9. User Stories

### Developer

- **US-01** As a developer, I want one command to set up AI assistance
  for a project so I can start working without configuration.
- **US-02** As a developer, I want relevant past lessons surfaced when I
  start work on a tracked task, so I avoid repeating mistakes.
- **US-03** As a developer, I want my code-review findings automatically
  captured as lessons, so my team's institutional memory grows without
  manual effort.
- **US-04** As a developer, I want session continuity across days — when
  I re-open a task, I want yesterday's context.
- **US-05** As a developer, I want to manually save a lesson when I
  solve a hard bug outside a review flow.

### Project Lead

- **US-06** As a project lead, I want to initialize a new project's Lore
  configuration in under 5 minutes.
- **US-07** As a project lead, I want to receive lesson suggestions from
  sister projects on the same stack.
- **US-08** As a project lead, I want to triage propagation suggestions
  via `lore inbox` without leaving my terminal.

### Cross-Project

- **US-09** As a project lead, I want lessons from a ClickUp-tracked
  project to propagate to a Jira-tracked project on the same stack —
  tracker should not matter.

---

## 10. Success Metrics

| Metric                                    | Target                     | Measurement                   |
| ----------------------------------------- | -------------------------- | ----------------------------- |
| Setup time (new developer)                | < 2 minutes                | CLI timing                    |
| Lessons captured per project per month    | > 20                       | DB count                      |
| Captured-via-review ratio                 | > 70% of new lessons       | `provenance.source` breakdown |
| Repeat bug rate                           | Decrease 50% over 3 months | `occurrence_count` trend      |
| Cross-project propagation acceptance rate | > 60%                      | `lesson_propagations` table   |
| MCP tool P95 latency                      | All under NFR thresholds   | Observability logs            |
| New developer time-to-productivity        | Decrease 30%               | Team survey                   |

---

## 11. Out of Scope (v1)

- SaaS-hosted version of `lore-memory-mcp`
- Web UI for memory browsing (planned for v2)
- Real-time collaboration features
- Methodology layers other than BMAD (architectural seam exists, but no
  implementations besides BMAD in v1)
- Per-developer separate memory pools (memory is team-shared)
- Code-content storage or fine-tuning models on lessons
- Slack / Teams notifications for propagation suggestions
- Heuristic auto-capture (the "same error 2× in a session" pattern from
  the inspiration project does not apply to server-backed memory; see
  `lore-bmad-ecosystem.md` §9.2)
- Bootstrap session-initialization skill (replaced by JIT memory queries
  inside BMAD custom-skills + `CLAUDE.md` auto-load; see
  `lore-bmad-ecosystem.md` §9.1)
