# Lore Platform — Architecture Document

Version: 1.0.0
Status: Final (Draft for Implementation)
Date: 2026-05-06

---

## 1. Architecture Overview

Lore is a two-component distributed system. `lore-memory-mcp` is the
hub. Developer machines are spokes. Each spoke communicates with the hub
exclusively through the MCP protocol using project-scoped API keys.

### 1.1 Core Architectural Principles

1. **Separation of concerns.** Lore owns memory; bmad-mcp-server owns
   methodology and tracker integration; GitNexus owns code intelligence.
   None depend on the others' internals.

2. **Project isolation by default.** The database enforces isolation at
   the storage layer. Application code cannot accidentally leak data.

3. **Developer experience first.** Every architectural decision is
   evaluated against: "does this add friction for the developer?"

4. **No single point of failure for development.** If `lore-memory-mcp`
   is down, BMAD skills continue without memory context rather than
   blocking.

5. **Compounding value.** The architecture is designed to become more
   valuable over time as lessons accumulate.

6. **One-way dependency.** Lore does not call bmad-mcp-server. BMAD
   custom-skills call Lore. This keeps Lore deployable and useful even
   when BMAD is absent.

---

## 2. System Context Diagram

```
╔═══════════════════════════════════════════════════════════════════╗
║                         EXTERNAL SYSTEMS                          ║
║                                                                   ║
║  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐    ║
║  │  OpenAI API  │   │  Tracker     │   │  npm Registry      │    ║
║  │  (embeddings)│   │  (ClickUp/   │   │  (@lore/cli,       │    ║
║  │              │   │   Jira/Asana)│   │   bmad-mcp-server) │    ║
║  └──────┬───────┘   └──────┬───────┘   └─────────┬──────────┘    ║
╚═════════│══════════════════│═════════════════════│═══════════════╝
          │ embed             │ tracker queries    │ install
          ▼                   │                    ▼
╔═══════════════════════════════════════════════════════════════════╗
║                      DEVELOPER MACHINE                            ║
║                                                                   ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │  Cursor / Claude Code                                       │ ║
║  │  ┌──────────────┐   ┌─────────────┐                         │ ║
║  │  │  AI Agent    │←─→│  MCP Client │                         │ ║
║  │  └──────────────┘   └──┬───┬───┬──┘                         │ ║
║  └────────────────────────│───│───│────────────────────────────┘ ║
║                           │   │   │                              ║
║              MCP/HTTPS    │   │   │ MCP/stdio                    ║
║       ┌───────────────────┘   │   └─────────┐                    ║
║       │                       │ MCP/stdio   │                    ║
║       │              ┌────────▼──────────┐  │                    ║
║       │              │ bmad-mcp-server   │  │                    ║
║       │              │  (npx)            │──┼──→ tracker (above) ║
║       │              └────────┬──────────┘  │                    ║
║       │                       │             ▼                    ║
║       │              ┌────────▼──────────┐ ┌──────────────────┐  ║
║       │              │ Project Repos     │ │ GitNexus (stdio) │  ║
║       │              │ (git hooks active)│ └──────────────────┘  ║
║       │              └───────────────────┘                       ║
╚═══════│══════════════════════════════════════════════════════════╝
        │ HTTPS
╔═══════│══════════════════════════════════════════════════════════╗
║       ▼              SELF-HOSTED SERVER                          ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │  lore-memory-mcp (Docker)                                   │ ║
║  │                                                              │ ║
║  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │ ║
║  │  │  MCP     │  │  Auth     │  │ Embedding│  │Propagation│  │ ║
║  │  │  Tools   │  │ Middleware│  │  Service │  │  Engine   │  │ ║
║  │  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │ ║
║  │       └──────────────┴──────────────┴──────────────┘         │ ║
║  └─────────────────────────────────────────────────────────────┘ ║
║                                                                   ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │  PostgreSQL 16 + pgvector                                   │ ║
║  │  projects  repositories  lessons  patterns  sessions          │ ║
║  │  lesson_propagations                                          │ ║
║  │  Row-Level Security: project_id isolation                     │ ║
║  └─────────────────────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════════════════════╝
```

