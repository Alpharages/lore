# Lore Platform — Epics and Stories

This file is the canonical, BMAD-compatible epics list. Web UI epics (7–11)
live in `web-ui-epics.md`. New cross-cutting epics are added here.

---

## Epic 12 — Monorepo restructure: extract server and CLI into `apps/`

**Goal:** Reorganize the repo so every independently deployable artifact lives
under `apps/` and the pnpm workspace pattern is consistent. The Fastify server
moves from the repo-root `src/` into `apps/server/`. The `@alpharages/lore`
CLI moves from `src/cli/` into `apps/cli/` as its own workspace package with
its own `package.json`, `tsconfig.json`, `bin` entry, and release cycle.
`apps/web` is unchanged.

**Out of scope:** No behavior changes to any REST endpoint, MCP tool, or CLI
command. `src/mcp/` is NOT extracted into its own app — it is a transport
adapter that shares per-request DB transactions, auth, and services with the
Fastify server, so it moves with the server under `apps/server/src/mcp/`.

**Motivation:** PRD §6.1 and architecture §3.1 / §11 describe `@alpharages/lore`
and `lore-memory-mcp` as two independently deployable components with separate
release cycles. The current layout conflates them in one root `package.json`,
forces the CLI to ship with all server runtime deps (Fastify, Drizzle, pgvector
clients, OpenAI SDK, bcrypt, etc.) it does not need, blocks independent
versioning, and makes the workspace pattern half-done (only `apps/web` is
under `apps/`).

**Acceptance (epic-level):**

- `pnpm install` from the repo root resolves all three workspaces (`apps/server`,
  `apps/cli`, `apps/web`).
- `pnpm -r build` (or `turbo run build`) compiles all three apps without error.
- `pnpm --filter @lore/server test` passes the existing unit + integration suite
  with all import paths updated.
- `pnpm --filter @alpharages/lore build` produces a `dist/cli/index.js` that
  runs as `lore --version` when linked globally.
- `docker compose up` brings up the server from the new path; the existing web
  UI Dockerfile builds with updated COPY paths.
- No cross-app source imports (the server does not import from `apps/cli/`, web
  does not import from `apps/server/`).
- All planning-artifact and CLAUDE.md path references are updated.

**Covers:** monorepo hygiene, CLI independence, server isolation. Unblocks
independent versioning of `@alpharages/lore` on npm and a leaner server image.

---

### Story 12.1 — Move Fastify server into `apps/server/`

**As a** maintainer,
**I want** the Fastify server source, tests, configs, and Docker assets under
`apps/server/`,
**so that** the server is a peer workspace to `apps/web` and `apps/cli`, not a
root-level package.

**Acceptance Criteria:**

- [ ] `apps/server/src/` contains `api/`, `services/`, `repositories/`, `db/`,
      `mcp/`, `utils/`, and `index.ts` — moved verbatim from the repo-root `src/`
      (excluding `src/cli/` which is handled in Story 12.2).
- [ ] `apps/server/package.json` is renamed to `@lore/server`, retains the
      server's runtime + dev dependencies, and exposes `dev`, `build`, `start`,
      `test`, `test:integration`, `lint`, `format`, `db:generate`, `db:migrate`,
      `db:studio` scripts.
- [ ] `apps/server/tsconfig.json` extends the root tsconfig and emits to
      `apps/server/dist/`.
- [ ] `apps/server/tests/` contains the existing `unit/`, `integration/`, and
      `helpers/` directories with all relative import paths updated.
- [ ] `apps/server/scripts/benchmark/` holds the benchmark seed + runner.
- [ ] `apps/server/Dockerfile` is the existing server Dockerfile with COPY
      paths rewritten to the new location.
- [ ] `apps/server/drizzle.config.ts`, `apps/server/vitest.config.ts`,
      `apps/server/nginx/`, and `apps/server/docs/` live alongside the server
      source.
- [ ] `pnpm --filter @lore/server test` passes — same number of tests, all
      green.
- [ ] No file under `apps/server/` imports from `apps/cli/` or `apps/web/`.

---

### Story 12.2 — Extract CLI into `apps/cli/` as `@alpharages/lore`

**As a** maintainer,
**I want** the CLI to be its own workspace package with its own dependencies
and release cycle,
**so that** `@alpharages/lore` can be published to npm without bundling the
server runtime, and developers installing it globally don't pull Fastify,
Drizzle, pgvector clients, OpenAI SDK, or bcrypt.

