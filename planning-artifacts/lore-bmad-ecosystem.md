# Lore × BMAD Ecosystem — Architecture Reframe

Version: 0.1.0 (Draft for Review)
Status: Phase 1 — Pre-revision delta document
Date: 2026-05-06

---

## 0. Purpose of this Document

The Lore PRD (v1.0.0, March 2026) was written before bmad-mcp-server existed.
With bmad-mcp-server now real and owning the methodology + tracker-integration
layer (ClickUp today, Jira/Asana planned), Lore's identity, scope, and several
of its v1 design assumptions need to refocus.

This document is the single review artifact for that reframe. It captures the
full delta in one place so the four canonical planning artifacts (PRD,
architecture, tech-spec, epics-and-stories) can be revised in parallel during
Phase 2 with a settled framing.

This document does **not** replace the canonical artifacts. Once accepted, the
changes here propagate into v2.0.0 of each canonical artifact, and this
document is retained as the rationale (ADR-style) reference.

---

## 1. The Reframe in One Sentence

**Lore = the institutional memory layer for BMAD-driven development.**

One job, done well. Owns the data layer (lessons, patterns, sessions), the
cross-project propagation engine, and the install glue that wires the
ecosystem together. Stops competing with BMAD on methodology, agents, or
workflows.

---

## 2. The Three-System Picture

| System                                     | Owns                                                                                                                                                                                                                         | Does Not Own                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **bmad-mcp-server**                        | Methodology, agents, workflows, custom-skills, tracker integrations (ClickUp/Jira/Asana)                                                                                                                                     | Cross-session memory, semantic recall, cross-project lesson propagation            |
| **Lore** (`@alpharages/lore` + `lore-memory-mcp`) | Persistent memory (lessons/patterns/sessions), Postgres + pgvector, propagation engine, project isolation (RLS), API keys, ecosystem CLI (`lore install` / `lore init` / `lore inbox`), `lore.yaml` as ratification document | Tasks, epics, stories, sprints, agents, methodology workflows, **behavior skills** |
| **GitNexus**                               | Code knowledge graph, blast-radius, call-chain analysis                                                                                                                                                                      | Memory or methodology                                                              |

Each system is independently deployable and useful, but the strongest value
emerges when all three are wired through `lore.yaml` and run together.

---

## 3. Identity Shift — Before vs After

| Aspect                    | Lore PRD v1.0.0                                                                                       | Lore PRD v2.0.0 (proposed)                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1 framing                | "Multi-project AI governance and memory system" with three layers (skills + memory + CLI)             | "Institutional memory layer for BMAD-driven development" — memory + ecosystem glue                                                                       |
| Architecture              | 3 components: `@alpharages/lore` + `lore-platform` + `lore-memory-mcp`                                       | **2 components: `@alpharages/lore` + `lore-memory-mcp`.** `lore-platform` removed entirely — see §9.3.                                                          |
| Skills layer              | Full skill platform shipping bootstrap, judge, pr, lesson, memory, status, plus stack-specific skills | **Removed entirely.** Behavior skills owned by bmad-mcp-server. Lore exposes MCP tools only; BMAD custom-skills call them by convention.                 |
| Bootstrap skill           | Top-level entry point for every session                                                               | **Removed entirely** — see §9.1. Replaced by per-BMAD-skill JIT memory queries and `CLAUDE.md` auto-load.                                                |
| Auto-capture              | Heuristic: same error 2× in a session triggers `save_lesson`                                          | **Heuristic removed.** Two paths: review-driven (`capture_review_finding` from `clickup-code-review`) and manual (agent invokes `save_lesson` directly). |
| Governance scope          | Behavior + data governance                                                                            | **Data governance only.** Behavior governance is _declared_ in `lore.yaml` and _enforced_ by bmad-mcp-server.                                            |
| Cross-project propagation | Stack-tag-based, single-tracker assumption                                                            | Stack-tag-based, **tracker-agnostic** + new `lore inbox` CLI command for surfacing pending suggestions                                                   |
| Session model             | Free-text `task_summary`                                                                              | First-class `external_task_id` + tracker type. Session lifecycle anchored to BMAD skill invocation.                                                      |