**Important arrows:**
- BMAD agents call Lore directly via the MCP client.
- Lore never calls BMAD or trackers.
- The tracker arrow originates from bmad-mcp-server only.

---

## 3. Component Architecture

### 3.1 `@lore/cli` Internal Structure

```
@lore/cli/
├── src/
│   ├── index.ts              ← CLI entry point (commander.js)
│   ├── commands/
│   │   ├── install.ts        ← lore install
│   │   ├── init.ts           ← lore init
│   │   ├── update.ts         ← lore update (Docker image)
│   │   ├── inbox.ts          ← lore inbox (propagation triage)
│   │   └── project.ts        ← lore project:register|list (admin)
│   ├── core/
│   │   ├── config-finder.ts  ← lore.yaml discovery (walk up)
│   │   ├── config-parser.ts  ← lore.yaml validation + parsing
│   │   ├── cursor-config.ts  ← Write ~/.cursor/mcp.json (3 servers)
│   │   ├── claude-config.ts  ← Write ~/.claude/CLAUDE.md
│   │   ├── git-hooks.ts      ← Install post-commit/post-merge
│   │   ├── gitnexus.ts       ← Run gitnexus analyze
│   │   ├── version-check.ts  ← Verify lore-memory-mcp compat
│   │   └── state.ts          ← ~/.lore/install-state.json
│   ├── generators/
│   │   ├── lore-yaml.ts      ← Generate lore.yaml from prompts
│   │   ├── claude-md.ts      ← Generate CLAUDE.md from template
│   │   ├── constitution.ts   ← Generate constitution.md
│   │   └── repo-identity.ts  ← Generate REPO_IDENTITY.md
│   └── api/
│       └── mcp-client.ts     ← HTTP client (registration + inbox)
├── templates/
│   ├── CLAUDE.md.hbs
│   ├── constitution.md.hbs
│   └── REPO_IDENTITY.md.hbs
└── package.json
```

### 3.2 `lore-memory-mcp` Internal Structure

