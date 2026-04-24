# Lore Platform — Product Requirements Document

Version: 1.0.0
Status: Draft
Date: March 2026

---

## 1. Executive Summary

Lore Platform is a multi-project AI governance and memory system that gives
every developer on every project a consistent, intelligent, memory-backed AI
coding experience. It operates across three layers: a skills platform that
instructs AI agents how to behave, a persistent memory server that stores and
retrieves institutional knowledge, and a CLI that makes the entire system
invisible to developers.

The system solves a fundamental problem in AI-assisted development: AI agents
have no memory between sessions, no knowledge of team history, and no awareness
of mistakes already made. Lore Platform gives AI agents persistent, searchable,
cross-session, cross-developer, and optionally cross-project institutional memory.

---

## 2. Problem Statement

### 2.1 Current State

Teams using AI coding assistants (Cursor, Claude Code) face these problems:

1. **Zero institutional memory** — Every session starts from scratch. The agent
   has no knowledge of past mistakes, team decisions, or proven patterns.

2. **Knowledge loss** — When a developer solves a hard bug, that knowledge lives
   only in their head. The next developer hits the same bug. The agent hits the
   same bug.

3. **Inconsistent AI behavior** — Different developers get different quality AI
   assistance depending on how well they prompt and what context they manually
   provide.

4. **Onboarding friction** — New developers spend weeks learning the same lessons
   the team already learned the hard way.

5. **No codebase awareness** — AI agents read individual files but cannot
   understand dependencies, call chains, or blast radius of changes.

6. **Config fragmentation** — Every project has its own ad-hoc AI configuration
   that drifts over time and is never shared.

### 2.2 Impact

- Repeated bugs across developers and sessions
- Inconsistent code quality
- Slow onboarding
- High cognitive load on developers to manually provide context
- No compounding improvement in AI assistance over time

---

## 3. Vision

> Every developer on every project gets an AI agent that already knows your
> stack, remembers every mistake your team has ever made, learns from other
> projects running the same technology, and requires zero setup beyond one
> CLI command.

AI assistance should compound over time. The longer a team uses the system,
the better the AI gets — because every session adds to a shared knowledge base
that benefits every future session.

---

## 4. Goals and Non-Goals

### 4.1 Goals

- G1: Provide persistent, searchable institutional memory across sessions and developers
- G2: Standardize AI agent behavior across multiple projects via versioned skills
- G3: Zero-friction developer setup (one CLI command)
- G4: Automatic knowledge capture — no manual documentation required
- G5: Cross-project knowledge propagation for teams running similar stacks
- G6: Deep code intelligence via knowledge graph integration (GitNexus)
- G7: Project isolation — no data leakage between projects
- G8: Team-shared memory — all developers benefit from each other's experience

### 4.2 Non-Goals

- NOT a general-purpose AI assistant or chatbot
- NOT a replacement for git history or commit messages
- NOT a code review tool
- NOT a project management tool
- NOT a SaaS product (self-hosted only in v1)
- NOT an offline-first system
- NOT a per-developer memory system (memory is team-owned)

---

## 5. Users and Personas

### 5.1 Developer (Primary User)

**Profile:** Software engineer working on a project that uses Cursor or Claude Code.

**Goals:**
- Write code faster with fewer repeated mistakes
- Get relevant context without manual setup
- Have the AI understand the codebase architecture

**Pain points:**
- AI forgets everything between sessions
- Has to re-explain the same context repeatedly
- AI makes changes that break things it didn't know about

**Interaction with Lore:**
- Runs `lore install` once
- Types `/bootstrap` at session start
- Never thinks about the system again

---

### 5.2 Project Lead (Secondary User)

**Profile:** Tech lead or senior developer responsible for a project.

**Goals:**
- Ensure consistent AI behavior across the team
- Capture and propagate team knowledge
- Onboard new developers quickly

**Pain points:**
- Team members get inconsistent AI quality
- Same mistakes happen across the team
- Onboarding takes too long

**Interaction with Lore:**
- Runs `lore init` to set up a new project
- Manages `lore.yaml`
- Reviews admin dashboard for team memory health

---

### 5.3 Platform Administrator (Tertiary User)

**Profile:** DevOps or platform engineer maintaining the Lore infrastructure.

**Goals:**
- Keep the memory server running reliably
- Manage project registrations
- Monitor system health

**Interaction with Lore:**
- Manages Docker deployment
- Creates/revokes project API keys
- Monitors Postgres and MCP server health

---

## 6. System Components

The platform consists of three independent components and one per-project
configuration artifact:

### 6.1 @lore/cli (npm package)

