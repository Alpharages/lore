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
[What Lore Stores](#what-lore-stores) ·
[Use Cases](#use-cases) ·
[Onboarding](#onboarding-an-existing-project) ·
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
code reviews and developer sessions, embeds them semantically (local Ollama by
default, OpenAI optional), and serves them to your AI agents through the Model
Context Protocol — so the next agent that touches that auth flow already knows
about the bug you fixed last quarter.

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
2. **Embed.** A vector is generated by the configured provider — `nomic-embed-text`
   via Ollama by default, `text-embedding-3-small` when `EMBEDDING_PROVIDER=openai`
   — and stored in pgvector. Failed embeddings degrade gracefully to
   `embedding_status='pending'` and retry asynchronously.
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

| Tool                       | Purpose                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `save_lesson`              | Persist a lesson with embedding and provenance                                                  |
| `query_lessons`            | Semantic search over lessons for a project                                                      |
| `query_lessons_for_task`   | Lessons + patterns scoped to a tracker task                                                     |
| `search_similar`           | Nearest-neighbour search across the lesson corpus                                               |
| `get_patterns`             | Retrieve high-frequency patterns for a stack                                                    |
| `capture_review_finding`   | Ingest a code-review finding as a lesson with provenance                                        |
| `get_pending_propagations` | Cross-project propagation candidates for triage                                                 |
| `accept_propagation`       | Accept a propagated lesson into this project                                                    |
| `reject_propagation`       | Reject a propagated lesson                                                                      |
| `start_session`            | Open a BMAD workflow session                                                                    |
| `end_session`              | Close a session and record applied lessons                                                      |
| `link_lessons_to_task`     | Attach consulted lessons to a tracker task                                                      |
| `propose_project_update`   | Capture a requirement, decision, scope change, constraint or research finding with its evidence |
| `review_project_update`    | Inspect, revise, accept or reject a proposal; append, supersede or redact its evidence          |
| `query_project_context`    | Bounded current project context for a question or task, with evidence and conflict warnings     |
| `get_project_history`      | Filtered project evolution events, including superseded and rejected material                   |
| `link_project_updates`     | Typed relationships between project items, and links to sessions or tracker tasks               |

Authentication is per-project — every tool call carries a `lore_<slug>_<24>`
bearer token; RLS scopes every query to that project automatically.

### Project Evolution

Alongside Engineering Memory (lessons, patterns, sessions, propagation), Lore
keeps an evidence-backed, time-aware record of what a project currently
requires and how it got there — see
[`planning-artifacts/project-evolution-prd.md`](planning-artifacts/project-evolution-prd.md).

Three rules govern it:

- **Discussion is not a decision.** Capture always produces a `proposed` item.
  No amount of AI confidence accepts project truth; a human or a trusted
  workflow ratifies it explicitly.
- **Canonical history is append-only.** Revisions, evidence, review actions and
  relationships are only ever added or tombstoned. Accepted knowledge changes
  by proposing a superseding item, never by an in-place edit.
- **Evidence, not archives.** Lore stores the relevant excerpt and a source
  reference. It never needs to own the mailbox, channel or meeting it came from.

A normal context query returns the current accepted state with its evidence and
the reason each item matched. Ask using superseded wording and Lore returns the
item that replaced it, with a warning saying so.

---

## What Lore Stores

The most common misconception about Lore is that it is a document store. It is
not. It records **claims and their provenance** — the statement your team made,
who made it, when, and a reference back to wherever the original lives. The
mailbox, the Slack workspace, the meeting recording and the Git repository stay
exactly where they are and stay authoritative.

Project Evolution writes to six tables and nothing else:

| Table                             | What lands in it                                                                                                          | Grows when                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `project_evolution_items`         | The current claim — type, title, statement, rationale, status, revision, a `vector(768)` embedding and a `tsvector` index | One row per item, for the life of the item                    |
| `project_evolution_item_versions` | A frozen snapshot of the title, statement and rationale at each revision                                                  | Every revision — earlier wording is never overwritten         |
| `project_evolution_evidence`      | `source_kind`, `source_reference`, `external_source_id`, `excerpt`, `source_author`, `occurred_at`                        | Every evidence append                                         |
| `project_evolution_relations`     | Typed edges between items: `supersedes`, `supports`, `contradicts`, `caused_by`, `implements`, `related_to`               | Every relation; retraction sets `retracted_at`, never deletes |
| `project_evolution_links`         | An item tied to a Lore session or to a ClickUp / Jira / Asana task                                                        | Every link; retraction sets `retracted_at`                    |
| `project_evolution_events`        | The audit log — twelve event types with actor, API key id, note and a JSON payload                                        | Every state change; never updated, never deleted              |

### What a single capture actually writes

One `propose_project_update` carrying one piece of evidence inserts four rows:

1. `items` — status `proposed`, revision 1, plus a `statement_hash` (SHA-256 of
   the type and the normalised statement) that makes an identical re-submit
   idempotent instead of creating a duplicate.
2. `item_versions` — the revision-1 snapshot.
3. `evidence` — one row.
4. `events` — a `proposed` event, then one `evidence_added` event.

Accepting the item appends an `accepted` event and sets `status`, `approved_by`
and `reviewed_at`. If the acceptance declares a supersession you also get a
`supersedes` relation, a `superseded` event against the older item, and that
item flips to `status = 'superseded'` with `superseded_by_item_id` pointing
forward. Its text survives untouched — history is append-only, so the old claim
stays readable and citable forever.

Event rows are stamped with `clock_timestamp()` rather than `now()`. A single
request appends several events and `now()` would give them all the transaction
start time, collapsing their real order in the audit log.

### What Lore deliberately does not store

- **Not your documents.** Only the excerpt you hand it, plus a reference to
  where the original lives. See
  [Putting a whole PRD or architecture doc in Lore](#putting-a-whole-prd-or-architecture-doc-in-lore).
- **Not a searchable copy of your evidence.** Only `title`, `statement` and
  `rationale` are embedded and full-text indexed. An excerpt is provenance you
  read _after_ an item matches — it never causes the match, and a context query
  returns only its first 200 characters as a preview.
- **Not excerpts in the audit log.** The `evidence_added` event records the
  source kind, reference, external id and who provided it — never the excerpt
  text. The event stream therefore stays safe to export even when the excerpts
  themselves are sensitive.
- **Not deletions.** Redacting evidence clears the excerpt but keeps the row,
  sets `redacted_at` and `redaction_reason`, and appends an `evidence_redacted`
  event. The tombstone is the point: "this evidence was lawfully redacted" must
  never look identical to "this item never had evidence."

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
| Project Evolution     | Current context grouped by type, a review inbox for proposals, an evidence-backed timeline, and item detail with full provenance. |
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

**Prerequisites:** Docker, Docker Compose, and pnpm 11. Embeddings default to a
local Ollama model (no API key); an OpenAI key is needed only if you switch
`EMBEDDING_PROVIDER=openai`.

```bash
# 1. Clone
git clone https://github.com/Alpharages/lore.git
cd lore

# 2. Install workspace dependencies
pnpm install

# 3. Configure (per-app .env)
cp .env.example             .env
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example    apps/web/.env
# Edit .env              — host port bindings, read by docker compose itself
# Edit apps/server/.env  — DATABASE_URL, ADMIN_SECRET, POSTGRES_PASSWORD
# Edit apps/web/.env     — WEB_UI_SECRET, NEXT_PUBLIC_LORE_API_URL

# 4. TLS certs (production)
# Place fullchain.pem + privkey.pem under apps/server/nginx/certs/

# 5. Bring it up
#    Both the bundled Postgres and Ollama are opt-in profiles, so a deployment
#    using a managed database or a hosted embedding provider never starts a
#    container it does not want. Self-hosting the whole stack means both:
docker compose --profile local-db --profile local-embedding up -d

#    Pointing DATABASE_URL at a managed Postgres (Supabase, RDS, Neon)?
#    Drop local-db. Using EMBEDDING_PROVIDER=openai? Drop local-embedding.
#    docker compose up -d          # server + web only

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

## Onboarding an Existing Project

Lore is meant to be bolted onto a codebase that already has years of history.
Nothing gets rewritten — you register the repo, wire the agents, and seed a
baseline from the artefacts you already have.

### 1. Register the repo

From the root of the existing project:

```bash
export LORE_ADMIN_SECRET=<the server's ADMIN_SECRET>
npx lore init
```

The wizard asks for a project name, slug, server URL, and one or more
repositories with their stack tags. It then:

- registers the project and prints a `lore_<slug>_<24>` API key,
- stores that key in `~/.lore/credentials.json`,
- writes `lore.yaml` at the repo root,
- inserts a managed Lore section into `CLAUDE.md` and `AGENTS.md`, leaving the
  rest of those files alone — re-running `init` rewrites only that section.

A monorepo registers once and lists several repos; each gets its own slug and
stack tags, so lessons stay attributable to the package they came from.

### 2. Wire the agents

```bash
npx lore install --ide detected     # only the IDEs actually on this machine
npx lore install --ide all          # every supported client
```

`init` is run once, by whoever onboards the project. `install` is run by every
developer on their own machine.

### 3. Seed the accepted baseline

A fresh project has empty context, so the first `query_project_context` returns
nothing worth having. Backfill what the team already decided, using the
documents that recorded it — the PRD, the ADRs, the architecture doc, the ticket
where scope got cut.

```bash
export LORE=http://localhost:3100
export LORE_API_KEY=<the key init printed>

curl -sX POST "$LORE/mcp/tools/propose_project_update" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "type": "constraint",
    "title": "No customer PII leaves the cluster",
    "statement": "No customer PII may be sent to any third-party API, including AI providers.",
    "capture_mode": "manual",
    "proposed_by": "onboarding",
    "occurred_at": "2025-03-11T00:00:00Z",
    "evidence": [{
      "source_kind": "document",
      "source_reference": "docs/architecture.md#data-residency",
      "excerpt": "No PII or document files transmitted to any third-party AI API — ever.",
      "provided_by": "human"
    }]
  }'
# -> proposed; accept it with review_project_update {"action":"accept"}
```

Four things worth getting right on a backfill:

- **Aim for ten to thirty items, not two hundred.** Capture what an agent would
  get _wrong_ if nobody told it. Anything obvious from reading the code is
  already available to the agent for free.
- **Every item needs evidence.** A doc anchor, a file path, a ticket URL. Lore
  refuses to accept an item with no live evidence — which is exactly the guard
  you want when importing in bulk.
- **Set `occurred_at` to when the decision was actually made.** Recency feeds
  retrieval ranking, and a 2023 decision stamped as today will outrank the
  things that genuinely replaced it.
- **Replay supersessions in order.** Propose and accept the old item first, then
  propose its replacement with `supersedes_item_id`. That reproduces the real
  timeline instead of flattening it into a single "current" layer.

#### Putting a whole PRD or architecture doc in Lore

As [What Lore Stores](#what-lore-stores) explains, Lore is not a document
store, and pasting an entire document into one item makes retrieval worse rather
than better: only `title`, `statement` and `rationale` are embedded and indexed.
A whole PRD in one `statement` produces a single embedding averaged across the
document — it scores middling against every query and precisely against none.

| Field                | Limit                                                  |
| -------------------- | ------------------------------------------------------ |
| `statement`          | 20,000 characters stored; the first 8,000 are embedded |
| `excerpt`            | 20,000 characters stored; 200 returned as a preview    |
| `evidence` per call  | 25 entries                                             |
| context query result | 50 items maximum                                       |

Chunk the document instead — one item per requirement, per NFR, per ADR, per
decision — with the clause as the `statement` and the document anchor as the
evidence `source_reference`:

```bash
# FR-14 of the PRD becomes one retrievable item
curl -sX POST "$LORE/mcp/tools/propose_project_update" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "type": "requirement",
    "title": "FR-14 — Signed URLs expire within 15 minutes",
    "statement": "Every document download is served through a signed URL with a time-to-live of 15 minutes or less. No document is ever exposed on a public URL.",
    "capture_mode": "manual",
    "occurred_at": "2025-03-11T00:00:00Z",
    "evidence": [{
      "source_kind": "document",
      "source_reference": "planning-artifacts/PRD.md#fr-14",
      "excerpt": "FR-14: Signed URLs MUST expire in 15 minutes or less; storage is private-only.",
      "provided_by": "human"
    }]
  }'
```

That is still the whole document in Lore — the same content, cut so each clause
can win a query on its own merits instead of being averaged into one blob. The
document itself stays in git, where diffs and review already work; Lore holds
the claims and points back at the source.

Use `relation_type` to keep the document's structure: `implements` from a
decision to the requirement it satisfies, `caused_by` from a constraint to the
research finding behind it, `supersedes` when a later revision replaces an
earlier clause.

### 4. Seed lessons from past reviews (optional)

If the team has a backlog of review comments it keeps re-writing, `save_lesson`
turns each one into something the next agent reads before it writes:

```bash
curl -sX POST "$LORE/mcp/tools/save_lesson" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "title": "Transactions must set the RLS project id",
    "problem": "Queries inside a transaction returned rows belonging to other projects.",
    "root_cause": "app.current_project_id is a session variable, and a pooled transaction runs on a different session.",
    "fix": "Set app.current_project_id as the first statement inside the transaction.",
    "prevention_rule": "Any repository function that opens a transaction sets the project id before its first query.",
    "stack_tags": ["typescript", "drizzle", "postgres"],
    "severity": "critical",
    "repo_slug": "server"
  }'
```

### 5. Verify the baseline

```bash
curl -sX POST "$LORE/mcp/tools/query_project_context" \
  -H "Authorization: Bearer $LORE_API_KEY" \
  -H 'Content-Type: application/json' -d '{"limit":20}'
```

With no `query`, this returns the entire current accepted state. If it reads
like what you would tell a new joiner on day one, the baseline is done. The same
view is in the Web UI under **Project Evolution → Context**.

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

## Use Cases

Every example below is a plain `curl` against the REST tool route. An MCP client
— Cursor, Claude Code, Claude Desktop, Windsurf — calls the same tools by name
with the same arguments; the bearer token is your project API key either way.

```bash
export LORE=http://localhost:3100
export LORE_API_KEY=lore_my-project_xxxxxxxxxxxxxxxxxxxxxxxx
```

### A decision made in Slack becomes project truth

Somebody settles the auth question in a thread on a Tuesday. Capture it with the
thread as evidence, instead of paraphrasing it from memory three sprints later.

```bash
curl -sX POST "$LORE/mcp/tools/propose_project_update" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "type": "decision",
    "title": "Sessions use short-lived JWTs with refresh rotation",
    "statement": "Access tokens expire after 15 minutes. Refresh tokens rotate on every use and the whole family is revoked on reuse.",
    "rationale": "A stolen access token stays useful for minutes instead of weeks.",
    "capture_mode": "manual",
    "proposed_by": "khakan",
    "evidence": [{
      "source_kind": "slack",
      "source_reference": "https://acme.slack.com/archives/C0123/p1699999999",
      "excerpt": "Agreed — 15 min access, rotating refresh, revoke the family on reuse.",
      "source_author": "lead@acme.com",
      "provided_by": "human",
      "occurred_at": "2026-08-14T09:12:00Z"
    }]
  }'