```
lore-memory-mcp/
├── src/
│   ├── index.ts              ← Server entry (Fastify + MCP)
│   ├── mcp/
│   │   ├── server.ts         ← MCP server registration
│   │   └── tools/
│   │       ├── query-lessons.ts
│   │       ├── search-similar.ts
│   │       ├── save-lesson.ts
│   │       ├── increment-occurrence.ts
│   │       ├── start-session.ts
│   │       ├── start-session-from-task.ts
│   │       ├── end-session.ts
│   │       ├── query-lessons-for-task.ts
│   │       ├── link-lessons-to-task.ts
│   │       ├── capture-review-finding.ts
│   │       ├── get-patterns.ts
│   │       ├── save-pattern.ts
│   │       ├── get-pending-propagations.ts
│   │       ├── accept-propagation.ts
│   │       └── reject-propagation.ts
│   ├── api/
│   │   ├── routes/
│   │   │   ├── projects.ts   ← REST: register, deregister, stats
│   │   │   └── health.ts     ← GET /health, GET /metrics
│   │   └── middleware/
│   │       └── auth.ts       ← API key → project_id + RLS setup
│   ├── db/
│   │   ├── client.ts         ← Drizzle ORM client + pool
│   │   ├── schema.ts         ← Drizzle schema definitions
│   │   └── migrations/
│   ├── services/
│   │   ├── embedding.ts      ← OpenAI embedding wrapper + retry
│   │   ├── relevance.ts      ← Relevance scoring function
│   │   ├── deduplication.ts  ← Semantic duplicate detection
│   │   └── propagation.ts    ← Cross-project propagation engine
│   └── utils/
│       ├── logger.ts
│       └── errors.ts
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## 4. Database Architecture

### 4.1 Entity Relationship Diagram

```
projects ──────────────────────────────────────────────┐
  │id (PK)                                             │
  │slug (UNIQUE)                                       │
  │name, api_key_hash                                  │
  │stack_tags[], config (JSONB)                        │
  │                                                    │
  ├──< repositories                                    │
  │     │id (PK), project_id (FK)                      │
  │     │slug, name, stack_tags[], boundaries[]        │
  │                                                    │
  ├──< lessons                                         │
  │     │id (PK), project_id (FK, nullable = global)   │
  │     │repo_id (FK, nullable)                        │
  │     │title, problem, root_cause, fix,              │
  │     │prevention_rule                               │
  │     │stack_tags[], category, severity              │
  │     │occurrence_count, hit_by_users[]              │
  │     │first_seen_at, last_seen_at                   │
  │     │embedding vector(1536), embedding_status      │
  │     │propagated_from (FK → lessons.id)             │
  │     │external_task_id, external_task_ref           │
  │     │external_tracker_type                         │
  │     │provenance (JSONB)                            │
  │     │                                              │
  │     └──< lesson_propagations                       │
  │           │source_lesson_id (FK)                   │
  │           │target_project_id (FK) ─────────────────┘
  │           │status, suggested_at, reviewed_at
  │
  ├──< patterns
  │     │id (PK), project_id (FK, nullable)
  │     │repo_id (FK, nullable)
  │     │stack_tags[], category
  │     │title, description, code_example
  │     │usage_count, last_used_at
  │     │embedding vector(1536)
  │     │external_task_id, external_task_ref,
  │     │external_tracker_type
  │
  └──< sessions
        │id (PK), project_id (FK)
        │repo_id (FK, nullable)
        │user_handle, branch, task_summary
        │decisions (JSONB)
        │lessons_consulted (UUID[])
        │lessons_applied (UUID[])
        │files_touched (TEXT[])
        │external_task_id, external_task_ref
        │external_tracker_type
        │bmad_skill, bmad_workflow
        │started_at, ended_at
