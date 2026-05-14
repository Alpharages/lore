# Lore

> Institutional memory for AI-driven development teams.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Issues](https://img.shields.io/github/issues/Alpharages/lore)](https://github.com/Alpharages/lore/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Alpharages/lore/pulls)

Lore captures lessons from code reviews and developer sessions, embeds them
semantically, and surfaces the relevant ones to AI agents at the right moment —
so the same mistake is never explained twice.

Teams using AI coding assistants face a persistent problem: every session starts
from scratch. Reviewers flag the same anti-patterns. Developers hit the same
bugs. Lore fixes this by giving your AI agents a shared, queryable memory that
compounds over time.

---

## How It Works

1. **Capture** — BMAD code-review skills automatically push findings into Lore as lessons.
2. **Embed** — Each lesson is embedded with `text-embedding-3-small` and stored in pgvector.
3. **Recall** — Before starting a task, agents query Lore for semantically similar past lessons.
4. **Propagate** — Lessons proven on one project surface as suggestions on others with the same stack.

Memory is **team-shared and project-isolated** — all developers benefit, no project leaks to another. Row-Level Security enforces this at the database layer, not the application layer.

---

## Components

| Component          | Description                                                                           |
| ------------------ | ------------------------------------------------------------------------------------- |
| `lore-memory-mcp`  | The server (this repo). Fastify + PostgreSQL 16 + pgvector + MCP protocol over HTTPS. |
| `@alpharages/lore` | npm package. Wires the MCP server into Cursor / Claude Code on developer machines.    |

---

## Architecture

```
AI Agent → MCP/HTTPS → nginx (TLS) → lore-memory-mcp → Postgres + pgvector
```

The server is self-hosted — you own the data. Developer machines connect using
project-scoped API keys. The propagation engine runs in the background and
matches lessons across projects by stack tags.

---

## MCP Tools

Lore exposes the following tools over the MCP protocol. BMAD custom skills call
them by convention; you can also call them directly from any MCP client.

| Tool                       | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `save_lesson`              | Persist a lesson with embedding                          |
| `query_lessons`            | Semantic search over lessons for a project               |
| `query_lessons_for_task`   | Lessons scoped to an external task (ClickUp / Jira)      |
| `search_similar`           | Nearest-neighbour search across the lesson corpus        |
| `get_patterns`             | Retrieve high-frequency patterns for a stack             |
| `capture_review_finding`   | Ingest a code-review finding as a lesson with provenance |
| `get_pending_propagations` | Return cross-project propagation candidates              |
| `accept_propagation`       | Accept a propagated lesson into this project             |
| `reject_propagation`       | Reject a propagated lesson                               |
| `start_session`            | Open a BMAD workflow session                             |
| `end_session`              | Close a session and record applied lessons               |
| `link_lessons_to_task`     | Attach consulted lessons to a tracker task               |

---

## Quick Start

**Prerequisites:** Docker, Docker Compose, an OpenAI API key.

```bash
# 1. Clone
git clone https://github.com/Alpharages/lore.git
cd lore

# 2. Configure
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, OPENAI_API_KEY, ADMIN_SECRET

# 3. TLS
# Place your cert and key at nginx/certs/server.crt and nginx/certs/server.key

# 4. Start
docker compose up -d

# 5. Run migrations
pnpm run db:migrate

# 6. Create your first project
curl -X POST https://your-host/projects \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project","stackTags":["typescript","postgres"]}'
# → returns { apiKey: "lore_..." }
```

The MCP server is reachable at `https://your-host/mcp`. Use the returned API key
in your MCP client config.

---

## CLI Commands

The `@alpharages/lore` package is shipped with this repo. It wires the MCP server into
Cursor and Claude Code on developer machines.

```bash
# Run from any project that has a lore.yaml
npx lore <command>
```

| Command   | Purpose                                                                |
| --------- | ---------------------------------------------------------------------- |
| `init`    | Initialize a new Lore project configuration interactively              |
| `install` | Configure MCP tools and AI assistant integration for this project      |
| `inbox`   | Triage pending lesson-propagation suggestions from sister projects     |
| `update`  | Upgrade the lore-memory-mcp Docker image to a newer compatible version |

### `lore init`

Creates `lore.yaml`, `CLAUDE.md`, `ops/constitution.md`, and per-repo
`REPO_IDENTITY.md` files. Registers the project with the Lore server and prints
an API key.

```bash
export LORE_ADMIN_SECRET=<your-admin-secret>
npx lore init
```

### `lore install`

Reads `lore.yaml` and configures the local machine:

- Interactively selects IDEs/agents via a checkbox-style multi-select TUI
  (arrow keys to navigate, space to toggle, `a` for all, `i` to invert,
  enter to confirm).
- Writes MCP config for each selected target:
  **Cursor**, **Claude Desktop**, **Claude Code**, **Google Antigravity**,
  **Windsurf**, **Cline**, and **Continue**.
- Appends an include to `~/.claude/CLAUDE.md`.
- Installs git hooks (`post-commit`, `post-merge`) in declared repos.
- Runs GitNexus analysis on repos that haven't been analyzed yet.
- Records progress in `~/.lore/install-state.json` for idempotency.

```bash
npx lore install                              # normal run — interactive picker
npx lore install --force                      # clear state and redo everything
npx lore install --ide cursor,claude-code     # non-interactive, specific targets
npx lore install --ide all                    # configure every supported target
npx lore install --ide detected               # configure only detected targets
```

### `lore inbox`

Fetches cross-project lesson suggestions and lets you accept or reject them
one-by-one.

```bash
export LORE_API_KEY=<your-project-api-key>
npx lore inbox
```

### `lore update`

Checks the running Lore server version against the latest compatible Docker
tag, shows release notes, verifies migration compatibility, and upgrades the
server in place.

```bash
npx lore update
```

---

## Environment Variables

| Variable               | Required | Default | Description                          |
| ---------------------- | -------- | ------- | ------------------------------------ |
| `POSTGRES_PASSWORD`    | Yes      | —       | Postgres password                    |
| `OPENAI_API_KEY`       | Yes      | —       | Used for `text-embedding-3-small`    |
| `ADMIN_SECRET`         | Yes      | —       | Bearer token for admin endpoints     |
| `MCP_SERVER_PORT`      | No       | `3100`  | Internal port (nginx proxies to 443) |
| `LOG_LEVEL`            | No       | `info`  | pino log level                       |
| `LORE_PG_VOLUME_BYTES` | No       | `0`     | Disk quota reported in `/metrics`    |

---

## Development

```bash
pnpm install        # install dependencies
pnpm run build      # compile TypeScript
pnpm run test       # run tests (vitest)
pnpm run lint       # lint (oxlint)
pnpm run format     # format (prettier)
pnpm run db:migrate # apply Drizzle migrations
```

---

## Contributing

Contributions are welcome. Please open an issue before submitting a large pull
request so we can discuss the approach first.

1. Fork the repo and create a branch from `main`.
2. Make your changes — `pnpm lint` and `pnpm test` must pass.
3. Open a pull request with a clear description of what and why.

See [planning-artifacts/architecture.md](planning-artifacts/architecture.md) for
the layer rules and conventions the codebase follows.

---

## License

MIT — see [LICENSE](LICENSE).