# -> { "item": { "id": "...", "status": "proposed", ... } }
```

It comes back **`proposed`**. It always does — capture is not ratification, and
no amount of AI confidence changes that. A human accepts it from the Web UI
review inbox, or over the API:

```bash
curl -sX POST "$LORE/mcp/tools/review_project_update" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"item_id":"<id>","action":"accept","reviewer":"khakan","note":"Confirmed in the arch sync."}'
```

An item carrying no live evidence cannot be accepted at all — the call fails
rather than quietly recording an unsourced claim as project truth.

### An agent picks up a ticket and asks what it needs to know

```bash
curl -sX POST "$LORE/mcp/tools/query_project_context" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "task_context": {
      "title": "Add the refresh-token endpoint",
      "description": "POST /auth/refresh — rotate the pair and return the new one."
    },
    "limit": 10,
    "hops": 1
  }'
```

What comes back is the accepted state relevant to _this_ task — each item with
its evidence, the reason it matched, and the items one hop away: the constraint
it depends on, the decision that caused it. Not a dump of the whole project.

Ask using wording that has since been replaced — "tokens last 30 days" — and
Lore returns the item that superseded it together with a warning saying so,
rather than a confident wrong answer or an empty result.

### The requirement changes

Nothing is edited in place. The replacement declares what it replaces:

```bash
curl -sX POST "$LORE/mcp/tools/propose_project_update" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "type": "requirement",
    "title": "Access tokens expire after 5 minutes",
    "supersedes_item_id": "<old-item-id>",
    "evidence": [{
      "source_kind": "meeting",
      "source_reference": "Security review, 2026-08-19",
      "excerpt": "Pen-test finding 4.2 — drop the access-token TTL to 5 minutes.",
      "provided_by": "human"
    }]
  }'
