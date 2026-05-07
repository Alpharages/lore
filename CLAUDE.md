# Lore Platform — Agent Standards

This file is read automatically by Claude Code. All AI agents working on this codebase
must follow these conventions without exception.

---

## 1. Arrow Functions — Mandatory

**Never use `function` declarations in `src/`.** All functions must be arrow functions
assigned to `const`.

```typescript
// ✅ CORRECT
export const doThing = async (input: Input): Promise<Output> => { ... }

// ❌ WRONG
export async function doThing(input: Input): Promise<Output> { ... }
```

---

## 2. Project Structure

```
src/
├── api/
│   ├── controllers/     HTTP only — input validation, status codes, response shaping
│   ├── middleware/      Auth, rate-limit, admin-auth
│   └── app.ts           Fastify factory
├── services/            Business logic — no DB imports, no Fastify imports
├── repositories/        Drizzle ORM queries — no business logic
├── db/                  Schema, migrations, client
├── mcp/                 MCP server wiring
└── utils/               Logger, errors
```

**Layer import rules (hard — violations are bugs):**

- `controllers/` → may import `services/` only (no `drizzle-orm`, no `repositories/`)
- `services/` → may import `repositories/` only (no `fastify`, no `drizzle-orm`)
- `repositories/` → may import `db/` and `drizzle-orm` only (no `services/`, no `fastify`)

---

## 3. Package Manager

Always use **pnpm**. Never run `npm install`. Never commit `package-lock.json`.

```bash
pnpm install          # install
pnpm run build        # compile
pnpm run test         # test
pnpm run lint         # oxlint
pnpm run format       # prettier
```

---

## 4. Linting & Formatting

Before committing any code:
- `pnpm lint` must exit 0
- `pnpm format:check` must exit 0

---

## 5. Planning Artifacts

| Document | Path |
|----------|------|
| PRD | `planning-artifacts/PRD.md` |
| Architecture | `planning-artifacts/architecture.md` |
| Epics & Stories | `planning-artifacts/epics-and-stories.md` |
| Tech Spec | `planning-artifacts/tech-spec.md` |

Architecture §10 is the authoritative reference for all conventions above.