```

### 4.2 Full DDL

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL,
  stack_tags    TEXT[] DEFAULT '{}',
  config        JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE repositories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  stack_tags    TEXT[] DEFAULT '{}',
  boundaries    TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)
);

CREATE TABLE sessions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_id               UUID REFERENCES repositories(id) ON DELETE SET NULL,
  user_handle           TEXT,
  branch                TEXT,
  task_summary          TEXT,
  decisions             JSONB DEFAULT '[]',
  lessons_consulted     UUID[] DEFAULT '{}',
  lessons_applied       UUID[] DEFAULT '{}',
  files_touched         TEXT[] DEFAULT '{}',
  external_task_id      TEXT,
  external_task_ref     TEXT,
  external_tracker_type TEXT
                        CHECK (external_tracker_type IN ('clickup','jira','asana')),
  bmad_skill            TEXT,
  bmad_workflow         TEXT,
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  ended_at              TIMESTAMPTZ
);

CREATE TABLE lessons (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID REFERENCES projects(id) ON DELETE CASCADE,
  repo_id               UUID REFERENCES repositories(id) ON DELETE SET NULL,
  stack_tags            TEXT[] DEFAULT '{}',
  category              TEXT,
  severity              TEXT DEFAULT 'medium'
                        CHECK (severity IN ('critical','high','medium','low')),
  title                 TEXT NOT NULL,
  problem               TEXT NOT NULL,
  root_cause            TEXT,
  fix                   TEXT NOT NULL,
  prevention_rule       TEXT NOT NULL,
  occurrence_count      INT DEFAULT 1,
  hit_by_users          TEXT[] DEFAULT '{}',
  captured_by_user      TEXT,
  first_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ DEFAULT NOW(),
  session_id            UUID REFERENCES sessions(id) ON DELETE SET NULL,
  propagated_from       UUID REFERENCES lessons(id) ON DELETE SET NULL,
  embedding             vector(1536),
  embedding_status      TEXT DEFAULT 'pending'
                        CHECK (embedding_status IN ('pending','complete','failed')),
  external_task_id      TEXT,
  external_task_ref     TEXT,
  external_tracker_type TEXT
                        CHECK (external_tracker_type IN ('clickup','jira','asana')),
  provenance            JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE patterns (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID REFERENCES projects(id) ON DELETE CASCADE,
  repo_id               UUID REFERENCES repositories(id) ON DELETE SET NULL,
  stack_tags            TEXT[] DEFAULT '{}',
  category              TEXT,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  code_example          TEXT,
  usage_count           INT DEFAULT 1,
  last_used_at          TIMESTAMPTZ DEFAULT NOW(),
  embedding             vector(1536),
  external_task_id      TEXT,
  external_task_ref     TEXT,
  external_tracker_type TEXT
                        CHECK (external_tracker_type IN ('clickup','jira','asana')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lesson_propagations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  target_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status            TEXT DEFAULT 'suggested'
                    CHECK (status IN ('suggested','accepted','rejected')),
  suggested_at      TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  UNIQUE(source_lesson_id, target_project_id)
);

-- ROW-LEVEL SECURITY
ALTER TABLE lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_propagations ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_isolation ON lessons
  USING (project_id = current_setting('app.current_project_id',true)::UUID
         OR project_id IS NULL);

CREATE POLICY project_isolation ON patterns
  USING (project_id = current_setting('app.current_project_id',true)::UUID
         OR project_id IS NULL);

CREATE POLICY project_isolation ON sessions
  USING (project_id = current_setting('app.current_project_id',true)::UUID);

CREATE POLICY project_isolation ON repositories
  USING (project_id = current_setting('app.current_project_id',true)::UUID);

CREATE POLICY project_isolation ON lesson_propagations
  USING (target_project_id = current_setting('app.current_project_id',true)::UUID);

-- INDEXES
CREATE INDEX idx_lessons_project       ON lessons(project_id);
CREATE INDEX idx_lessons_repo          ON lessons(repo_id);
CREATE INDEX idx_lessons_severity      ON lessons(severity);
CREATE INDEX idx_lessons_last_seen     ON lessons(last_seen_at DESC);
CREATE INDEX idx_lessons_stack         ON lessons USING GIN(stack_tags);
CREATE INDEX idx_lessons_external_task ON lessons(external_task_id)
  WHERE external_task_id IS NOT NULL;
CREATE INDEX idx_lessons_embedding     ON lessons
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_patterns_project      ON patterns(project_id);
CREATE INDEX idx_patterns_stack        ON patterns USING GIN(stack_tags);
CREATE INDEX idx_patterns_embedding    ON patterns
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_sessions_project       ON sessions(project_id);
CREATE INDEX idx_sessions_started       ON sessions(started_at DESC);
CREATE INDEX idx_sessions_external_task ON sessions(external_task_id)
  WHERE external_task_id IS NOT NULL;

CREATE INDEX idx_propagations_target ON lesson_propagations(target_project_id);
CREATE INDEX idx_propagations_status ON lesson_propagations(status)
  WHERE status = 'suggested';
```

---

## 5. Data Flow Diagrams

### 5.1 BMAD-Driven Task Flow (replaces old Bootstrap flow)

```
Developer invokes BMAD skill on a tracker task
e.g.: "work on task-1234" → clickup-dev-implement
       │
       ▼
clickup-dev-implement step-01 (parse task ID)
       │
       ▼
Lore: start_session_from_task({
        external_task_id: "task-1234",
        external_tracker_type: "clickup",
        branch: "feature/abc",
        bmad_skill: "clickup-dev-implement"
      })
  → Lore checks for existing session
  → Returns session_id + (resumed | new)
  → If resumed: includes prior_session_summary
       │
       ▼
clickup-dev-implement step-02 (fetch task from ClickUp)
       │
       ▼
Lore: query_lessons_for_task({
        external_task_id: "task-1234",
        task_context: { title, description, parent_epic_id, stack_tags }
      })
  → semantic + tag-overlap + epic-scoped query
  → returns lessons + patterns ranked
       │
       ▼
clickup-dev-implement step-04 (implementation loop, code edits)
       │
       ▼
[During or at end of implementation:]
Lore: link_lessons_to_task({
        external_task_id: "task-1234",
        consulted: [...],
        applied: [...]
      })
       │
       ▼
clickup-dev-implement step-06 (status transition)
       │
       ▼
Lore: end_session({
        session_id: <id>,
        decisions: [...],
        files_touched: [...]
      })
```