**Acceptance Criteria:**

- [ ] `apps/cli/src/` contains `commands/`, `core/`, `generators/`, `api/`,
      `utils/`, `types/`, and `index.ts` — moved verbatim from `src/cli/`.
- [ ] `apps/cli/package.json` is named `@alpharages/lore`, declares only the
      runtime deps the CLI actually uses (commander, inquirer, handlebars,
      yaml, semver, zod), and declares the `bin: { lore: "dist/index.js" }`
      entry.
- [ ] `apps/cli/tsconfig.json` extends the root tsconfig and emits to
      `apps/cli/dist/`.
- [ ] `apps/cli/templates/` contains `CLAUDE.md.hbs` (moved from root
      `templates/`).
- [ ] `apps/cli/scripts/publish-cli.mjs` (moved from `scripts/`) drives the
      npm publish flow.
- [ ] `pnpm --filter @alpharages/lore build` produces a runnable CLI; `pnpm
      --filter @alpharages/lore test` passes the existing CLI tests.
- [ ] `npm link` from `apps/cli/` makes `lore --version` work in a separate
      shell.
- [ ] No file under `apps/cli/` imports from `apps/server/` or `apps/web/`.

---

### Story 12.3 — Update workspace, turbo, and root manifest

**As a** maintainer,
**I want** the root `package.json`, `pnpm-workspace.yaml`, and `turbo.json`
to describe a three-app workspace,
**so that** workspace tooling (pnpm filter, turbo pipeline, lint-staged,
husky) treats all three apps as peers.

**Acceptance Criteria:**

- [ ] Root `package.json` is reduced to a workspace-only manifest (no runtime
      deps, no `bin`, no app scripts) — keeps only `pnpm`, `prettier`, `oxlint`,
      `husky`, `lint-staged`, `turbo`, and Node engines.
- [ ] `pnpm-workspace.yaml` declares `packages: ['apps/*']` (already true)
      and the `allowBuilds` block is preserved.
- [ ] `turbo.json` adds a `test` pipeline task and keeps `build`, `dev`, `lint`.
- [ ] Root scripts `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`,
      `pnpm format:check` delegate to turbo and exercise all three apps.
- [ ] `.husky/` pre-commit hook runs `pnpm lint && pnpm format:check` against
      every changed app.
- [ ] `lint-staged` config lives in each app's `package.json` (not the root)
      so each app owns its lint rules.

---

### Story 12.4 — Update Docker, compose, and CI build contexts

**As a** maintainer,
**I want** all Docker build contexts and CI pipelines to reference the new
paths,
**so that** the server image, the web image, and any release automation
continue to build after the restructure.

**Acceptance Criteria:**

- [ ] Root `docker-compose.yml`'s `mcp-server` service uses
      `build.context: .` with `build.dockerfile: apps/server/Dockerfile`.
- [ ] The `web` service's `build.dockerfile` is updated to
      `apps/web/Dockerfile`; the build context remains the repo root so the
      lockfile is reachable.
- [ ] `apps/server/Dockerfile` COPY statements reference `apps/server/` paths
      and the root `pnpm-lock.yaml` / `pnpm-workspace.yaml`.
- [ ] `apps/web/Dockerfile` COPY paths for the lockfile and workspace manifests
      are unchanged (already root-relative).
- [ ] `nginx/` config inside `apps/server/nginx/` still proxies port 3100 with
      no behavior change.
- [ ] Any GitHub Actions / CI workflow that calls `pnpm run build`, `pnpm run
      test`, or `docker compose build` continues to pass.

---

### Story 12.5 — Update documentation and planning-artifact paths

**As a** maintainer,
**I want** all references to `src/`, `tests/`, and `scripts/` in docs and
agent-facing files to point at the new app paths,
**so that** future AI agents and contributors are not led to the old
locations.

**Acceptance Criteria:**

- [ ] `CLAUDE.md` §2 (project structure) and §3 (package manager) sections
      describe the three-app layout.
- [ ] `AGENTS.md` (if present) is updated in lockstep with `CLAUDE.md`.
- [ ] `README.md` quick-start commands use `pnpm --filter` invocations.
- [ ] `planning-artifacts/architecture.md` §3.2 and §10.4 are updated to
      show the `apps/server/` tree.