---

## 4. Governance Split

| Governance domain                    | Where declared                                                   | Where enforced                           |
| ------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------- |
| Project isolation, API keys, RLS     | DB schema + Lore auth middleware                                 | Lore (database-enforced)                 |
| Lesson provenance + trust tier       | `lessons.provenance` JSONB                                       | Lore relevance scoring weights           |
| Audit log of MCP calls               | Structured logs (NFR-09)                                         | Lore                                     |
| Methodology version (BMAD release)   | `lore.yaml` `methodology.version`                                | bmad-mcp-server (loads that version)     |
| Tracker type + workspace/space ID    | `lore.yaml` `tracker.*`                                          | bmad-mcp-server custom-skills            |
| Allowed agents/workflows             | `lore.yaml` `methodology.allowed_workflows`                      | bmad-mcp-server `customize.toml` routing |
| Lore skill pack version              | `lore.yaml` `skills.version`                                     | Lore CLI                                 |
| Project constitution / repo identity | `constitution.md`, `REPO_IDENTITY.md` (generated by `lore init`) | Read by every AI agent at session start  |

Lore = constitution + registrar. bmad-mcp-server = executive branch.
GitNexus = surveyor.

---

## 5. Schema Additions

These are additions, not breaking changes. Existing v1 schema columns are
unchanged.

### 5.1 `lessons` table

```sql
ALTER TABLE lessons ADD COLUMN external_task_id TEXT;
ALTER TABLE lessons ADD COLUMN external_task_ref TEXT;
ALTER TABLE lessons ADD COLUMN external_tracker_type TEXT
  CHECK (external_tracker_type IN ('clickup','jira','asana'));
ALTER TABLE lessons ADD COLUMN provenance JSONB DEFAULT '{}';

CREATE INDEX idx_lessons_external_task ON lessons(external_task_id)
  WHERE external_task_id IS NOT NULL;
```

`provenance` example:

```json
{
  "source": "bmad-code-review",
  "workflow": "bmad-code-review",
  "skill": "clickup-code-review",
  "task_id": "task-abc123",
  "reviewer": "alice",
  "trust_tier": "high",
  "captured_at": "2026-05-06T14:23:00Z"
}
```

### 5.2 `sessions` table

```sql
ALTER TABLE sessions ADD COLUMN external_task_id TEXT;
ALTER TABLE sessions ADD COLUMN external_task_ref TEXT;
ALTER TABLE sessions ADD COLUMN external_tracker_type TEXT;
ALTER TABLE sessions ADD COLUMN bmad_skill TEXT;
ALTER TABLE sessions ADD COLUMN bmad_workflow TEXT;
ALTER TABLE sessions ADD COLUMN lessons_consulted UUID[] DEFAULT '{}';
ALTER TABLE sessions ADD COLUMN lessons_applied UUID[] DEFAULT '{}';

CREATE INDEX idx_sessions_external_task ON sessions(external_task_id)
  WHERE external_task_id IS NOT NULL;
```

`lessons_consulted` and `lessons_applied` enable post-hoc analysis: "of the
lessons we showed the dev agent, which ones did the review process find were
actually relevant?" — feeds back into trust scoring.

### 5.3 `patterns` table

Same `external_task_*` columns as lessons. Patterns can also originate from
BMAD architecture-workflow outputs.

### 5.4 RLS unchanged

Existing project-isolation policies cover the new columns automatically. No
new policies needed.

---

## 6. `lore.yaml` Schema Extensions

### 6.1 New blocks

