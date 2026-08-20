# Lore Platform — Agent Standards

This file is read automatically by Claude Code. All AI agents working on this codebase
must follow these conventions without exception.

---

## 1. Arrow Functions — Mandatory

**Never use `function` declarations in `apps/server/src/` or `apps/cli/src/`.** All functions must be arrow functions
assigned to `const`.

```typescript
// ✅ CORRECT
export const doThing = async (input: Input): Promise<Output> => { ... }

// ❌ WRONG
export async function doThing(input: Input): Promise<Output> { ... }
```

---

## 2. Project Structure — Three-App Layout

```
route → controller → service → repository
```

```
apps/
├── server/              ← API Memory Server (@lore/server)
│   └── src/
│       ├── api/
│       │   ├── routes/          Fastify plugins — URL, schema, preHandlers → delegates to controllers
│       │   ├── controllers/     Plain handler fns (request, reply) → calls services
│       │   ├── middleware/      Auth, rate-limit, admin-auth
│       │   └── app.ts           Fastify factory — registers routes/
│       ├── services/            Business logic — no DB imports, no Fastify imports
│       ├── repositories/        Drizzle ORM queries only
│       ├── db/                  Schema, migrations, client
│       ├── mcp/                 MCP server wiring
│       └── utils/               Logger, errors
├── cli/                 ← Developer CLI (@alpharages/lore)
│   └── src/
│       ├── commands/            CLI commands (install, init, update, inbox)
│       └── core/                Configuration, generators, state, hooks
└── web/                 ← Next.js 15 Web UI Dashboard (@lore/web)
```

**Layer import rules (hard — violations are bugs):**

- `routes/` → may import `controllers/` and `middleware/` only
- `controllers/` → may import `services/` only (no `drizzle-orm`, no `repositories/`)
- `services/` → may import `repositories/` only (no `fastify`, no `drizzle-orm`)
- `repositories/` → may import `db/` and `drizzle-orm` only (no `services/`, no `fastify`)

---

## 3. Package Manager

Always use **pnpm**. Never run `npm install`. Never commit `package-lock.json`.

```bash
pnpm install                                # install all monorepo dependencies
pnpm dev                                    # run all apps in development mode (Turbo)
pnpm build                                  # build all packages (Turbo)
pnpm test                                   # run tests across all workspaces (Turbo)
pnpm lint                                   # lint all workspaces (oxlint)
pnpm format                                 # format all workspaces (prettier)

# Workspace-specific commands:
pnpm --filter @lore/server dev              # run memory server in dev
pnpm --filter @lore/server db:migrate       # run server migrations
pnpm --filter @lore/web dev                 # run web UI in dev
pnpm --filter @alpharages/lore build        # build CLI package
```

---

## 3a. Dependency Versions — Always Current Major

**Always use the current version available on npm, pinned with `^`.** Never install an old major version unless a breaking-change reason is explicitly documented in `.cursor/rules/engineering-standards.mdc`.

```bash
# ✅ CORRECT — installs current major from npm (e.g. openai 6.37.0 → ^6.37.0)
pnpm add openai@latest

# ❌ WRONG — pinning to an old major without a documented reason
pnpm add openai@^4
```

- "Latest" means the current major version on npm (e.g. `^6.x` for openai, not `^4.x`).
- When a story spec or planning artifact names an older version (e.g. `^4.x`), **ignore it** and install the current npm version instead.
- If a breaking change genuinely blocks upgrading to the current major, document it in `engineering-standards.mdc` before pinning.

---

## 4. Linting & Formatting

Before committing any code:

- `pnpm lint` must exit 0
- `pnpm format:check` must exit 0

---

## 5. Planning Artifacts

| Document        | Path                                      |
| --------------- | ----------------------------------------- |
| PRD             | `planning-artifacts/PRD.md`               |
| Architecture    | `planning-artifacts/architecture.md`      |
| Epics & Stories | `planning-artifacts/epics-and-stories.md` |
| Tech Spec       | `planning-artifacts/tech-spec.md`         |

Architecture §10 is the authoritative reference for all conventions above.

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
