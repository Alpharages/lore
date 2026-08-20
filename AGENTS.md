# Lore Platform — Agent Standards

This file is read by AI coding agents (OpenAI Codex, Cursor, Claude, etc.).
All agents must follow these conventions without exception.

---

## Arrow Functions — Mandatory

Never use `function` declarations in `apps/server/src/` or `apps/cli/src/`. All functions must be arrow functions.

```typescript
// ✅
export const handler = async (input: Input): Promise<Output> => { ... }

// ❌
export async function handler(input: Input): Promise<Output> { ... }
```

---

## Four-Layer Architecture

```
route → controller → service → repository
```

```
apps/server/src/api/routes/        → Fastify plugins (URL, schema, preHandlers) only
apps/server/src/api/controllers/   → Plain handler functions (request, reply) — calls services
apps/server/src/services/          → Business logic only — no DB, no Fastify
apps/server/src/repositories/      → Database (Drizzle ORM) only
```

**Strict import rules:**

- `routes/` must NOT import from `services/`, `repositories/`, or `drizzle-orm`
- `controllers/` must NOT import from `repositories/`, `drizzle-orm`, or `pg`
- `services/` must NOT import from `fastify` or `drizzle-orm`
- `repositories/` must NOT import from `services/` or `fastify`

File naming: `<resource>.route.ts` / `<resource>.controller.ts` / `<resource>.service.ts` / `<resource>.repository.ts`

---

## Package Manager

Use **pnpm** only. Never `npm install`. Never commit `package-lock.json`.

---

## Dependency Versions — Always Current Major

**Always use the current version available on npm, pinned with `^`.** Never install an old major version unless a breaking-change reason is explicitly documented in `.cursor/rules/engineering-standards.mdc`.

- "Latest" = whatever major version is current on npm right now (e.g. `openai@^6.x`, not `^4.x`).
- When a story spec or planning artifact names an older version, **ignore it** and install the current npm version.
- `pnpm add <pkg>@latest` is the default command. Pinning an old major (e.g. `@^4`) requires a written justification in `engineering-standards.mdc`.

---

## Before Every Commit

```bash
pnpm lint          # must pass (oxlint)
pnpm format:check  # must pass (prettier)
pnpm build         # must compile
pnpm test          # must be green
```

---

## Key Files

- Architecture & conventions: `planning-artifacts/architecture.md` (§10)
- Epics & stories: `planning-artifacts/epics-and-stories.md`
- Sprint change proposals: `planning-artifacts/sprint-change-proposal-*.md`

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **lore** (2835 symbols, 5904 relationships, 209 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource                              | Use for                                  |
| ------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/lore/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/lore/clusters`       | All functional areas                     |
| `gitnexus://repo/lore/processes`      | All execution flows                      |
| `gitnexus://repo/lore/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