The developer-facing command-line tool. Handles installation, project
initialization, updates, and all setup tasks. Developers install this globally
once and never manually configure anything.

### 6.2 lore-platform (GitHub repository + releases)

The skills library. Contains versioned markdown skill files that instruct AI
agents how to behave. Skills are stack-agnostic (core) or stack-specific
(nestjs, react, python, etc.). Published as versioned releases. The CLI
downloads the correct version automatically.

### 6.3 lore-memory-mcp (Docker, self-hosted)

The persistent memory server. An always-on HTTP server that exposes memory
tools via the Model Context Protocol. Backed by PostgreSQL with pgvector
for semantic search. Stores lessons learned, patterns, sessions, and
preferences. Enforces project isolation via Row-Level Security.

### 6.4 lore.yaml (per-project config file)

A single configuration file committed to each project's config repository.
Declares the project identity, repos, tech stack, skill version, and MCP
connection. The CLI reads this file to set up everything else.

---

## 7. Feature Requirements

### 7.1 CLI — `lore install`

**FR-01:** CLI must read `lore.yaml` from the current directory or any
parent directory.

**FR-02:** CLI must download the exact skill version declared in `lore.yaml`
from the release registry.

**FR-03:** CLI must configure Cursor MCP settings (`~/.cursor/mcp.json`)
automatically without developer intervention.

**FR-04:** CLI must run `gitnexus analyze` for each repo declared in
`lore.yaml` on first install.

**FR-05:** CLI must install git hooks (`post-commit`, `post-merge`) in each
declared repo automatically.

**FR-06:** CLI must add the CLAUDE.md include path to `~/.claude/CLAUDE.md`.

**FR-07:** Install must complete in under 60 seconds for a typical project
(3-5 repos, ~1000 files each).

**FR-08:** CLI must be idempotent — running `lore install` multiple times
must not corrupt state.

---

### 7.2 CLI — `lore init`

**FR-09:** CLI must interactively gather project name, slug, repo list,
tech stacks, and MCP server URL.

**FR-10:** CLI must generate `lore.yaml`, `CLAUDE.md`, `constitution.md`,
and `REPO_IDENTITY.md` for each declared repo.

**FR-11:** CLI must register the project with the MCP memory server and
return an API key.

**FR-12:** CLI must validate that the MCP server is reachable before
completing initialization.

---

### 7.3 CLI — `lore update`

**FR-13:** CLI must check the release registry for newer skill versions.

**FR-14:** CLI must display a changelog diff before applying updates.

**FR-15:** CLI must prompt the user before applying breaking changes
(major version bumps).

**FR-16:** CLI must update `lore.yaml` version field after successful update.

---

### 7.4 Memory Server — Lessons

**FR-17:** Server must store lessons with: title, problem description,
root cause, fix, prevention rule, stack tags, category, severity, and
occurrence count.

**FR-18:** Server must generate OpenAI embeddings for every lesson on save.

**FR-19:** `query_lessons` must support filtering by: stack tags, category,
severity, date range, and repo.

**FR-20:** `query_lessons` must return results ranked by relevance score
(recency + frequency + stack match + severity).

**FR-21:** `search_similar` must accept a natural language text string and
return semantically similar lessons using pgvector cosine similarity.

**FR-22:** When `save_lesson` is called, server must check for semantic
duplicates (>90% cosine similarity) and increment occurrence count instead
of creating a new record.

**FR-23:** Lessons must be scoped to: global (null project), project-level,
or repo-level.

---

### 7.5 Memory Server — Sessions

**FR-24:** `start_session` must record: project, repo, branch, task summary,
and timestamp.

**FR-25:** `end_session` must record: decisions made, errors hit (lesson IDs),
files touched, and end timestamp.

**FR-26:** `get_session_handoff` must return the most recent session for the
current project/repo with a human-readable summary.

---

### 7.6 Memory Server — Cross-Project Propagation

**FR-27:** A background job must run hourly to identify lessons with
occurrence_count >= 2 and severity critical/high.

**FR-28:** For each qualifying lesson, the job must identify other projects
with overlapping stack tags and create propagation suggestions.

**FR-29:** `suggest_propagations` tool must return pending suggestions for
the current project.

**FR-30:** Accepting a propagation must copy the lesson to the target project
with a reference to the source.

---

### 7.7 Memory Server — Project Isolation

**FR-31:** Every project must have a unique API key.

**FR-32:** Row-Level Security must be enabled on all data tables.

**FR-33:** An authenticated request must only be able to read/write data
belonging to its own project or global (null project_id) records.

**FR-34:** There must be no application-level filtering for isolation —
isolation must be enforced at the database level only.

---

### 7.8 Bootstrap Skill