- [ ] `planning-artifacts/tech-spec.md` references to `src/` are updated.
- [ ] `planning-artifacts/web-ui-tech-spec.md` §1.2 ("nothing moves") is
      replaced with the new three-app layout.
- [ ] Postman collection and any example `.env.example` reference the
      correct paths.
- [ ] `.cursor/rules/engineering-standards.mdc` (if it dictates layout
      rules) is updated to match.

---

### Story 12.6 — Address bug findings surfaced by post-restructure QA

**As a** maintainer,
**I want** the bugs and security gaps surfaced by the Epic 12 QA pass cleaned
up,
**so that** the three-app layout is genuinely production-ready and not just
"builds and tests pass."

**Context:** A post-restructure QA pass on the three-app layout (`apps/server`,
`apps/cli`, `apps/web`) ran builds, automated tests, smoke tests, and manual
flows against the live API + web UI. Three issues were fixed in the QA session
itself (nginx-test upstream resolution, `.gitignore` cert path, migration
`migrationsFolder` path); these four remain. F4 and F5 are pre-existing and
were not introduced by Epic 12 — they were just discovered by the QA — but
they block credible end-to-end QA and should be cleaned up together.

**Acceptance Criteria:**

- [x] **F4 — login cookie `Secure` flag is environment-aware.**
      `apps/web/app/api/auth/login/route.ts` currently sets
      `Secure: process.env.NODE_ENV === "production"`. Next.js standalone
      forces `NODE_ENV=production`, so any plain-HTTP local instance
      (`node apps/web/server.js` on `localhost`) issues a `Secure` cookie that
      the browser silently drops, breaking login. Replace with either:
      a) explicit `COOKIE_SECURE` env var (default `true`, override to `false`
         for local HTTP), or
      b) heuristic that drops `Secure` when `request.headers.host` is
         `localhost`/`127.0.0.1`.
      Production behind nginx (TLS-terminated) must still issue `Secure`.

- [x] **F5 — session store is shared across runtimes.**
      `apps/web/lib/session-store.ts` is a module-scoped `Map<string, number>`.
      In `next dev`, the middleware runtime and API route runtime are loaded
      as separate module contexts, so a session created by `POST /api/auth/login`
      is not visible to `validateSession()` in `middleware.ts` — users are
      bounced back to `/login` after a successful login. Replace with one of:
      a) signed/encrypted JWT carried in the cookie (no server state),
      b) Postgres-backed sessions table reusing the existing pool, or
      c) Redis if a session-cache layer is acceptable.
      Verification: full login → `/lessons` → `/api/projects` flow works in
      both `next dev` and `next start` against the production build.

- [x] **S1 — high-severity dependency vulnerabilities resolved.**
      `pnpm audit --prod` reports 10 high / 2 moderate / 1 low. Upgrade
      `fastify` to the current major (5.x, observe breaking-change notes),
      `drizzle-orm` to ≥ 0.45.2 (SQLi advisory), `postcss` ≥ 8.5.10 via Next
      bump if needed, and refresh `bcrypt` so its transitive `tar` chain
      reaches ≥ 7.5.11. `pnpm audit --prod` should exit clean.

- [x] **S2 — app-level security headers on Fastify.**
      `apps/server/src/api/app.ts` only registers `@fastify/sensible`. Add
      `@fastify/helmet` (CSP for `/health` and `/metrics` exemptions is fine)
      and `@fastify/cors` configured to the deployed web UI origin. Document
      that nginx is still the primary TLS/header surface, but the app must
      not be naked if it ends up exposed directly.

**Notes:**

- F4/F5 are pre-existing — they predate Epic 12. They land here because the
  QA pass that validated Epic 12 surfaced them, and they should be cleaned up
  before the three-app layout is considered "done."
- The S1 upgrade may surface CLAUDE.md §3a "current major" violations that
  were not enforced before — that is intended.
- Out of scope: switching the embedding provider, changing the MCP transport
  shape, or restructuring further. Cleanup only.

---

## Epic 13 — Patterns subsystem (`save_pattern` / `get_patterns`)

**Goal:** Ship the writer side of the `patterns` table so the two MCP tools
specified in PRD §7.7 (FR-36 / FR-37 / FR-38) become available to clients, and
the `patterns: []` slot in the existing `query_lessons_for_task` response stops
silently no-opping for lack of data.

**Out of scope:**

- Migrating the `patterns` table — the schema already exists in
  `apps/server/src/db/schema.ts:165` and RLS policies already cover it
  (architecture §5.4). No DDL changes.