### 5.2 Review-Driven Capture Flow

```
clickup-code-review skill invoked on a task in "in review" state
       │
       ▼
clickup-code-review step-02 (fetch task + git diff)
       │
       ▼
Lore: query_lessons_for_task → returns prior anti-patterns for context
       │
       ▼
clickup-code-review step-04 (run bmad-code-review workflow)
  → Adversarial review produces structured findings
       │
       ▼
For each finding with severity ≥ high:
       │
       ▼
Lore: capture_review_finding({
        external_task_id: "task-1234",
        external_tracker_type: "clickup",
        severity: "high",
        finding: {
          title, problem, root_cause, fix, prevention_rule,
          stack_tags, category, code_pointer
        },
        reviewer: <user>,
        workflow: "bmad-code-review"
      })
       │
       ▼
Lore embedding service generates vector
       │
       ▼
Semantic dedup check (cosine ≥ 0.90)
       │
   ┌───┴────────────────┐
   │                    │
   YES                  NO
   │                    │
   ▼                    ▼
increment_         INSERT new lesson
occurrence         with provenance:
on existing        {
lesson               source: "bmad-code-review",
                     trust_tier: "high",
                     task_id: "task-1234",
                     reviewer: "<user>",
                     captured_at: "..."
                   }
                          │
                          ▼
                    Queue for propagation engine
                    (next hourly run)
```

### 5.3 Cross-Project Propagation Flow

```
Propagation engine (hourly background job)
       │
       ▼
Find proven lessons:
  WHERE occurrence_count >= 2
    AND severity IN ('critical', 'high')
       │
       ▼
For each lesson:
  Find projects where:
    project_id != source_project
    AND stack_tags && lesson.stack_tags
    AND no existing propagation suggestion
       │
       ▼
INSERT lesson_propagations (status: suggested)
       │
       ▼
Surfaces in target project via:
  • lore inbox (CLI command for the project lead)
  • get_pending_propagations (MCP tool for AI agents)
       │
       ▼
Project lead accepts → lesson copied to target
                       (occurrence_count reset to 1,
                        propagated_from set)
          rejects   → suggestion marked rejected
```

---

## 6. Deployment Architecture

### 6.1 Docker Compose

```yaml
version: "3.9"

services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: lore_memory
      POSTGRES_USER: lore
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/001-init.sql
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "lore"]
      interval: 10s
      timeout: 5s
      retries: 5

  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://lore:${POSTGRES_PASSWORD}@postgres:5432/lore_memory
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      MCP_SERVER_PORT: 3100
      PROPAGATION_ENABLED: "true"
      PROPAGATION_INTERVAL_MS: "3600000"
      LOG_LEVEL: info
    ports:
      - "3100:3100"
    depends_on:
      postgres:
        condition: service_healthy

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/certs:/etc/nginx/certs
    ports:
      - "443:443"
    depends_on:
      - mcp-server

volumes:
  postgres_data:
    driver: local
```

### 6.2 Nginx TLS Configuration

```nginx
server {
    listen 443 ssl;
    server_name your-lore-server.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://mcp-server:3100;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 30s;
    }
}
```

### 6.3 Server Sizing Guide

| Scale | Projects | Daily Sessions | Recommended Spec |
|-------|----------|---------------|-----------------|
| Small | 1–5 | < 50 | 2 vCPU, 4GB RAM, 50GB SSD |
| Medium | 5–20 | < 500 | 4 vCPU, 8GB RAM, 100GB SSD |
| Large | 20–50 | < 2000 | 8 vCPU, 16GB RAM, 500GB SSD |

