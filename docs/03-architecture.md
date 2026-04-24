# Lore Platform — Architecture Document

Version: 1.0.0
Status: Draft
Date: March 2026

---

## 1. Architecture Overview

Lore Platform is a three-component distributed system designed around
a hub-and-spoke model. The memory server is the hub. Developer machines
and CI systems are spokes. Each spoke communicates with the hub exclusively
through the MCP protocol using project-scoped API keys.

### 1.1 Core Architectural Principles

1. **Separation of concerns:** Skills (behavior) and memory (data) are
   independent systems that never depend on each other's internals.

2. **Project isolation by default:** The database enforces isolation at
   the storage layer. Application code cannot accidentally leak data.

3. **Developer experience first:** Every architectural decision is evaluated
   against: "does this add friction for the developer?"

4. **No single point of failure for development:** If the memory server
   is down, development continues. Sessions start without memory context
   rather than blocking.

5. **Compounding value:** The architecture is designed to become more
   valuable over time as lessons accumulate, not degrade.

---

## 2. System Context Diagram

```
╔═══════════════════════════════════════════════════════════════════╗
║                         EXTERNAL SYSTEMS                          ║
║                                                                   ║
║  ┌─────────────┐    ┌──────────────┐    ┌────────────────────┐   ║
║  │  GitHub     │    │  OpenAI API  │    │  npm Registry      │   ║
║  │  (releases) │    │  (embeddings)│    │  (@lore/cli)      │   ║
║  └──────┬──────┘    └──────┬───────┘    └─────────┬──────────┘   ║
╚═════════│════════════════════│══════════════════════│═════════════╝
          │ download           │ embed                │ install
          ▼                    ▼                      ▼
╔═══════════════════════════════════════════════════════════════════╗
║                      DEVELOPER MACHINE                            ║
║                                                                   ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │  Cursor IDE                                                  │ ║
║  │  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐  │ ║
║  │  │  AI Agent    │  │  MCP Client    │  │  lore skills   │  │ ║
║  │  │  (Claude)    │←→│  (built-in)    │  │  (~/.lore/)    │  │ ║
║  │  └──────────────┘  └───────┬────────┘  └─────────────────┘  │ ║
║  └────────────────────────────│─────────────────────────────────┘ ║
║                               │ MCP/HTTP                          ║
║  ┌────────────────────────────│────────────────────────────────┐  ║
║  │  Local Tools               │                                 │  ║
║  │  ┌────────────────┐        │     ┌──────────────────────┐   │  ║
║  │  │ GitNexus MCP   │←───────┘     │  Project Repos        │   │  ║
║  │  │ (stdio, local) │              │  (.git/hooks active)  │   │  ║
║  │  └────────────────┘              └──────────────────────┘   │  ║
║  └────────────────────────────────────────────────────────────── ┘ ║
╚═══════════════════════════════════╦═══════════════════════════════╝
                                    ║ HTTPS
╔═══════════════════════════════════╩═══════════════════════════════╗
║                       SELF-HOSTED SERVER                          ║
║                                                                   ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │  lore-memory-mcp (Docker)                                   │ ║
║  │                                                              │ ║
║  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │ ║
║  │  │  MCP     │  │  Auth     │  │ Embedding│  │Propagation│  │ ║
║  │  │  Tools   │  │ Middleware│  │  Service │  │  Engine   │  │ ║
║  │  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │ ║
║  │       └──────────────┴──────────────┴──────────────┘         │ ║
║  └─────────────────────────────────────────────────────────────┘  ║
║                                                                   ║
║  ┌─────────────────────────────────────────────────────────────┐  ║
║  │  PostgreSQL 16 + pgvector                                    │  ║
║  │  projects  repositories  lessons  patterns  sessions          │  ║
║  │  preferences  lesson_propagations                             │  ║
║  │  Row-Level Security: project_id isolation                     │  ║
║  └─────────────────────────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 3. Component Architecture

### 3.1 @lore/cli Internal Structure

```
@lore/cli/
├── src/
│   ├── index.ts              ← CLI entry point (commander.js)
│   ├── commands/
│   │   ├── install.ts        ← lore install
│   │   ├── init.ts           ← lore init
│   │   ├── update.ts         ← lore update
│   │   └── project.ts        ← lore project:register|list
│   ├── core/
│   │   ├── config-finder.ts  ← lore.yaml discovery (walk up)
│   │   ├── config-parser.ts  ← lore.yaml validation + parsing
│   │   ├── registry.ts       ← Skill release registry client
│   │   ├── downloader.ts     ← Tarball download + extraction
│   │   ├── cursor-config.ts  ← Write ~/.cursor/mcp.json
│   │   ├── claude-config.ts  ← Write ~/.claude/CLAUDE.md
│   │   ├── git-hooks.ts      ← Install post-commit/post-merge
│   │   ├── gitnexus.ts       ← Run gitnexus analyze
│   │   └── state.ts          ← ~/.lore/install-state.json
│   ├── generators/
│   │   ├── lore-yaml.ts     ← Generate lore.yaml from prompts
│   │   ├── claude-md.ts      ← Generate CLAUDE.md from template
│   │   ├── constitution.ts   ← Generate constitution.md
│   │   └── repo-identity.ts  ← Generate REPO_IDENTITY.md
│   └── api/
│       └── mcp-client.ts     ← HTTP client for project registration
├── templates/
│   ├── CLAUDE.md.hbs
│   ├── constitution.md.hbs
│   └── REPO_IDENTITY.md.hbs
└── package.json
```

### 3.2 lore-memory-mcp Internal Structure

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
│   │       ├── get-session-handoff.ts
│   │       ├── start-session.ts
│   │       ├── end-session.ts
│   │       ├── get-patterns.ts
│   │       ├── save-pattern.ts
│   │       ├── suggest-propagations.ts
│   │       ├── accept-propagation.ts
│   │       └── update-preferences.ts
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
  │name                                                │
  │api_key_hash                                        │
  │stack_tags[]                                        │
  │config (JSONB)                                      │
  │                                                    │
  ├──< repositories                                    │
  │     │id (PK)                                       │
  │     │project_id (FK)                               │
  │     │slug, name                                    │
  │     │stack_tags[], boundaries[]                    │
  │                                                    │
  ├──< lessons                                         │
  │     │id (PK)                                       │
  │     │project_id (FK, nullable = global)            │
  │     │repo_id (FK, nullable)                        │
  │     │stack_tags[], category, severity              │
  │     │title, problem, root_cause                    │
  │     │fix, prevention_rule                          │
  │     │occurrence_count                              │
  │     │hit_by_users[], captured_by_user              │
  │     │first_seen_at, last_seen_at                   │
  │     │embedding vector(1536)                        │
  │     │embedding_status                              │
  │     │propagated_from (FK → lessons.id)             │
  │     │                                              │
  │     └──< lesson_propagations                       │
  │           │source_lesson_id (FK)                   │
  │           │target_project_id (FK) ─────────────────┘
  │           │status (suggested|accepted|rejected)
  │           │suggested_at, reviewed_at
  │
  ├──< patterns
  │     │id (PK)
  │     │project_id (FK, nullable)
  │     │repo_id (FK, nullable)
  │     │stack_tags[], category
  │     │title, description, code_example
  │     │usage_count, last_used_at
  │     │embedding vector(1536)
  │
  ├──< sessions
  │     │id (PK)
  │     │project_id (FK)
  │     │repo_id (FK, nullable)
  │     │user_handle, branch, task_summary
  │     │decisions (JSONB[])
  │     │errors_hit (UUID[])
  │     │files_touched (TEXT[])
  │     │started_at, ended_at
  │
  └──< preferences
        │id (PK)
        │project_id (FK)
        │user_handle (UNIQUE with project_id)
        │prefs (JSONB)
        │updated_at
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
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_id         UUID REFERENCES repositories(id) ON DELETE SET NULL,
  user_handle     TEXT,
  branch          TEXT,
  task_summary    TEXT,
  decisions       JSONB DEFAULT '[]',
  errors_hit      UUID[] DEFAULT '{}',
  files_touched   TEXT[] DEFAULT '{}',
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

CREATE TABLE lessons (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  repo_id           UUID REFERENCES repositories(id) ON DELETE SET NULL,
  stack_tags        TEXT[] DEFAULT '{}',
  category          TEXT,
  severity          TEXT DEFAULT 'medium'
                    CHECK (severity IN ('critical','high','medium','low')),
  title             TEXT NOT NULL,
  problem           TEXT NOT NULL,
  root_cause        TEXT,
  fix               TEXT NOT NULL,
  prevention_rule   TEXT NOT NULL,
  occurrence_count  INT DEFAULT 1,
  hit_by_users      TEXT[] DEFAULT '{}',
  captured_by_user  TEXT,
  first_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  session_id        UUID REFERENCES sessions(id) ON DELETE SET NULL,
  propagated_from   UUID REFERENCES lessons(id) ON DELETE SET NULL,
  embedding         vector(1536),
  embedding_status  TEXT DEFAULT 'pending'
                    CHECK (embedding_status IN ('pending','complete','failed')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE patterns (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  repo_id       UUID REFERENCES repositories(id) ON DELETE SET NULL,
  stack_tags    TEXT[] DEFAULT '{}',
  category      TEXT,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  code_example  TEXT,
  usage_count   INT DEFAULT 1,
  last_used_at  TIMESTAMPTZ DEFAULT NOW(),
  embedding     vector(1536),
  created_at    TIMESTAMPTZ DEFAULT NOW()
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

CREATE TABLE preferences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_handle TEXT NOT NULL,
  prefs       JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_handle)
);

-- ROW-LEVEL SECURITY
ALTER TABLE lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences         ENABLE ROW LEVEL SECURITY;
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

CREATE POLICY project_isolation ON preferences
  USING (project_id = current_setting('app.current_project_id',true)::UUID);

CREATE POLICY project_isolation ON lesson_propagations
  USING (target_project_id = current_setting('app.current_project_id',true)::UUID);

-- INDEXES
CREATE INDEX idx_lessons_project    ON lessons(project_id);
CREATE INDEX idx_lessons_repo       ON lessons(repo_id);
CREATE INDEX idx_lessons_severity   ON lessons(severity);
CREATE INDEX idx_lessons_last_seen  ON lessons(last_seen_at DESC);
CREATE INDEX idx_lessons_stack      ON lessons USING GIN(stack_tags);
CREATE INDEX idx_lessons_embedding  ON lessons
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_patterns_project   ON patterns(project_id);
CREATE INDEX idx_patterns_stack     ON patterns USING GIN(stack_tags);
CREATE INDEX idx_patterns_embedding ON patterns
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_sessions_project   ON sessions(project_id);
CREATE INDEX idx_sessions_started   ON sessions(started_at DESC);

CREATE INDEX idx_propagations_target ON lesson_propagations(target_project_id);
CREATE INDEX idx_propagations_status ON lesson_propagations(status)
  WHERE status = 'suggested';
```

