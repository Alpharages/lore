# Sprint Change Proposal — Engineering Standards Baseline

**Date:** 2026-05-07  
**Status:** Approved  
**Scope Classification:** Minor-to-Moderate  
**Proposed By:** Developer  
**Routed To:** Developer agent (`bmad-quick-dev`)

---

## 1. Issue Summary

After completing Epic 1 (Memory Server Foundation), four foundational engineering standards were identified that must be applied to the existing codebase before Epic 2 begins. These are not product-requirement changes — they are structural and tooling decisions that, if deferred, will create compounding inconsistency across all future epics.

**Triggering discovery:** Mid-sprint code review of Epic 1 implementation revealed:

- Mixed use of `function` declarations and arrow functions across 21 source files
- npm used as package manager with no pnpm enforcement
- No linter or formatter configured
- Routes acting as controllers (mixing HTTP handling + service calls), services mixing business logic + DB access — no repository layer

**Impact of deferral:** Every story in Epics 2–6 would add code in the wrong style/structure, making a later refactor exponentially larger.

---

## 2. Impact Analysis

### Epic Impact

- **Epic 1** — All 4 stories' implementation files affected (refactor, not re-implementation)
- **Epics 2–6** — Not yet started; these changes define the target structure they must follow

### Artifact Conflicts

- `planning-artifacts/architecture.md` — Needs a **Project Structure** section documenting layer boundaries and tooling conventions
- No PRD changes required
- No story acceptance criteria changes required — Epic 1 ACs remain valid; these changes are implementation-level

### Technical Impact

| Area                          | Files Affected                                    | Change Type         |
| ----------------------------- | ------------------------------------------------- | ------------------- |
| Arrow functions               | 21 `.ts` files                                    | Refactor            |
| pnpm migration                | `package.json`, `Dockerfile`, `package-lock.json` | Config              |
| OXC + Prettier                | New config files, `package.json` scripts          | Additive            |
| Controller/Service/Repository | ~10 files restructured, new dirs                  | Structural refactor |

---

## 3. Recommended Approach

**Direct Adjustment** — apply all 4 changes as a single standards-baseline commit before any Epic 2 story is implemented.

**Rationale:** All changes are scoped to Epic 1 implementation files only. No PRD scope changes. No story ACs change. Applying as one batch keeps git history clean (single "chore: apply engineering standards baseline" commit).

**Effort estimate:** 2–4 hours  
**Risk:** Low — no logic changes, only structural/style transformations  
**Timeline impact:** None — no sprint stories blocked; Epic 2 not yet started

---

## 4. Detailed Change Proposals

### C1 — Arrow Functions (All Files)

**Rule:** No `function` declarations in application code. All functions use `const` arrow syntax.

**Pattern:**

```ts
// BEFORE
export function buildApp(deps: BuildAppDeps): FastifyInstance { ... }
export async function registerProject(db, input) { ... }
export default function projectsRoutes(app, opts, done) { ... }

// AFTER
export const buildApp = (deps: BuildAppDeps): FastifyInstance => { ... }
export const registerProject = async (db: DrizzleClient, input: RegisterProjectInput): Promise<RegisterProjectOutput> => { ... }
const projectsRoutes = (app: FastifyInstance, opts: FastifyPluginOptions & { db: DrizzleClient }, done: (err?: Error) => void): void => { ... }
export default projectsRoutes
```

**Fastify plugin compatibility:** Named `const` arrow functions retain `.name` from the variable binding — Fastify plugin naming works correctly without `fastify-plugin` wrapper.

**Exceptions:** None. Class constructors do not exist in this codebase.

**Files to update:** All 21 files in `src/`.

---

### C2 — pnpm Migration

**Rationale:** pnpm is faster, uses a content-addressable store, enforces strict dependency isolation, and is the standard for modern Node.js monorepos.

**pnpm version:** `11.0.8` (current stable)

**`package.json` additions:**

```json
{
  "packageManager": "pnpm@11.0.8",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=11.0.0"
  }
}
```

**`Dockerfile` — OLD:**

```dockerfile
RUN npm ci --omit=dev
```

**`Dockerfile` — NEW:**

```dockerfile
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
```

**Migration steps:**

1. Delete `package-lock.json`
2. Run `pnpm import` to generate `pnpm-lock.yaml` from existing `package-lock.json`, OR run `pnpm install` fresh
3. Add `packageManager` + `engines.pnpm` to `package.json`
4. Update `Dockerfile`
5. Add `pnpm-lock.yaml` to git; add `node_modules` and `package-lock.json` to `.gitignore`

---

### C3 — OXC Linter + Prettier Formatter

**Rationale:** OXC (`oxlint`) is 50–100x faster than ESLint, TypeScript-aware, and has no config overhead. Prettier enforces consistent formatting without style debates.