```yaml
lore:
  version: "2.0.0"

project:
  name: "My Project"
  slug: "my-project"

mcp:
  server: "https://your-server"

# NEW: methodology declaration (optional)
methodology:
  type: bmad
  version: ">=6.0.0 <7.0.0"
  allowed_workflows:
    - prd
    - architecture
    - debug-session
    - bmad-code-review
  default_dev_skill: clickup-dev-implement
  default_review_skill: clickup-code-review

# NEW: tracker declaration (required when methodology is set)
tracker:
  type: clickup # clickup | jira | asana
  space_id: "12345"
  backlog_list_id: "67890"
  active_sprint_list_id: "abcdef"
  config:
    # tracker-specific fields go here
    custom_field_lesson_link: "field_id_xyz"

repos:
  - slug: backend
    name: Backend API
    path: ../my-project-backend
    stack:
      - nestjs
      - typeorm
      - postgres
```

### 6.2 Validation rules

- `methodology` is optional. When present, `tracker` is also required.
- CLI validates the tracker connection during `lore init` after methodology is declared.
- `lore.version` is the Lore server compatibility range; checked by `@alpharages/lore` against the running `lore-memory-mcp` version on `lore install`.

### 6.3 What this enables

`lore.yaml` becomes the **single ratification document** for the project:
which methodology, which tracker, which skill pack, which Lore server. One
file, committed to the repo, reviewable in PR.

---

## 7. New MCP Tools

These are additions to Lore's MCP surface. None replace v1 tools.

### 7.1 `capture_review_finding`

```typescript
Input: {
  external_task_id: string         // ClickUp/Jira/Asana task ID
  external_tracker_type: "clickup" | "jira" | "asana"
  external_task_ref?: string       // URL to task
  severity: "critical" | "high" | "medium" | "low"
  finding: {
    title: string
    problem: string
    root_cause?: string
    fix: string
    prevention_rule: string
    stack_tags?: string[]          // inferred from repo if omitted
    category?: string
    code_pointer?: {               // file + line range from review diff
      file: string
      line_start: number
      line_end: number
    }
  }
  reviewer?: string
  workflow?: string                // e.g. "bmad-code-review"
}

Output: {
  action: "created" | "incremented"
  lesson_id: string
}
```

Bypasses the heuristic auto-capture entirely. Called directly by
`clickup-code-review` step-05 (or equivalent in Jira/Asana variants).
Provenance is auto-stamped with `trust_tier: "high"` because findings have
already passed adversarial review.

### 7.2 `query_lessons_for_task`

```typescript
Input: {
  external_task_id: string
  task_context?: {                 // pre-fetched from tracker by caller
    title: string
    description?: string
    acceptance_criteria?: string
    parent_epic_id?: string
    stack_tags?: string[]
  }
  limit?: number                   // default: 10
}

Output: {
  lessons: Array<Lesson & { relevance_score: number, match_reason: string }>
  patterns: Array<Pattern>
  query_ms: number
}
```

Used by `clickup-dev-implement` step-02 (after task fetch). Combines semantic
search on task description + stack-tag filter + epic-scoped recall (if
`parent_epic_id` is present, also returns lessons from siblings of this story).

### 7.3 `start_session_from_task`

```typescript
Input: {
  external_task_id: string
  external_tracker_type: string
  external_task_ref?: string
  task_summary?: string            // auto-fetched if omitted
  branch: string
  user_handle?: string
  bmad_skill: string               // e.g. "clickup-dev-implement"
  bmad_workflow?: string
}

Output: {
  session_id: string
  resumed: boolean                 // true if existing session for same task
  prior_session_summary?: object   // included if resumed
}
```

Replaces `start_session` for tracker-backed projects. Auto-resumes sessions
when the same task is re-opened — no duplicate sessions per task.

### 7.4 `link_lessons_to_task`

```typescript
Input: {
  external_task_id: string
  consulted: UUID[]                // lesson IDs shown to agent
  applied: UUID[]                  // lesson IDs the agent acted on
}

Output: { linked: number }
```

Records which lessons influenced which task. Powers retrospective analytics
("during sprint X, lessons saved Y bugs from recurring") and feeds the
trust-tier algorithm (lessons frequently applied → boosted relevance score).