```

On acceptance the old item flips to `superseded` and stays queryable forever:

```bash
curl -sX POST "$LORE/mcp/tools/get_project_history" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"statuses":["superseded","rejected"],"limit":50}'
```

That is the audit trail — what the team believed, when it stopped believing it,
who said so, and on what evidence.

### A review finding becomes a lesson the next agent reads

```bash
curl -sX POST "$LORE/mcp/tools/capture_review_finding" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "external_task_id": "AUTH-412",
    "external_tracker_type": "jira",
    "severity": "high",
    "reviewer": "khakan",
    "finding": {
      "title": "Refresh rotation did not revoke the old token",
      "problem": "The rotated token was issued before the previous one was invalidated, leaving both valid.",
      "fix": "Invalidate the presented token in the same transaction that issues its replacement.",
      "prevention_rule": "Token rotation issues and revokes in one transaction, never in two steps.",
      "stack_tags": ["typescript", "auth"],
      "code_pointer": { "file": "src/services/auth.service.ts", "line_start": 88, "line_end": 104 }
    }
  }'
```

The next agent that opens a task touching that area calls
`query_lessons_for_task` and gets this back before it writes a line — along with
the project context above, if it asks for both.

### Wiring an item to the work that implements it

```bash
curl -sX POST "$LORE/mcp/tools/link_project_updates" \
  -H "Authorization: Bearer $LORE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"item_id":"<id>","external_tracker_type":"jira","external_task_id":"AUTH-412"}'
