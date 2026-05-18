<div align="center">

# Lore

**Institutional memory for AI-driven development teams.**

_Stop explaining the same mistake twice._

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Fastify](https://img.shields.io/badge/fastify-5.x-000?logo=fastify&logoColor=white)](https://fastify.dev)
[![Next.js](https://img.shields.io/badge/next.js-16.x-000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Postgres](https://img.shields.io/badge/postgres-16%20%2B%20pgvector-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![MCP](https://img.shields.io/badge/protocol-MCP%201.x-7C3AED)](https://modelcontextprotocol.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Alpharages/lore/pulls)

[Why Lore](#why-lore) ·
[Architecture](#architecture) ·
[Quick Start](#quick-start) ·
[MCP Tools](#mcp-tools) ·
[CLI](#cli) ·
[Web UI](#web-ui) ·
[Contributing](#contributing)

</div>

---

## Why Lore

Every AI coding session starts from scratch. Reviewers flag the same anti-patterns
on every PR. New contributors hit the same footguns the team solved six months
ago. The institutional knowledge lives in Slack threads, retro docs, and the
heads of three senior engineers — never where the AI agent that's writing code
right now can see it.

**Lore is a self-hosted memory layer that fixes this.** It captures lessons from
code reviews and developer sessions, embeds them semantically with OpenAI, and
serves them to your AI agents through the Model Context Protocol — so the next
agent that touches that auth flow already knows about the bug you fixed last
quarter.

| Without Lore                                       | With Lore                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Reviewer comments evaporate after the PR merges    | Each finding becomes a queryable, embedded lesson                      |
| Every project rediscovers the same anti-pattern    | Patterns propagate across sister projects by stack tags                |
| Onboarding takes weeks of tribal-knowledge osmosis | New agents and humans see lessons relevant to the file they're editing |
| AI agents repeat mistakes session after session    | Agents query Lore before writing code, with project-scoped recall      |

Memory is **team-shared and project-isolated**. Row-Level Security enforces
isolation at the Postgres layer — every query runs under `app.current_project_id`,
so a leak would require a database-level breach, not just an application bug.

---

## Architecture

Lore is a pnpm + Turbo monorepo with three independently deployable workspaces.
Each one owns its own dependencies, release cycle, and Dockerfile.

```
                                                                +---------------------+
                                                                |  apps/cli           |
                                                                |  @alpharages/lore   |
                                                                |  npm-published TUI  |
                                                                +----------+----------+
                                                                           |
                                                                           v
+------------+    HTTPS + MCP/JSON-RPC    +-----------------------+    Postgres 16
| AI Agent   | -------------------------> |  apps/server          | -----------------> +------------------+
| (Cursor,   |                            |  @lore/server         |                    | pgvector         |
|  Claude    |                            |  Fastify 5 + Drizzle  |                    | RLS isolation    |
|  Code,     |                            |  MCP streamable HTTP  |                    | per-project keys |
|  Windsurf) |                            +-----------+-----------+                    +------------------+
+------------+                                        ^
                                                      |
+------------+    HTTPS                               |
|  Operator  | -------------------> +-----------------+---+
|  / PM      |                      |  apps/web           |
+------------+                      |  @lore/web          |
                                    |  Next.js 16 + React |
                                    |  shadcn/ui + Tailwind |
                                    +---------------------+
```

```
apps/
├── server/   @lore/server         Fastify 5, Drizzle ORM, MCP protocol, RLS-aware Postgres pool
│   └── src/
│       ├── api/                   routes/  controllers/  middleware/  app.ts
│       ├── services/              business logic (no Fastify, no Drizzle imports)
│       ├── repositories/          Drizzle queries only
│       ├── db/                    schema, migrations, client
│       ├── mcp/                   protocol server + tool registry
│       └── utils/                 logger, errors, embeddings
├── cli/      @alpharages/lore     Commander + Inquirer CLI; ships to npm with zero server deps
│   └── src/
│       ├── commands/              install · init · update · inbox
│       └── core/                  config, generators, state, hooks
└── web/      @lore/web            Next.js 16 dashboard, propagation inbox, admin panel
```

**Hard layer rules** (enforced in `CLAUDE.md` and architecture docs):

| Layer           | May import                    | May not import                      |
| --------------- | ----------------------------- | ----------------------------------- |
| `routes/`       | `controllers/`, `middleware/` | Drizzle, repositories               |
| `controllers/`  | `services/`                   | Drizzle, repositories, Fastify glue |
| `services/`     | `repositories/`               | Fastify, Drizzle                    |
| `repositories/` | `db/`, `drizzle-orm`          | `services/`, Fastify                |

No cross-app source imports. The CLI does not pull Fastify or pgvector clients
when installed from npm; the web app does not touch server internals.

---

## How It Works

1. **Capture.** BMAD review skills and editor agents push findings to Lore via
   `save_lesson` / `capture_review_finding`. Each lesson carries severity,
   stack tags, code pointers, and provenance.
2. **Embed.** A `text-embedding-3-small` vector is generated and stored in
   pgvector. Failed embeddings degrade gracefully to `embedding_status='pending'`
   and retry asynchronously.
3. **Recall.** Before a task starts, agents call `query_lessons_for_task` with
   the file paths they're about to touch. Cosine-similarity neighbours and
   project patterns come back together — relevant context, not a wall of text.
4. **Propagate.** Lessons proven on one project surface as Accept / Reject
   suggestions on sister projects with overlapping stack tags. The propagation
   engine runs in the background; humans triage through the CLI inbox or the
   web UI.

---

## MCP Tools

Lore exposes its capabilities through the **Model Context Protocol** — over a
streamable HTTP transport at `POST /mcp` and as per-tool REST routes under
`/mcp/tools/*`. Any MCP-compatible client (Cursor, Claude Code, Claude Desktop,
Windsurf, Cline, Continue, Google Antigravity) can call them.

| Tool                       | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `save_lesson`              | Persist a lesson with embedding and provenance           |
| `query_lessons`            | Semantic search over lessons for a project               |
| `query_lessons_for_task`   | Lessons + patterns scoped to a tracker task              |
| `search_similar`           | Nearest-neighbour search across the lesson corpus        |
| `get_patterns`             | Retrieve high-frequency patterns for a stack             |
| `capture_review_finding`   | Ingest a code-review finding as a lesson with provenance |
| `get_pending_propagations` | Cross-project propagation candidates for triage          |
| `accept_propagation`       | Accept a propagated lesson into this project             |
| `reject_propagation`       | Reject a propagated lesson                               |
| `start_session`            | Open a BMAD workflow session                             |
| `end_session`              | Close a session and record applied lessons               |
| `link_lessons_to_task`     | Attach consulted lessons to a tracker task               |

Authentication is per-project — every tool call carries a `lore_<slug>_<24>`
bearer token; RLS scopes every query to that project automatically.

---

## Web UI

A Next.js 16 application served alongside the server on its own subdomain.
Designed for operators, project leads, and reviewers who want a visual window
into the team's accumulated knowledge.

| Feature               | Description                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Lesson search         | Free-text semantic search, debounced at 250 ms. Stack-tag, severity, and category filters appear after results — never as a gate. |
| Lesson detail         | Slide-over panel with Fix / Context / Code / Provenance tabs. Shiki syntax highlighting. Deep-linkable.                           |
| Cmd+K palette         | Global command palette. Find any lesson in under 15 seconds.                                                                      |
| Propagation inbox     | Triage cross-project suggestions with optimistic Accept / Reject and a 5-second undo window.                                      |
| Dashboard             | Memory growth chart, lessons captured, sessions run, propagations sent.                                                           |
| Admin panel           | Projects table with API-key copy, revoke, and regenerate — no server SSH required.                                                |
| Dark / Light / System | Three-mode theme with zero flash of unstyled content.                                                                             |

**Stack:** Next.js 16, React 19, shadcn/ui, Tailwind v4, TanStack Query, Recharts.
**Auth:** single admin password via `WEB_UI_SECRET`, 7-day signed-cookie session.

---

## Engineering Highlights

| Area                | What's there                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type safety**     | Full TypeScript strict mode across all three apps. Zod schemas at the MCP boundary. Drizzle infers types from the live schema.                        |
| **Test pyramid**    | Vitest across server, CLI, and web. Integration tests boot a real Fastify instance against a real Postgres + pgvector container — no DB mocks.        |
| **Security**        | `@fastify/helmet` + CORS pinned to the deployed origin. Bcrypt-hashed API keys. RLS-isolated Postgres pool. Environment-aware `Secure` cookies.       |
| **Observability**   | Structured pino logs with project-id redaction. Prometheus `/metrics`. Per-MCP-tool latency, success, and result-count envelopes.                     |
| **DX**              | pnpm workspaces + Turbo task graph. `oxlint` (Rust-fast). Husky + lint-staged. Each app owns its own lint config.                                     |
| **Reproducibility** | Drizzle migrations checked in. Postman collection in the repo root. Docker Compose brings up server + nginx + Postgres + web in one command.          |
| **Modularity**      | The CLI ships to npm with six runtime dependencies. The server image carries server deps only. The web app builds standalone with its own Dockerfile. |
| **Conventions**     | Arrow-functions only. `route → controller → service → repository` with hard import boundaries. Documented in `CLAUDE.md` and `planning-artifacts/`.   |

---

## Quick Start

**Prerequisites:** Docker, Docker Compose, an OpenAI API key, and pnpm 11.

```bash
# 1. Clone
git clone https://github.com/Alpharages/lore.git
cd lore

# 2. Install workspace dependencies
pnpm install

# 3. Configure (per-app .env)
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example    apps/web/.env
# Edit apps/server/.env — DATABASE_URL, ADMIN_SECRET, OPENAI_API_KEY, POSTGRES_PASSWORD
# Edit apps/web/.env    — WEB_UI_SECRET, NEXT_PUBLIC_LORE_API_URL

# 4. TLS certs (production)
# Place fullchain.pem + privkey.pem under apps/server/nginx/certs/

# 5. Bring it up
docker compose up -d

# 6. Run migrations
pnpm --filter @lore/server db:migrate

# 7. Register your first project
curl -X POST https://your-host/api/projects/register \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project","slug":"my-project","stack_tags":["typescript","postgres"]}'
# -> returns { apiKey: "lore_my-project_..." }
```

The MCP endpoint is now reachable at `https://your-host/mcp`. Drop the returned
API key into your client config and you're done.

---

## CLI

`@alpharages/lore` is a published npm package and the developer-facing surface
of the platform. It configures the MCP integration on developer machines and
triages propagation suggestions without leaving the terminal.

```bash
npx lore <command>
```

| Command   | Purpose                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `init`    | Scaffold `lore.yaml`, register the project, print an API key                                                                            |
| `install` | Configure MCP for Cursor, Claude Code, Claude Desktop, Windsurf, Cline, Continue, Google Antigravity — interactively or via `--ide all` |
| `inbox`   | Triage pending lesson propagations one by one                                                                                           |
| `update`  | Upgrade the running server image to a compatible newer version                                                                          |

```bash
export LORE_ADMIN_SECRET=<secret>
npx lore init                                       # register + scaffold

npx lore install                                    # interactive picker (arrow keys, space to toggle)
npx lore install --ide cursor,claude-code           # non-interactive
npx lore install --ide all                          # everything supported
npx lore install --ide detected                     # only IDEs found on the machine

export LORE_API_KEY=<project-api-key>
npx lore inbox                                      # triage cross-project lessons
npx lore update                                     # in-place server upgrade
```

---

## Development

```bash
pnpm install                            # install all workspaces
pnpm dev                                # turbo-run dev for every app
pnpm build                              # compile every app
pnpm test                               # vitest across every workspace
pnpm lint                               # oxlint
pnpm format:check                       # prettier

pnpm --filter @lore/server dev          # server-only dev loop
pnpm --filter @lore/server db:migrate   # apply migrations
pnpm --filter @lore/web dev             # web UI on http://localhost:3001
pnpm --filter @alpharages/lore build    # build the CLI
```

Husky pre-commit runs `pnpm lint && pnpm format:check`. Each app owns its own
`lint-staged` block so rules stay scoped to the workspace that needs them.

---

## API & Postman

A ready-to-import Postman collection lives in the repo root:
[`lore-api.postman_collection.json`](lore-api.postman_collection.json).

| Variable        | Description                                              |
| --------------- | -------------------------------------------------------- |
| `baseUrl`       | Base URL of the server — default `http://localhost:3000` |
| `projectApiKey` | Project API key — `lore_<slug>_<24chars>`                |
| `adminSecret`   | Value of your `ADMIN_SECRET` environment variable        |
| `projectSlug`   | Project slug used in path parameters                     |
| `sessionId`     | Active session UUID                                      |
| `lessonId`      | Lesson UUID                                              |
| `propagationId` | Pending propagation UUID                                 |

| Folder           | Routes                                                                           | Auth             |
| ---------------- | -------------------------------------------------------------------------------- | ---------------- |
| Public           | `GET /health`                                                                    | None             |
| Admin — Projects | `POST /api/projects/register`, `GET /api/projects`, `DELETE /api/projects/:slug` | `X-Admin-Secret` |
| Admin — Metrics  | `GET /metrics`                                                                   | `X-Admin-Secret` |
| Inbox            | `GET /api/projects/:slug/inbox`, accept/reject propagations                      | Bearer token     |
| MCP Tools        | All tool endpoints under `/mcp/tools/*`                                          | Bearer token     |
| MCP Protocol     | `POST /mcp` — streamable HTTP JSON-RPC entry point                               | Bearer token     |

---

## Environment Variables

### `@lore/server`

| Variable               | Required | Default | Description                          |
| ---------------------- | -------- | ------- | ------------------------------------ |
| `DATABASE_URL`         | Yes      | —       | Postgres connection string           |
| `POSTGRES_PASSWORD`    | Yes      | —       | Postgres password                    |
| `OPENAI_API_KEY`       | Yes      | —       | Used for `text-embedding-3-small`    |
| `ADMIN_SECRET`         | Yes      | —       | Bearer token for admin endpoints     |
| `MCP_SERVER_PORT`      | No       | `3100`  | Internal port (nginx proxies to 443) |
| `LOG_LEVEL`            | No       | `info`  | Pino log level                       |
| `LORE_PG_VOLUME_BYTES` | No       | `0`     | Disk quota reported in `/metrics`    |

### `@lore/web`

| Variable                   | Required | Default | Description                      |
| -------------------------- | -------- | ------- | -------------------------------- |
| `WEB_UI_SECRET`            | Yes      | —       | Admin password for the dashboard |
| `NEXT_PUBLIC_LORE_API_URL` | Yes      | —       | Public URL of the Lore server    |
| `COOKIE_SECURE`            | No       | `true`  | Set `false` for local HTTP dev   |

---

## Project Layout

```
lore/
├── apps/
│   ├── server/                 @lore/server          (Fastify, MCP, Postgres)
│   ├── cli/                    @alpharages/lore      (npm-published CLI)
│   └── web/                    @lore/web             (Next.js dashboard)
├── planning-artifacts/         PRD, architecture, epics, tech specs
├── docker-compose.yml          server + nginx + Postgres + web
├── lore-api.postman_collection.json
├── pnpm-workspace.yaml         packages: ['apps/*']
├── turbo.json                  dev / build / test / lint pipelines
└── CLAUDE.md                   agent conventions (read by AI assistants)
```

Authoritative references:

- [Product Requirements](planning-artifacts/PRD.md)
- [Architecture](planning-artifacts/architecture.md)
- [Epics & Stories](planning-artifacts/epics-and-stories.md)
- [Tech Spec](planning-artifacts/tech-spec.md)
- [Web UI Tech Spec](planning-artifacts/web-ui-tech-spec.md)
- [UX Design Specification](planning-artifacts/ux-design-specification.md)

---

## Roadmap

- [x] **Epic 1–6** — Memory server, MCP tools, embeddings, propagation engine, CLI.
- [x] **Epic 7–11** — Web UI: dashboard, lesson search, slide-over detail, Cmd+K, propagation inbox, admin panel.
- [x] **Epic 12** — Monorepo restructure into the `apps/server`, `apps/cli`, `apps/web` three-app layout. Independent versioning. Helmet/CORS hardening. Audit clean.
- [ ] **Epic 13** — Patterns subsystem: `save_pattern` / `get_patterns` MCP tools, usage-count tracking, BMAD architect-workflow integration.
- [ ] Beyond — historical pattern mining, multi-tenant SaaS deployment mode, additional embedding providers.

See [`planning-artifacts/epics-and-stories.md`](planning-artifacts/epics-and-stories.md) for the canonical, BMAD-compatible list.

---

## Contributing

Contributions are welcome. Open an issue before submitting a large pull request
so we can align on approach.

1. Fork the repo and create a branch from `main`.
2. Make your changes — `pnpm lint` and `pnpm test` must pass.
3. Open a PR with a clear description of what changed and why.

Read [`CLAUDE.md`](CLAUDE.md) before touching code — it documents the
arrow-function rule, the four-layer import boundary, and the pnpm-only stance
that the codebase enforces.

---

## License

MIT — see [LICENSE](LICENSE).

<div align="center">

Built by [Alpharages](https://github.com/Alpharages). Designed for teams that
expect their AI agents to learn from yesterday's review.

</div>