---

## 8. Integration Seams (BMAD ↔ Lore)

### 8.1 Concrete wiring per custom-skill

| BMAD custom-skill       | Step                           | Lore call                                            | Purpose                                             |
| ----------------------- | ------------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| `clickup-dev-implement` | step-01 (task ID parsed)       | `start_session_from_task`                            | Open Lore session anchored to task                  |
| `clickup-dev-implement` | step-02 (task fetch)           | `query_lessons_for_task`                             | Surface relevant lessons before code is written     |
| `clickup-dev-implement` | step-04 (impl loop)            | `link_lessons_to_task(applied=[...])`                | Record which lessons were actually used             |
| `clickup-dev-implement` | step-06 (status transition)    | `end_session`                                        | Close Lore session with files-touched, decisions    |
| `clickup-code-review`   | step-02 (task fetch)           | `query_lessons_for_task`                             | Show reviewer relevant lessons for changed files    |
| `clickup-code-review`   | step-04 (review execution)     | `query_lessons` filtered by file paths               | Auto-flag previously-captured anti-patterns in diff |
| `clickup-code-review`   | step-05 (post comment)         | `capture_review_finding` per high+ finding           | Turn review into lessons automatically              |
| `clickup-create-bug`    | step-05 (create task)          | (deferred — bug becomes lesson only after fix lands) | n/a v1                                              |
| `clickup-create-story`  | step-04 (description composer) | `get_patterns`                                       | Inject proven patterns into story description       |

### 8.2 Reverse-loop seam: BMAD planning reads Lore

The Architect/Analyst agents in `bmad` query Lore _before_ producing PRDs and
architecture documents:

```
bmad architect-workflow start
  → query_lessons(stack_tags=current_stack, severity>=high, limit=20)
  → get_patterns(stack_tags=current_stack)
  → architect agent now writes architecture aware of past failures
```

This is the highest-leverage long-term seam — BMAD's left side (planning)
becomes smarter every time BMAD's right side (execution) captures a lesson.
Patterns earned during execution improve future planning. This is the
compounding value the original PRD vision called for, now actually achievable
because there's a structured execution side feeding the memory.

### 8.3 What Lore does NOT call

Lore does not call bmad-mcp-server tools directly. The dependency arrow is
one-way: BMAD calls Lore. This keeps Lore deployable and useful even when
bmad-mcp-server is absent.

---

## 9. Removed from v1 PRD

The first three subsections are full removals — features that don't fit
the refocused scope. The fourth is a reclassification.

### 9.1 Bootstrap skill (PRD §7.8, FR-35–FR-39)

**Status: removed entirely.**

Bootstrap made sense in buildclear/claude-config because that system loaded
a _file-based_ memory layer (markdown lessons, JSON knowledge base) that
needed cache warming + freshness checks. Lore is server-backed Postgres —
there is no cache to warm, and memory is always fresh because every dev
queries the same shared database.

What replaces each of bootstrap's old responsibilities:

| Was                                                     | Now                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-load lessons / patterns / handoff                   | Each BMAD skill calls `query_lessons_for_task` / `start_session_from_task` on entry. JIT, not pre-loaded.                                   |
| Constitution + repo identity                            | `CLAUDE.md` include (auto-loaded by Cursor/Claude on every session). Generated once by `lore init`, never re-read by Lore code.             |
| Session handoff / continuity                            | `start_session_from_task` auto-resumes when the same task ID is re-opened. Friday's session context surfaces in Monday's BMAD invocation.   |
| Cross-project propagation surfacing                     | New CLI command: `lore inbox` (prints pending propagations). Optional `get_pending_propagations` MCP tool the agent can call when relevant. |
| Git sync / branch safety / "new task or existing work?" | **Dev's job.** Out of scope for Lore.                                                                                                       |
| AWS secrets / .env.local loading                        | **Dev's job / project setup.** Out of scope.                                                                                                |
| Knowledge freshness watchdog                            | Not applicable — server-backed memory is always current.                                                                                    |
| Pattern-based checklist routing                         | Dev picks the right BMAD skill directly (`clickup-create-epic`, `clickup-dev-implement`, etc.).                                             |
| Proactive tracking arming                               | See §9.2 — the silent observers go away with the heuristic.                                                                                 |

