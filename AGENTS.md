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

## Three-Layer Architecture

```
src/api/controllers/   → HTTP request/response only
src/services/          → Business logic only
src/repositories/      → Database (Drizzle ORM) only
```

**Strict import rules:**
- Controllers must NOT import from `drizzle-orm`, `pg`, or `repositories/`
- Services must NOT import from `fastify` or `drizzle-orm`
- Repositories must NOT import from `services/` or `fastify`

File naming: `<resource>.controller.ts` / `<resource>.service.ts` / `<resource>.repository.ts`

---

## Package Manager

Use **pnpm** only. Never `npm install`. Never commit `package-lock.json`.

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