- Semantic deduplication on `save_pattern`. Lessons dedup (FR-26) because
  two captures of "same bug" are noise; patterns are constructive — two
  different `code_example` snippets for the same problem are independently
  valuable. Document this asymmetry in the service header comment.
- A web UI surface for patterns. The dashboard / lesson views stay
  lesson-centric in this epic. Patterns are consumed by BMAD skills via MCP.
- Backfilling patterns from existing architecture documents. Capture begins
  prospectively; historical pattern mining is a separate epic.

**Motivation:** PRD §7.7 and `lore-bmad-ecosystem.md §5.3` define patterns as
the constructive counterpart to lessons — "this is how we do X in this
codebase," with `code_example`, intended to originate from BMAD
architecture-workflow outputs. The schema, RLS, and the read path inside
`query_lessons_for_task` (see `apps/server/src/repositories/lessons.repository.ts:695`)
are all already built; only the public write/read tools are missing. Two
downstream BMAD skills already call them (per `lore-bmad-ecosystem.md §8.1`):

- `clickup-create-story` step-04 → `get_patterns` to inject proven patterns
  into story descriptions
- `bmad architect-workflow` → `get_patterns(stack_tags=current_stack)` so
  architects write decisions informed by what's already worked

Both currently silently return nothing useful. This epic unblocks both and
closes the loop: BMAD execution captures lessons, BMAD planning consumes
patterns, the two compound over time (the §8.2 "reverse-loop seam").

**Acceptance (epic-level):**

- `save_pattern` and `get_patterns` are callable through both the per-tool
  REST routes (`POST /mcp/tools/save_pattern`, `POST /mcp/tools/get_patterns`)
  and the JSON-RPC streamable HTTP transport (`POST /mcp`).
- A `get_patterns` call increments `usage_count` and updates `last_used_at`
  for every returned pattern, transactionally with the read.
- An end-to-end smoke: register project → `save_pattern` → `get_patterns`
  with matching `stack_tags` → returned pattern has `usage_count = 2`
  (initial 1 from insert plus the one bump from the get).
- `query_lessons_for_task` returns a non-empty `patterns` array when patterns
  exist for the requested stack — verified against a seeded fixture.
- 233+ existing tests still pass; new integration tests cover the create,
  filter, sort-by-usage, usage-bump, and RLS-isolation paths.
- PRD §7.7 FR-36, FR-37, FR-38 are satisfied.

---

### Story 13.1 — Implement `save_pattern` and `get_patterns` MCP tools

**As a** BMAD planning agent (Architect, Analyst) and execution agent
(Implementer, Reviewer),
**I want** to write proven code patterns into the shared memory and read them
back filtered by stack and category,
**so that** new stories and architecture documents can reuse what already
works on the team's stack, instead of re-deriving conventions every time.

**Acceptance Criteria:**

- [ ] **AC-1 — Repository layer.** A new `apps/server/src/repositories/patterns.repository.ts`
      exposes:
      a) `insertPattern(db, values)` returning the new id, embedding column set
         from the caller (so the service can choose `pending` on embedding
         failure, mirroring the lessons fallback in `lessons.service.ts:50`),
      b) `getPatternsFiltered(db, { stackTags, category, projectId, limit })`
         returning rows ordered by `usage_count DESC NULLS LAST, last_used_at DESC NULLS LAST`,
      c) `bumpPatternUsage(db, ids)` performing `UPDATE patterns SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = ANY($1)`
         in a single statement, returning the updated rows.
      All three respect the per-request transaction (`request.txDb`) so RLS
      policies fire under `app.current_project_id`.

- [ ] **AC-2 — Service layer.** A new `apps/server/src/services/patterns.service.ts`
      exposes `savePattern(db, input)` and `getPatterns(db, input)`. `savePattern`
      generates an embedding via `generateEmbedding(text)` where `text` is
      `title + "\n" + description + "\n" + (code_example ?? "")`, then inserts
      with `embedding_status = 'complete'` (or `'pending'` on embedding failure
      — same fallback policy as lessons). `getPatterns` calls
      `getPatternsFiltered` then `bumpPatternUsage(ids of returned)` inside
      the same transaction so an aborted response rolls back the bump. The
      service file header documents the "no semantic dedup" decision.