### 9.2 Heuristic auto-capture (PRD §7.9, FR-40–FR-43)

**Status: removed entirely.**

Bootstrap was the only place that could "arm" the silent error / prompt /
decision observers. With bootstrap gone, the heuristic has no
initialization point. Capture paths simplify to two:

1. **Primary — review-driven:** `capture_review_finding` from
   `clickup-code-review` step-05. Automatic, structured, high-signal.
   Findings have already passed adversarial review, so trust tier is `high`.
2. **Manual — agent-initiated:** the agent calls `save_lesson` MCP tool
   directly when context warrants (e.g., after solving a hard bug
   outside a review flow).

No silent observers, no thresholds, no session-level tracking state.

### 9.3 `lore-platform` component (entire subsystem)

**Status: removed entirely.**

v1 PRD framed Lore as a 3-component architecture: `@alpharages/lore` +
`lore-platform` (versioned skill files) + `lore-memory-mcp` (Docker
server). With bootstrap and heuristic auto-capture both removed (§9.1,
§9.2), and dev/review behavior owned by bmad-mcp-server, `lore-platform`
has no skills left to ship. The component collapses entirely.

**v2 architecture is 2 components:**

| Component             | Type               | Role                                                                                                                                                |
| --------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@alpharages/lore`**       | npm global package | Project init, MCP config writing for all three servers (lore-memory + bmad + gitnexus), `lore inbox` for propagations, version-compatibility checks |
| **`lore-memory-mcp`** | Docker self-hosted | Postgres + pgvector + MCP tools + propagation engine                                                                                                |

**What this removes:**

- GitHub Releases workflow for skill tarballs
- `~/.lore/skills/` install path
- `registry.json` and skill version tracking
- `skills:` block in `lore.yaml`
- `downloader.ts`, `registry.ts` modules in `@alpharages/lore`
- Tech-spec §3 (lore-platform Skills Specification) entirely

**How BMAD integration works without skill files:**

The "bridge" is purely MCP-level convention. BMAD custom-skills (e.g.,
`clickup-dev-implement/steps/step-02-task-fetch.md`) reference Lore MCP
tool names directly in their workflow markdown:

```
After fetching the task from ClickUp, call:
  mcp__lore-memory__query_lessons_for_task({
    external_task_id: <task_id>,
    task_context: { title, description, parent_epic_id, ... }
  })