```

Typed item-to-item relationships use the same tool —
`{"from_item_id":"...","to_item_id":"...","relation_type":"implements"}` — with
`supports`, `contradicts`, `caused_by` and `related_to` also available.
Retracting a link appends an event rather than deleting the original.

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

### Repo root `.env` — read by docker compose, not by an app

Compose resolves the `${VAR}` placeholders in `docker-compose.yml` from this
file before any container exists. A host port binding can only come from here;
setting it in a per-app `.env` has no effect, because those are `env_file:`
entries that populate the environment _inside_ an already-created container.

| Variable                   | Required | Default                 | Description                                                         |
| -------------------------- | -------- | ----------------------- | ------------------------------------------------------------------- |
| `WEB_PORT`                 | No       | `3001`                  | Host port for the dashboard; the container always listens on `3001` |
| `MCP_SERVER_PORT`          | No       | `3100`                  | Host port for the API — also set it in `apps/server/.env`           |
| `NEXT_PUBLIC_LORE_API_URL` | No       | `http://localhost:3100` | Build arg baked into the web image; see `@lore/web` below           |

### `@lore/server`

| Variable               | Required  | Default               | Description                              |
| ---------------------- | --------- | --------------------- | ---------------------------------------- |
| `DATABASE_URL`         | Yes       | —                     | Postgres connection string               |
| `POSTGRES_PASSWORD`    | Yes       | —                     | Postgres password                        |
| `EMBEDDING_PROVIDER`   | No        | `local`               | `local` (Ollama, 768) or `openai` (1536) |
| `OLLAMA_BASE_URL`      | No        | `http://ollama:11434` | Used when provider is `local`            |
| `OPENAI_API_KEY`       | If openai | —                     | Used for `text-embedding-3-small`        |
| `ADMIN_SECRET`         | Yes       | —                     | Bearer token for admin endpoints         |
| `MCP_SERVER_PORT`      | No        | `3100`                | Internal port (nginx proxies to 443)     |
| `LOG_LEVEL`            | No        | `info`                | Pino log level                           |
| `LORE_PG_VOLUME_BYTES` | No        | `0`                   | Disk quota reported in `/metrics`        |

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
- [Project Evolution PRD](planning-artifacts/project-evolution-prd.md)
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
- [x] **Project Evolution — Phase 1** — Evidence-backed requirements, decisions, scope changes, constraints and research findings: proposal/review lifecycle, supersession, typed relationships, hybrid current-context retrieval, history, and the Web UI review inbox, context and timeline views. See the [Project Evolution PRD](planning-artifacts/project-evolution-prd.md).
- [ ] **Project Evolution — Phase 2** — AI-assisted extraction from evidence, duplicate and relationship suggestions, and links from evolution items to lessons and patterns.
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