---

## 5. Data Flow Diagrams

### 5.1 Session Bootstrap Flow

```
Developer types /bootstrap
       │
       ▼
Bootstrap skill reads lore.yaml
  → project: my-project
  → repo: backend
  → stack: [nestjs, typeorm, postgres]
  → mcp_server: https://your-server
       │
       ▼
Parallel MCP calls (single response):
  ┌──────────────┬──────────────┬──────────────┬──────────────┐
  │query_lessons │search_similar│ get_handoff  │suggest_props │
  │(stack filter)│(task text)   │(last session)│(cross-proj)  │
  └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
         │              │              │              │
  ┌──────┴───────┬───────┴───────┐     │              │
  │GitNexus ctx  │GitNexus changes│    │              │
  │(repo stats)  │(staged diff)   │    │              │
  └──────┬───────┴───────┬────────┘    │              │
         │               │             │              │
         └───────────────┴─────────────┴──────────────┘
                                 │
                                 ▼
                      Compile session report
                                 │
                                 ▼
                       Display to developer
                                 │
                                 ▼
                       start_session() called
```

### 5.2 Auto-Capture Flow

```
Agent encounters error
       │
       ▼
Lesson skill checks session error tracker
  → First occurrence → record, count = 1
  → Second occurrence → threshold reached
       │
       ▼
search_similar(error_message)
       │
  ┌────┴─────────────────┐
  │ Similarity > 90%?    │
  │                      │
  YES                    NO
  │                      │
  ▼                      ▼
increment_           save_lesson()
occurrence()           → embed via OpenAI
  → count++             → store in DB
  → add to              → queue propagation
    hit_by_users[]
```