```

No skill files required on Lore's side. No `memory-bmad-bridge` skill
pack. The contract is: **Lore exposes the MCP tools; BMAD custom-skills
call them by convention.**

**Stack-specific lesson categorization** (was `memory-stack-*` skill packs
in earlier draft of this doc): the AI agent sets `category` and
`stack_tags` when calling `save_lesson` or `capture_review_finding`.
Server-side normalizes (lowercase, dedupe). No client-side categorization
rules engine.

**`lore update` semantics:** updates the `lore-memory-mcp` Docker image
version and verifies CLI compatibility. No skills to update. Version
pinned via `lore.version` in `lore.yaml`.

### 9.4 GitNexus install responsibility (FR-44–FR-46)

**Status:** moved out of Lore-specific FRs.

GitNexus install + git hooks become a shared "alpharages dev platform"
responsibility, owned by `lore install` only because it happens to be the
install entry point. Conceptually, it's not Lore's domain. The FRs stay in
PRD §7.10 but are reclassified as "Ecosystem Integration" rather than "Lore
Memory Server."

---

## 10. CLI Changes

### 10.1 `lore init` (FR-09)

New prompts after the existing project/repos block:

```
? Use a methodology layer? (Y/n) Y
  ? Methodology type: › bmad
  ? BMAD version: › ^6.0.0
  ? Tracker type: › clickup
  ? ClickUp space ID: › 12345
  ? Backlog list ID: › 67890
  ? Active sprint list ID: › abcdef
  ? Validate tracker connection now? (Y/n) Y
    [validates by calling bmad-mcp-server's tracker check tool]
```

If the user declines methodology, `lore.yaml` has no `methodology:` /
`tracker:` blocks and Lore behaves like v1 (bootstrap as primary).

### 10.2 `lore install` (FR-03)

Updates to `~/.cursor/mcp.json` (and Claude equivalent):

```json
{
  "mcpServers": {
    "lore-memory": {
      "url": "${MCP_SERVER_URL}/mcp",
      "headers": { "Authorization": "Bearer ${LORE_API_KEY}" }
    },
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    },
    "bmad": {
      "command": "npx",
      "args": ["-y", "bmad-mcp-server@${methodology.version}"]
    }
  }
}
```

The `bmad` entry is written only when `methodology:` is declared. CLI is the
single point of MCP configuration; the user never touches `mcp.json`
manually for any of the three servers.

### 10.3 New: `lore link bmad`

For users with an existing v1 Lore install who want to add a methodology
layer to an existing project. Reads current `lore.yaml`, prompts for the new
blocks, updates the file, re-runs `lore install`.

---

## 11. Highest-Leverage v1 Integration Slice

With heuristic auto-capture removed (§9.2), this seam is no longer just
the highest-leverage — it's the **only automatic capture path** in v2.
Manual `save_lesson` calls remain available for the agent to invoke
directly, but they don't fire on their own.

> **`clickup-code-review` step-05 → `capture_review_finding`**

Why this seam first:

- Smallest blast radius: one MCP call from one custom-skill
- Highest signal: review findings are already structured to match Lore's lesson schema
- Most visible result: lessons start accumulating from real PR reviews immediately
- **Without it, automatic capture doesn't exist** — every other lesson would have to be manually saved by the agent

Acceptance for the slice:

- Every `clickup-code-review` finding with severity ≥ high is captured as a lesson
- Lesson has `provenance.source = "bmad-code-review"`, `external_task_id`, `external_task_ref`, `provenance.trust_tier = "high"`
- Lesson is queryable via existing `query_lessons` and surfaces in `search_similar`
- Cross-project propagation engine picks it up after 2 occurrences (no engine changes needed)

---

## 12. Migration Path

### 12.1 Schema migration

All schema additions are non-breaking `ALTER TABLE ADD COLUMN` with defaults.
No existing v1 data is touched. v1 lessons get `provenance = '{}'` and
`external_task_id = NULL` — they continue to work.

### 12.2 Epic re-sequencing

v1 Lore epics 1–7 mostly survive with story-level edits. New Epic 8 (BMAD
Integration Bridge) is additive:

| Epic                            | v1 status            | v2 change                                                                                                                                                                      |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Memory Server Foundation    | Keep                 | Story 1.1 schema includes new columns + indexes                                                                                                                                |
| 2 — Lessons & Sessions          | Keep                 | New stories: `capture_review_finding`, `query_lessons_for_task`, `start_session_from_task`, `link_lessons_to_task`                                                             |
| 3 — Cross-Project Propagation   | Keep                 | Mostly unchanged — propagation engine is already tracker-agnostic in design. Add `lore inbox` CLI surfacing.                                                                   |
| 4 — CLI Init                    | Keep                 | Story 4.2 adds methodology + tracker prompts; drops skill version prompt                                                                                                       |
| 5 — CLI Install & Update        | Keep                 | Story 5.1 (skill download) **deleted**. Story 5.2 adds bmad-mcp-server config writing. Story 5.6 (`lore update`) reframed: updates `lore-memory-mcp` Docker image, not skills. |
| 6 — Skills                      | **REMOVED entirely** | No skills layer in v2 — see §9.3                                                                                                                                               |
| 7 — Security & NFRs             | Keep                 | Add NFR for new columns + provenance integrity                                                                                                                                 |
| **8 — BMAD Integration Bridge** | **NEW**              | 4 stories covering the seams in §8.1                                                                                                                                           |

Sprint sequence revision:

| Sprint | Original v1                         | Proposed v2                                               |
| ------ | ----------------------------------- | --------------------------------------------------------- |
| 1      | Epic 1 + Epic 2 (2.1–2.4)           | Same                                                      |
| 2      | Epic 2 (2.5–2.8) + Epic 3           | Same                                                      |
| 3      | Epic 4 + Epic 5 (5.1–5.3 minus 5.1) | Same minus skill download                                 |
| 4      | Epic 5 (5.4–5.6) + Epic 6           | Epic 5 (5.4–5.6, 5.6 reframed) + **Epic 8** (BMAD bridge) |
| 5      | Epic 7                              | Epic 7                                                    |

Net story count change: roughly even — 3 stories removed (Epic 6 entirely, Epic 5
Story 5.1) plus 4 stories added (Epic 8). Total v2 epic count: 7 (was 7 in v1).

---

## 13. Open Questions

These need user decisions before Phase 2 begins.

1. **Tracker abstraction layer.** Should `query_lessons_for_task` accept
   `task_context` pre-fetched by the caller (current proposal) or should
   Lore call the tracker directly? _Recommendation:_ caller pre-fetches.
   Reason: keeps Lore tracker-agnostic and avoids Lore needing tracker
   credentials. bmad-mcp-server already has the tracker client.

2. **Provenance trust tiers.** With heuristic capture removed, the tier
   set simplifies: `high` (BMAD review) and `manual` (agent-initiated
   `save_lesson`). Should relevance scoring weight by trust tier?
   _Recommendation:_ store the tier in v2.0 but don't weight by it yet —
   tune in v2.1 once enough data exists to compare review-captured vs
   manual quality.

3. **External-task-ID uniqueness.** Should `(external_task_id,
external_tracker_type)` be unique within a project for sessions?
   (One canonical session per task.) _Recommendation:_ yes —
   `start_session_from_task` resumes rather than duplicates.

4. **`lore.yaml` v2 backwards compatibility.** Should v1 `lore.yaml` files
   (without methodology/tracker blocks) keep working unchanged?
   _Recommendation:_ yes. Methodology is opt-in. Without it, Lore is
   pure memory + manual `save_lesson`.

5. **`lore inbox` CLI vs MCP tool.** Should pending propagations surface
   only via the CLI command (dev runs it on demand), only via an MCP tool
   the agent can call, or both? _Recommendation:_ both. CLI for the dev's
   own awareness; MCP tool for an agent to surface them when it judges
   them relevant (e.g., when starting work in a stack with active
   propagation suggestions).

6. **What does Lore-without-BMAD look like?** With `lore-platform` gone,
   a project that uses Lore but not BMAD has only: server-side memory,
   `query_lessons` / `search_similar` / `save_lesson` MCP tools, and the
   CLI. Is that a viable standalone experience worth supporting, or is
   Lore now BMAD-or-bust? _Recommendation:_ keep standalone viable —
   the MCP tools are useful on their own; the cost of supporting it is
   nearly zero since BMAD integration is purely caller-side convention.

---

## 14. Acceptance for this Document

This delta document is "ready for Phase 2" when:

- [ ] User has read all sections
- [ ] §1 reframe is approved
- [ ] §3 architecture row (2 components, not 3) is approved
- [ ] §4 governance split is approved
- [ ] §5 schema additions are approved (no breaking changes)
- [ ] §7 new MCP tools list is approved
- [ ] §9 removal list (bootstrap, heuristic auto-capture, lore-platform) is approved
- [ ] §11 v1 integration slice is approved as the first/only automatic capture path
- [ ] §13 open questions have decisions

Once accepted, Phase 2 begins: in-place v2.0.0 revisions of PRD,
architecture, tech-spec, and epics-and-stories with this document as the
rationale reference.
