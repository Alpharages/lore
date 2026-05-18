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

## Story Dependency Order

```
12.1 Move server     ──┐
12.2 Extract CLI     ──┼── 12.3 Update workspace + turbo
                       │           │
                       │           └── 12.4 Docker + CI
                       │                   │
                       │                   └── 12.5 Docs + planning artifacts
```

12.1 and 12.2 can proceed in parallel on separate branches; 12.3 merges them.
12.4 and 12.5 follow 12.3.