- [ ] **AC-3 — Controllers + REST routes.** Add
      `apps/server/src/api/controllers/save-pattern.controller.ts` and
      `apps/server/src/api/controllers/get-patterns.controller.ts`. Register
      `POST /mcp/tools/save_pattern` and `POST /mcp/tools/get_patterns` in
      `apps/server/src/api/routes/mcp.route.ts`, both behind `requireProjectAuth`,
      wrapped in `withMcpRouteLogging`, with Fastify Ajv body schemas
      mirroring the existing tool schemas (snake_case wire fields, strict
      `additionalProperties: false`).

      `save_pattern` body schema:
      `{ title (≥1), description (≥1), code_example?, stack_tags: string[], category?, external_task_id?, external_task_ref?, external_tracker_type?: 'clickup'|'jira'|'asana' }`.

      `get_patterns` body schema:
      `{ stack_tags?: string[], category?, limit?: 1..20 (default 5) }`.
      Empty body returns the most-used patterns scoped to the caller's
      project (plus global rows where `project_id IS NULL`).

- [ ] **AC-4 — JSON-RPC tool registration.** `apps/server/src/mcp/mcp-protocol-server.ts`
      registers `save_pattern` and `get_patterns` with Zod input schemas
      matching the REST shape. Tool descriptions follow the existing style.
      Both go through the `wrap()` helper so errors flip `state.errored` and
      the route's commit/rollback decision is honored.

- [ ] **AC-5 — `get_patterns` is in the `listTools` set for log metrics.**
      `apps/server/src/mcp/server.ts:8` already lists `get_patterns` in the
      list-returning set; verify `extractResultCount` reads
      `output.patterns.length` correctly under the actual response shape.

- [ ] **AC-6 — Wire patterns into `query_lessons_for_task`.** The read path
      at `lessons.repository.ts:695` (`queryPatternsForTask`) already exists
      and is wired into the response. Verify it surfaces seeded patterns
      end-to-end. If the service layer is currently passing an empty array
      or skipping the call, fix it. Apply the same FR-38 `bumpPatternUsage`
      to whatever ids it returns, so consultation through the task path also
      counts as usage.

- [ ] **AC-7 — RLS isolation.** A pattern inserted under project A must not
      appear in project B's `get_patterns` or `query_lessons_for_task`
      response. Add a test mirroring
      `apps/server/tests/integration/rls-isolation.test.ts` for patterns.

- [ ] **AC-8 — Integration tests.** Add
      `apps/server/tests/integration/save-pattern.test.ts` and
      `apps/server/tests/integration/get-patterns.test.ts`. Use the
      shared `tests/helpers/embedding-dim.ts` for the seed-vector dim.
      Cover: create, validation failures, stack-tag filter, category filter,
      `usage_count` ordering, `usage_count` bump on read, RLS isolation,
      and that `query_lessons_for_task` returns the pattern.

- [ ] **AC-9 — Structured logging envelope.** Both tools emit the §8.1
      log shape (`tool`, `project_id` masked, `duration_ms`, `success`,
      and `result_count` for `get_patterns`). The existing
      `withMcpRouteLogging` + `extractResultCount` machinery handles this
      automatically once the route uses them.

- [ ] **AC-10 — Migration check.** Confirm `0000_small_champions.sql`
      already creates the `patterns` table with the right columns
      (it does — lines 43–60). No new migration. If a column we need is
      missing (e.g. for tracker linkage), add a fresh `0005_*.sql`
      migration rather than editing existing files.

**Technical notes:**

- The lessons service uses an advisory-lock pattern (`acquireSaveLessonLock`)
  to serialise the dedup+insert path per project. Patterns do NOT need this
  because there is no dedup — the lock is only there to make the
  similarity-check window race-safe. Skip it.
- `code_example` is stored as plain text. Do NOT add file-content storage —
  PRD NFR-08 explicitly limits the system to natural-language metadata and
  code pointers; an inline `code_example` snippet is the natural-language
  representation, not a code blob.
- The MCP SDK catches handler exceptions and converts them to
  `isError: true` content (see comment in `mcp-protocol-server.ts:35`). The
  same `wrap()` wrapper that lesson tools use sets `state.errored` on
  exception so the route's transaction rolls back — reuse it verbatim for
  the pattern tools.

**Smoke test (manual, post-merge):**