**devDependencies to add:**

```json
"oxlint": "latest",
"prettier": "latest"
```

**New `package.json` scripts:**

```json
"lint": "oxlint src",
"lint:fix": "oxlint src --fix",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

**`.oxlintrc.json`:**

```json
{
  "plugins": ["typescript"],
  "env": { "node": true },
  "rules": {}
}
```

**`.prettierrc`:**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

**`.prettierignore`:**

```
dist/
node_modules/
*.lock
```

**Format all existing files** after setup: `pnpm format`

---

### C4 — Controller / Service / Repository Structure

**Rationale:** The current flat structure mixes HTTP concerns, business logic, and data access. The 3-layer pattern enforces clean boundaries that scale across Epics 2–6 (10+ new MCP tools, each needing a service + repository).

**Layer boundaries (strict):**
| Layer | Responsibility | May Import | May NOT Import |
|-------|---------------|-----------|----------------|
| Controller | HTTP request/response, input validation, status codes | Services | Repositories, DB, Drizzle |
| Service | Business logic, orchestration, rules | Repositories | Fastify, HTTP, `pg` |
| Repository | Drizzle ORM queries, DB types | `db/schema`, `db/client` | Services, Fastify |

**Target directory structure:**

```
src/
├── api/
│   ├── controllers/
│   │   ├── projects.controller.ts   ← from routes/projects.ts
│   │   ├── mcp.controller.ts        ← from routes/mcp.ts
│   │   ├── health.controller.ts     ← from routes/health.ts
│   │   └── metrics.controller.ts    ← from routes/metrics.ts
│   ├── middleware/                  (unchanged)
│   └── app.ts                       (update registrations)
├── services/
│   ├── projects.service.ts          ← business logic from projects.ts
│   ├── api-key.ts                   (unchanged — no DB)
│   ├── metrics.ts                   (unchanged)
│   ├── health-probes.ts             (unchanged)
│   └── disk-usage.ts                (unchanged)
├── repositories/
│   └── projects.repository.ts       ← Drizzle queries from projects.ts
├── db/                              (unchanged)
├── mcp/                             (unchanged — Epic 2 will add repositories here)
└── utils/                           (unchanged)
```

**`src/repositories/projects.repository.ts` — extracted from `src/services/projects.ts`:**

```ts
// Contains: registerProjectInDb, listProjectsFromDb, deleteProjectBySlug, findProjectBySlug
// All Drizzle ORM interactions live here
```

**`src/services/projects.service.ts` — business logic only:**

```ts
// Contains: registerProject (generates key, hashes, calls repo), listProjects, deleteProject
// No Drizzle imports — only repository imports
```

**`src/api/controllers/projects.controller.ts`:**

```ts
// Contains: Fastify route handlers, validation, response shaping
// No Drizzle imports — only service imports
```

**`app.ts` registration update:**

```ts
// BEFORE
app.register(projectsRoutes, { prefix: "/api/projects", db: deps.db });

// AFTER
app.register(projectsController, { prefix: "/api/projects", db: deps.db });
```

---

## 5. Implementation Handoff

**Scope:** Minor-to-Moderate  
**Handoff recipient:** Developer agent  
**Recommended workflow:** `bmad-quick-dev`

**Implementation order (dependency-aware):**

1. **C2 first** — pnpm migration (changes lockfile; do before any installs)
2. **C3 second** — OXC + Prettier setup (format before structural changes)
3. **C4 third** — Controller/Service/Repository restructure (largest change)
4. **C1 last** — Arrow functions sweep across all files (after structure is stable)

**Success criteria:**

- [ ] `pnpm install` succeeds with `pnpm-lock.yaml`
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm format:check` passes with zero diffs
- [ ] `pnpm build` succeeds (TypeScript compiles)
- [ ] `pnpm test` passes (all existing tests green)
- [ ] `docker compose up` starts successfully
- [ ] `GET /health` returns 200
- [ ] `GET /metrics` returns Prometheus metrics
- [ ] No `function` keyword used in `src/` (except as type annotations)
- [ ] No Drizzle imports in any controller file
- [ ] No Fastify imports in any service or repository file

**Architecture doc update required:** Add §N "Project Structure & Conventions" to `planning-artifacts/architecture.md` documenting layer boundaries, tooling (OXC, Prettier, pnpm), and arrow-function rule.

---

## 6. Workflow Completion

- **Issue addressed:** Engineering standards not defined before Epic 1 implementation
- **Change scope:** Minor-to-Moderate (no product changes)
- **Artifacts modified:** `src/` (all files), `package.json`, `Dockerfile`, new config files
- **Architecture doc update:** Required (§ Project Structure & Conventions)
- **Routed to:** Developer agent for direct implementation
- **Next step:** Execute `bmad-quick-dev` with this proposal as context