**FR-35:** Bootstrap must detect which repo it is running in by walking
the directory tree for `lore.yaml`.

**FR-36:** Bootstrap must fire all MCP calls as parallel tool calls in
a single response (not sequential).

**FR-37:** Bootstrap must display: constitution status, repo identity,
top 5 relevant lessons, semantic matches for the current task, session
handoff, MCP status, GitNexus codebase stats, and cross-project suggestions.

**FR-38:** Bootstrap must check git branch and block work on protected
branches.

**FR-39:** Bootstrap must ask: "New task or existing work?" and handle
branch creation or sync accordingly.

---

### 7.9 Auto-Capture

**FR-40:** The lesson skill must track error types silently during a session.

**FR-41:** When the same error type occurs 2 or more times in a session,
the skill must automatically call `save_lesson` without prompting the developer.

**FR-42:** Auto-captured lessons must include: error message, stack tags
from current repo, category inferred from error type, and severity inferred
from impact.

**FR-43:** The skill must call `increment_occurrence` when an existing lesson
is hit again (semantic match > 90%).

---

### 7.10 GitNexus Integration

**FR-44:** `lore install` must run `npx gitnexus analyze` for each repo
automatically.

**FR-45:** Git post-commit hook must run `npx gitnexus analyze --incremental
--quiet` in the background after every commit.

**FR-46:** Git post-merge hook must run `npx gitnexus analyze --incremental
--quiet` after every pull/merge.

**FR-47:** Bootstrap must query GitNexus for codebase stats and include
them in the session report.

**FR-48:** Bootstrap must check GitNexus index staleness and trigger
re-index if older than 24 hours.

---

## 8. Non-Functional Requirements

**NFR-01 Performance:** `query_lessons` must respond in < 200ms for
projects with up to 10,000 lessons.

**NFR-02 Performance:** `search_similar` (semantic search) must respond
in < 500ms.

**NFR-03 Performance:** Bootstrap (all parallel MCP calls) must complete
in < 3 seconds total.

**NFR-04 Availability:** Memory server must target 99.5% uptime (self-hosted,
best effort).

**NFR-05 Scalability:** Single Postgres instance must support 50+ projects
and 100,000+ lessons without schema changes.

**NFR-06 Security:** API keys must be stored as bcrypt hashes. Plain text
keys must never be stored.

**NFR-07 Security:** All MCP communication must be over HTTPS in production.

**NFR-08 Privacy:** No code content is stored in the memory server — only
lesson metadata and natural language descriptions.

**NFR-09 Observability:** All MCP tool calls must be logged with: project_id,
tool name, duration, and success/failure.

**NFR-10 Maintainability:** Skills must be valid markdown files that any
team member can read and edit without technical knowledge.

---

## 9. User Stories

### Developer Stories

**US-01:** As a developer, I want to run one command to set up AI assistance
for a project so that I can start working immediately without configuration.

**US-02:** As a developer, I want to see relevant past mistakes at session
start so that I don't repeat errors my team has already solved.

**US-03:** As a developer, I want the AI to understand the codebase
architecture so that it doesn't make changes that break downstream dependencies.

**US-04:** As a developer, I want my session context to persist between
days so that I don't have to re-explain what I was working on.

**US-05:** As a developer, I want mistakes to be captured automatically
so that I don't have to manually document them.

### Project Lead Stories

**US-06:** As a project lead, I want to initialize a new project config
in under 5 minutes so that I can onboard the team quickly.

**US-07:** As a project lead, I want all developers to use the same skill
version so that AI behavior is consistent across the team.

**US-08:** As a project lead, I want to see which mistakes are most
common across the team so that I can address systemic issues.

**US-09:** As a project lead, I want new developers to inherit all team
lessons on day one so that onboarding is faster.

### Cross-Project Stories

**US-10:** As a project lead, I want to receive lesson suggestions from
other projects using the same stack so that I can benefit from their
experience without manual coordination.

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Setup time (new developer) | < 2 minutes | CLI timing |
| Lessons captured per project/month | > 20 | DB count |
| Repeat bug rate | Decrease 50% over 3 months | Occurrence count trend |
| Bootstrap completion time | < 3 seconds | MCP response timing |
| Developer adoption rate | > 90% of team active weekly | Session start counts |
| Cross-project propagation acceptance rate | > 60% | propagations table |
| New developer time-to-productivity | Decrease 30% | Team survey |

---

## 11. Out of Scope (v1)

- SaaS hosted version
- Web UI for memory browsing (v2)
- Real-time collaboration features
- Integration with Jira / Linear / ClickUp
- Mobile app
- Slack / Teams notifications
- Fine-tuning models on captured lessons
- Per-developer separate memory pools