**Memory estimation for vectors:**
- 100k lessons × 1536 dimensions × 4 bytes ≈ 600MB RAM
- IVFFlat index overhead: ~20% additional

---

## 7. Security Architecture

### 7.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Project A reads Project B's data | RLS at DB level, not application level |
| API key theft | Hashed storage (bcrypt cost 12), rotate via admin API |
| SQL injection | Parameterized queries only (Drizzle ORM) |
| Code leakage to OpenAI | Only natural language metadata embedded; never source code |
| MCP server compromise | Minimal DB user permissions |
| Brute force on API keys | bcrypt hashing, rate limiting on auth |
| Falsified `provenance` data | `provenance` is server-stamped (not caller-supplied) for all `capture_review_finding` calls; manual `save_lesson` provenance is `{ source: "manual", captured_by: <user_handle> }` |

### 7.2 DB User Permissions

```sql
CREATE USER lore_app WITH PASSWORD '...';
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO lore_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lore_app;
-- No DROP, TRUNCATE, or schema modification permissions
```

### 7.3 API Key Format

```
lore_{project_slug}_{random_24_chars}
Example: lore_buildclear_k8mN2xP9qR7vL5wJ3hF6tY
```

Plain text key shown once at registration. bcrypt hash (cost 12) stored
in DB.

---

## 8. Observability

### 8.1 Structured Logging (All MCP Calls)

```json
{
  "level": "info",
  "tool": "query_lessons_for_task",
  "project_id": "uuid-redacted",
  "duration_ms": 285,
  "result_count": 7,
  "success": true,
  "timestamp": "2026-05-06T10:23:45Z"
}
```

### 8.2 Health Check Endpoint

```
GET /health

{
  "status": "healthy",
  "db": "connected",
  "db_lessons_count": 1247,
  "db_projects_count": 8,
  "openai": "reachable",
  "uptime_seconds": 86400
}
```

### 8.3 Monitoring Thresholds

| Metric | Alert Threshold |
|--------|----------------|
| DB connection pool utilization | > 80% |
| Embedding generation failure rate | > 5% |
| MCP tool response time P95 | > 1000ms |
| `query_lessons_for_task` P95 | > 800ms |
| Propagation job last run | > 2 hours ago |
| Postgres disk usage | > 80% of volume |

---

## 9. Build and Release Process

### 9.1 `lore-memory-mcp` Deployment

```bash
git pull origin main
docker compose build mcp-server
docker compose run mcp-server npm run db:migrate
docker compose up -d mcp-server
```

Postgres stays running during MCP server restart — zero downtime for DB.

### 9.2 `@lore/cli` Release

```bash
npm version patch|minor|major
npm publish --access public
```

---

## 10. Two-Component Summary

```
@lore/cli (npm global package)
  Purpose:  Developer-facing setup, init, install, update, inbox
  Nature:   Node.js CLI
  Consumed: Developers install globally once
  Updates:  npm publish → developers run npm update -g @lore/cli

lore-memory-mcp (Docker, self-hosted)
  Purpose:  Persistent memory server for all projects
  Nature:   Always-on HTTP server + PostgreSQL
  Consumed: Cursor MCP client (HTTP calls from every AI session)
            BMAD custom-skills (via convention)
  Updates:  git pull → docker compose up -d

Per-project config (lore.yaml + CLAUDE.md + constitution.md +
                    REPO_IDENTITY.md)
  Purpose:  Project identity, methodology + tracker declaration,
            and MCP wiring (the "ratification document")
  Nature:   Config files committed to project's primary repo
  Consumed: @lore/cli reads lore.yaml to configure everything
            BMAD reads tracker config to route work
            AI agents read CLAUDE.md / constitution.md
            on every session
  Updates:  lore update bumps lore.version field in lore.yaml
```
