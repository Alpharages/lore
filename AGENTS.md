# Lore Platform — Agent Standards

This file is read by AI coding agents (OpenAI Codex, Cursor, Claude, etc.).
All agents must follow these conventions without exception.

---

## Arrow Functions — Mandatory

Never use `function` declarations in `src/`. All functions must be arrow functions.

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
src/api/routes/        → Fastify plugins (URL, schema, preHandlers) only
src/api/controllers/   → Plain handler functions (request, reply) — calls services
src/services/          → Business logic only — no DB, no Fastify
src/repositories/      → Database (Drizzle ORM) only
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

This project is indexed by GitNexus as **lore** (914 symbols, 1899 relationships, 15 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/lore/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool             | When to use                   | Command                                                                 |
| ---------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `query`          | Find code by concept          | `gitnexus_query({query: "auth validation"})`                            |
| `context`        | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})`                              |
| `impact`         | Blast radius before editing   | `gitnexus_impact({target: "X", direction: "upstream"})`                 |
| `detect_changes` | Pre-commit scope check        | `gitnexus_detect_changes({scope: "staged"})`                            |
| `rename`         | Safe multi-file rename        | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher`         | Custom graph queries          | `gitnexus_cypher({query: "MATCH ..."})`                                 |

## Impact Risk Levels

| Depth | Meaning                               | Action                |
| ----- | ------------------------------------- | --------------------- |
| d=1   | WILL BREAK — direct callers/importers | MUST update these     |
| d=2   | LIKELY AFFECTED — indirect deps       | Should test           |
| d=3   | MAY NEED TESTING — transitive         | Test if critical path |

## Resources

| Resource                              | Use for                                  |
| ------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/lore/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/lore/clusters`       | All functional areas                     |
| `gitnexus://repo/lore/processes`      | All execution flows                      |
| `gitnexus://repo/lore/process/{name}` | Step-by-step execution trace             |

## Self-Check Before Finishing

Before completing any code modification task, verify:

1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