### 5.3 Cross-Project Propagation Flow

```
Propagation engine (hourly)
       │
       ▼
Find proven lessons
  (occurrence >= 2, severity high/critical)
       │
       ▼
For each lesson:
  Find projects with overlapping stack_tags
  Exclude: source project + already-suggested
  INSERT lesson_propagations (status: suggested)
       │
       ▼
Next /bootstrap in target project:
  suggest_propagations() → returns pending
       │
       ▼
Developer sees: "Lesson from similar project:
  [title] — [N] occurrences. Accept? [Yes/No]"
       │
  ┌────┴────┐
  YES       NO
  │         │
  ▼         ▼
Copy lesson  status → rejected
to project
status → accepted
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
| Small | 1-5 | < 50 | 2 vCPU, 4GB RAM, 50GB SSD |
| Medium | 5-20 | < 500 | 4 vCPU, 8GB RAM, 100GB SSD |
| Large | 20-50 | < 2000 | 8 vCPU, 16GB RAM, 500GB SSD |

**Memory estimation for vectors:**
- 100k lessons × 1536 dimensions × 4 bytes ≈ 600MB RAM
- IVFFlat index overhead: ~20% additional

---

## 7. Security Architecture

### 7.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Project A reads Project B's data | RLS at DB level, not application level |
| API key theft | Hashed storage (bcrypt), rotate via admin API |
| SQL injection | Parameterized queries only (Drizzle ORM) |
| Code leakage to OpenAI | Only natural language metadata embedded, never source code |
| MCP server compromise | Minimal DB user permissions |
| Brute force on API keys | bcrypt hashing, rate limiting on auth |

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

Plain text key shown once at registration. bcrypt hash (cost 12) stored in DB.

---

## 8. Observability

### 8.1 Structured Logging (All MCP Calls)

```json
{
  "level": "info",
  "tool": "query_lessons",
  "project_id": "uuid-redacted",
  "duration_ms": 45,
  "result_count": 5,
  "success": true,
  "timestamp": "2026-03-17T10:23:45Z"
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
| Propagation job last run | > 2 hours ago |
| Postgres disk usage | > 80% of volume |

---

## 9. Build and Release Process

### 9.1 lore-platform Release (GitHub Actions)

```bash
git tag v1.4.0 && git push origin v1.4.0

# GitHub Action:
# 1. tar -czf skills.tar.gz skills/
# 2. Update registry.json with new version metadata
# 3. Create GitHub Release with tarball attached
```

### 9.2 lore-memory-mcp Deployment

```bash
git pull origin main
docker compose build mcp-server
docker compose run mcp-server npm run db:migrate
docker compose up -d mcp-server
```

Postgres stays running during MCP server restart — zero downtime for DB.

### 9.3 @lore/cli Release

```bash
npm version patch|minor|major
npm publish --access public
```

---

## 10. Three-Component Summary

```
lore-platform (GitHub releases)
  Purpose:  AI agent behavior instructions (skills)
  Nature:   Static markdown files
  Consumed: Downloaded by @lore/cli to ~/.lore/skills/
  Updates:  Git tag → GitHub Release → CLI downloads on lore update

@lore/cli (npm global package)
  Purpose:  Developer-facing setup and management tool
  Nature:   Node.js CLI
  Consumed: Developers install globally once
  Updates:  npm publish → developers run npm update -g @lore/cli

lore-memory-mcp (Docker, self-hosted)
  Purpose:  Persistent memory server for all projects
  Nature:   Always-on HTTP server + PostgreSQL
  Consumed: Cursor MCP client (HTTP calls from every AI session)
  Updates:  git pull → docker compose up -d

Per-project config (lore.yaml + CLAUDE.md)
  Purpose:  Project identity and skill/MCP wiring
  Nature:   Config files committed to project config repo
  Consumed: @lore/cli reads lore.yaml to configure everything
  Updates:  lore update bumps version field in lore.yaml
```
