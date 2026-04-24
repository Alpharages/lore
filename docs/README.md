# Lore Platform — Documentation

This folder contains the complete design documentation for the Lore Platform,
a multi-project AI governance and memory system.

## Documents

| File | Document | Description |
|------|----------|-------------|
| [01-prd.md](01-prd.md) | Product Requirements Document | Goals, user stories, feature requirements, success metrics |
| [02-technical-spec.md](02-technical-spec.md) | Technical Specification | API contracts, tool schemas, algorithms, data models |
| [03-architecture.md](03-architecture.md) | Architecture Document | System diagrams, component structure, DB DDL, deployment |

## What Is Lore Platform?

Lore Platform is the generalized, multi-project evolution of BuildClear's
`claude-config` system. It consists of three components:

1. **`@lore/cli`** — npm package. One install, zero ongoing friction.
2. **`lore-platform`** — Versioned skill files. Downloaded by CLI automatically.
3. **`lore-memory-mcp`** — Self-hosted memory server. PostgreSQL + pgvector + MCP.

Plus **GitNexus** for live code intelligence (existing open-source tool, wired in).

## Key Design Decisions

- Memory is **team-shared, project-isolated** — all developers share lessons, no project leaks to another
- Lessons are **auto-captured** — no manual documentation required (threshold: 2 occurrences)
- **Semantic search** via OpenAI embeddings + pgvector — relevant lessons surfaced, not a full dump
- **Cross-project propagation** — proven lessons suggest themselves to other projects with same stack
- **GitNexus** indexes code knowledge graph automatically via git hooks — no developer commands required
- **RLS at database level** — project isolation enforced in Postgres, not application code

## Build Order (When Implementing)

1. `lore-memory-mcp` — DB schema, Docker, basic MCP tools
2. `lore-platform` — Port BuildClear skills to generic templates
3. `@lore/cli` — `init`, `install`, `update` commands
4. Semantic search layer — OpenAI embeddings + pgvector queries
5. Auto-capture — Error tracking + threshold logic in lesson skill
6. Cross-project propagation — Background job + suggest tool
7. Admin UI — Browse memory visually (v2)

## Related

- [BuildClear claude-config](../../README.md) — The proof-of-concept this is based on
- [GitNexus](https://github.com/abhigyanpatwari/GitNexus) — Code intelligence (external, wired in)