```bash
# After deploy, against prod:
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Fastify route handler shape","description":"All route plugins take (app, opts, done) and return void","code_example":"const route = (app, opts, done) => { app.get(\"/\", h); done(); }","stack_tags":["typescript","fastify"]}' \
  https://lore.smartsolutionspro.com/mcp/tools/save_pattern

curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"stack_tags":["fastify"]}' \
  https://lore.smartsolutionspro.com/mcp/tools/get_patterns
# Expect: patterns[0].usage_count === 2 (1 from insert + 1 from get)
```

---

---

## Epic 16 — Project Evolution Phase 1: trusted project evolution core

**Goal:** Give each project an evidence-backed, time-aware memory of what it
currently requires and how it got there, alongside — never replacing — the
existing Engineering Memory. Delivers §12.1 of
`project-evolution-prd.md`.

**Out of scope (Phase 2 and later):** AI extraction from raw evidence inside
Lore Core, duplicate/relationship suggestion beyond the semantic candidates
already returned, links from evolution items to lessons and patterns
(FR-PE-46), provider adapters, a dedicated graph database, and interactive
graph visualization.

**Motivation:** Projects change continuously, and the record of *why* they
changed is scattered across messages, meetings and documents. Agents implement
superseded requirements; teams reconstruct rationale they already had. Lessons
answer "what went wrong in the code"; nothing answered "what is true about this
project now, and what did it replace".

**Acceptance (epic-level):**

- [x] Six tables — items, versions, evidence, relations, links, events — with
      strict per-project RLS and additive, backward-compatible migrations
      (NFR-PE-01, NFR-PE-02).
- [x] Canonical history is append-only; the item row's mutable columns are a
      projection rebuildable from it (NFR-PE-13).
- [x] Capture always yields `proposed`; AI confidence never accepts (FR-PE-11,
      FR-PE-51).
- [x] Repeated capture with the same project + source kind + external source id
      is idempotent, enforced by a partial unique index (FR-PE-07).
- [x] Exact duplicates are resolved before semantic duplicate suggestions, and
      suggestions never merge accepted knowledge (FR-PE-08, FR-PE-09).
- [x] Acceptance requires at least one live evidence record and applies any
      declared supersession atomically (FR-PE-16, FR-PE-18).
- [x] Current context combines pgvector, PostgreSQL full-text, recency,
      evidence availability and one- to two-hop relationship expansion; it is
      bounded, cites evidence, explains why each item matched, redirects
      superseded matches to their replacement, and warns about unresolved
      contradictions (FR-PE-32, FR-PE-36 … FR-PE-42).
- [x] Retrieval stays deterministic and lifecycle-correct with no embedding
      provider configured (NFR-PE-07, FR-PE-54).
- [x] History returns rejected and superseded material with its relationships,
      and exports as versioned JSON and JSON Lines (FR-PE-39, FR-PE-40,
      NFR-PE-11).
- [x] Web UI provides the review inbox, current context grouped by type, the
      timeline, and item detail with evidence, review history and relationships
      (FR-PE-60 … FR-PE-65).
- [x] The PRD §20 MVP acceptance scenario passes end to end.
- [x] Existing lesson, pattern, session, propagation, CLI and Web UI behaviour
      is unchanged (FR-PE-47).

**Covers:** MCP tools `propose_project_update`, `review_project_update`,
`query_project_context`, `get_project_history`, `link_project_updates`; the
admin-secret REST surface under `/api/project-evolution`; and the `/evolution`
Web UI.

**Notes for Phase 2:** `propose_project_update` already accepts evidence-only
capture and derives a draft deterministically, flagged
`extraction: "deterministic_draft"`. Phase 2 replaces that deriver with
model-backed extraction without changing the wire contract — the result stays a
proposal either way.


## Story Dependency Order

```
12.1 Move server     ──┐
12.2 Extract CLI     ──┼── 12.3 Update workspace + turbo
                       │           │
                       │           └── 12.4 Docker + CI
                       │                   │
                       │                   └── 12.5 Docs + planning artifacts
                       │                           │
                       │                           └── 12.6 QA bug cleanup

13.1 Patterns subsystem  (independent of Epic 12; can ship anytime after 12.6)

16   Project Evolution Phase 1  (additive; depends only on the three-app layout)
```

12.1 and 12.2 can proceed in parallel on separate branches; 12.3 merges them.
12.4 and 12.5 follow 12.3. 12.6 follows 12.5 and can be split into per-AC
sub-PRs (F4, F5, S1, S2 are independent). 13.1 has no dependency on Epic 12
beyond living in the three-app layout it produced.
