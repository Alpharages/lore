# Lore Platform — Technical Specification

Version: 1.0.0
Status: Draft
Date: March 2026

---

## 1. System Overview

Lore Platform consists of three independently deployable components:

| Component | Type | Language | Deployment |
|-----------|------|----------|------------|
| @lore/cli | npm package | TypeScript/Node.js | Developer machine (global) |
| lore-platform | GitHub releases | Markdown + YAML | Static files, downloaded by CLI |
| lore-memory-mcp | HTTP server | TypeScript/Node.js | Docker, self-hosted |

---

## 2. @lore/cli Specification

### 2.1 Installation

```
npm install -g @lore/cli
```

Minimum Node.js version: 18.0.0

### 2.2 Commands

#### `lore install`

Reads `lore.yaml` (walks directory tree upward from CWD), then:

1. Downloads skills tarball from release registry
2. Extracts to `~/.lore/skills/<version>/`
3. Writes Cursor MCP config to `~/.cursor/mcp.json`
4. Writes CLAUDE.md include to `~/.claude/CLAUDE.md`
5. For each repo in `lore.yaml`:
   a. Runs `npx gitnexus analyze` (full index, first time)
   b. Writes `post-commit` hook to `<repo>/.git/hooks/`
   c. Writes `post-merge` hook to `<repo>/.git/hooks/`
   d. Makes hooks executable (chmod 755)

**lore.yaml search algorithm:**
```
current_dir = process.cwd()
while (current_dir !== '/') {
  if (exists(current_dir + '/lore.yaml')) return current_dir + '/lore.yaml'
  current_dir = parent(current_dir)
}
throw new Error('lore.yaml not found')
```

**Idempotency:** CLI checks `~/.lore/install-state.json` before each step.
Steps already completed are skipped. State is updated after each step.

#### `lore init`

Interactive project initialization:

```
Prompts:
  1. Project name (string)
  2. Project slug (string, auto-derived from name, user can override)
  3. Repos (comma-separated list of repo names)
  4. For each repo: relative path and tech stack (multi-select)
  5. MCP server URL (string, default: http://localhost:3100)
  6. Skill version (string, default: latest)

Actions:
  1. Generate lore.yaml
  2. Generate CLAUDE.md from template
  3. Generate ops/constitution.md from template
  4. For each repo: generate repos/<slug>/REPO_IDENTITY.md
  5. POST /api/projects/register to MCP server
  6. Display returned API key with storage instructions
```

Generated `lore.yaml` structure:

```yaml
lore:
  version: "1.3.0"

project:
  name: "My Project"
  slug: "my-project"

mcp:
  server: "http://your-server:3100"

skills:
  core:
    - bootstrap
    - judge
    - pr
    - lesson
    - memory
    - status
  stacks:
    - nestjs-postgres
    - react-vite

repos:
  - slug: backend
    name: Backend API
    path: ../my-project-backend
    stack:
      - nestjs
      - typeorm
      - postgres
  - slug: frontend
    name: Frontend
    path: ../my-project-frontend
    stack:
      - react
      - vite
      - typescript
```

#### `lore update`

1. Fetch latest version metadata from release registry
2. Compare to current version in `lore.yaml`
3. If newer version available:
   a. Display changelog diff
   b. If major version bump: warn and require explicit confirmation
   c. Download new skills tarball
   d. Extract to `~/.lore/skills/<new-version>/`
   e. Update `~/.lore/config.yaml` active version
   f. Update version in `lore.yaml`

#### `lore project:register`

Standalone project registration (also called internally by `lore init`):

```
POST /api/projects/register
Content-Type: application/json

{
  "name": "My Project",
  "slug": "my-project",
  "stack_tags": ["nestjs", "react", "postgres"],
  "repos": [
    { "slug": "backend", "stack_tags": ["nestjs", "typeorm"] },
    { "slug": "frontend", "stack_tags": ["react", "vite"] }
  ]
}

Response:
{
  "project_id": "uuid",
  "api_key": "lore_myproject_xxxx",
  "message": "Project registered. Store API key securely."
}
```

### 2.3 Git Hook Templates

**post-commit:**
```bash
#!/bin/sh
# Auto-installed by @lore/cli
# Re-indexes changed files after commit (background, silent)
if command -v npx > /dev/null 2>&1; then
  npx gitnexus analyze --incremental --quiet > /dev/null 2>&1 &
fi
```

**post-merge:**
```bash
#!/bin/sh
# Auto-installed by @lore/cli
# Re-indexes after pull/merge (background, silent)
if command -v npx > /dev/null 2>&1; then
  npx gitnexus analyze --incremental --quiet > /dev/null 2>&1 &
fi
```

### 2.4 Cursor MCP Config Written by CLI

File: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "lore-memory": {
      "url": "${MCP_SERVER_URL}/mcp",
      "headers": {
        "Authorization": "Bearer ${LORE_API_KEY}"
      }
    },
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

`MCP_SERVER_URL` is read from `lore.yaml`. `LORE_API_KEY` is read from
environment variable at runtime by Cursor.

### 2.5 Release Registry API

The CLI fetches skill releases from:

```
GET https://github.com/<org>/lore-platform/releases/download/v<version>/skills.tar.gz
```

Version metadata:
```
GET https://raw.githubusercontent.com/<org>/lore-platform/main/registry.json
```

`registry.json` structure:
```json
{
  "latest": "1.3.0",
  "versions": {
    "1.3.0": {
      "released": "2026-03-01",
      "breaking": false,
      "changelog": "https://..."
    },
    "1.2.0": {}
  }
}
```

---

## 3. lore-platform Skills Specification

### 3.1 Directory Structure (Release Tarball)

```
skills/
├── core/
│   ├── bootstrap/SKILL.md
│   ├── judge/SKILL.md
│   ├── pr/SKILL.md
│   ├── lesson/SKILL.md
│   ├── memory/SKILL.md
│   └── status/SKILL.md
├── stacks/
│   ├── nestjs-postgres/SKILL.md
│   ├── react-vite/SKILL.md
│   ├── python-fastapi/SKILL.md
│   ├── aws-lambda/SKILL.md
│   └── django-postgres/SKILL.md
└── registry.json
```

### 3.2 Skill File Format

Each SKILL.md follows this structure:

```markdown
---
name: bootstrap
version: 1.3.0
description: Initialize a Lore session with full context loading
user-invocable: true
triggers:
  - /bootstrap
  - /bc-init
depends-on:
  mcp:
    - lore-memory
    - gitnexus
---

# [Skill Name]

[Instructions for the AI agent...]
```

### 3.3 Bootstrap Skill — MCP Call Sequence

Phase 1 — All parallel (single response, independent calls):

```
Batch 1 (always):
  mcp__lore-memory__query_lessons({
    stack_tags: <from lore.yaml for current repo>,
    limit: 5,
    min_severity: "medium"
  })

  mcp__lore-memory__get_session_handoff({})

  mcp__lore-memory__get_patterns({
    stack_tags: <from lore.yaml>,
    limit: 3
  })

  mcp__lore-memory__suggest_propagations({})

  mcp__gitnexus__context({
    repo: <current repo slug>
  })

  mcp__gitnexus__detect_changes({
    scope: "staged"
  })

Batch 2 (if user provides task description):
  mcp__lore-memory__search_similar({
    text: <user task description>,
    limit: 3
  })

  mcp__gitnexus__query({
    query: <user task description>
  })
```

---

## 4. lore-memory-mcp Server Specification

### 4.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| HTTP Framework | Fastify | 4.x |
| MCP SDK | @modelcontextprotocol/sdk | latest |
| ORM | Drizzle ORM | latest |
| Database | PostgreSQL | 16 |
| Vector extension | pgvector | 0.7.x |
| Embeddings | OpenAI API | text-embedding-3-small |
| Containerization | Docker + Docker Compose | latest |
| Schema migration | Drizzle Kit | latest |

### 4.2 Environment Variables

```env
# Required
DATABASE_URL=postgres://lore:password@postgres:5432/lore_memory
OPENAI_API_KEY=sk-...
MCP_SERVER_PORT=3100

# Optional
PROPAGATION_ENABLED=true
PROPAGATION_INTERVAL_MS=3600000
LOG_LEVEL=info
MAX_EMBEDDING_BATCH_SIZE=100
SIMILARITY_THRESHOLD=0.90
```

### 4.3 MCP Tools — Full Specification

#### `query_lessons`

```typescript
Input: {
  stack_tags?: string[]       // filter by tech stack
  category?: string           // "auth" | "database" | "ci-cd" | "deployment" | ...
  min_severity?: string       // "critical" | "high" | "medium" | "low"
  last_n_days?: number        // recency filter
  repo_slug?: string          // scope to specific repo
  limit?: number              // default: 5, max: 20
  include_global?: boolean    // include global lessons, default: true
}

Output: {
  lessons: Array<{
    id: string
    title: string
    problem: string
    fix: string
    prevention_rule: string
    severity: string
    stack_tags: string[]
    occurrence_count: number
    last_seen_at: string
    captured_by_user: string
    relevance_score: number
    scope: "global" | "project" | "repo"
  }>
  total_count: number
  query_ms: number
}
```

#### `search_similar`

```typescript
Input: {
  text: string                // natural language query
  limit?: number              // default: 3, max: 10
  threshold?: number          // cosine similarity threshold, default: 0.70
  include_patterns?: boolean  // also search patterns, default: true
}

Output: {
  results: Array<{
    type: "lesson" | "pattern"
    id: string
    title: string
    prevention_rule: string
    similarity_score: number
    severity?: string
  }>
  query_ms: number
}

Implementation:
  1. Generate embedding for input text via OpenAI
  2. Query: SELECT *, 1 - (embedding <=> $query_embedding) as similarity
             FROM lessons
             WHERE 1 - (embedding <=> $query_embedding) > $threshold
             ORDER BY similarity DESC
             LIMIT $limit
```

#### `save_lesson`

```typescript
Input: {
  title: string
  problem: string
  fix: string
  prevention_rule: string
  stack_tags: string[]
  category: string
  severity: "critical" | "high" | "medium" | "low"
  root_cause?: string
  repo_slug?: string
  session_id?: string
  captured_by_user?: string   // from LORE_USER env var
}

Processing:
  1. Generate embedding for: title + problem + fix + prevention_rule
  2. Check for semantic duplicates:
     SELECT id FROM lessons
     WHERE project_id = $project_id
       AND 1 - (embedding <=> $new_embedding) > 0.90
     LIMIT 1
  3. If duplicate found: call increment_occurrence(existing_id)
     return { action: "incremented", lesson_id: existing_id }
  4. If no duplicate: INSERT new lesson
     return { action: "created", lesson_id: new_id }

Output: {
  action: "created" | "incremented"
  lesson_id: string
}
```

#### `increment_occurrence`

```typescript
Input: {
  lesson_id: string
  user_handle?: string
}

Processing:
  UPDATE lessons
  SET occurrence_count = occurrence_count + 1,
      last_seen_at = NOW(),
      hit_by_users = array_append(hit_by_users, $user_handle)
  WHERE id = $lesson_id

Output: {
  lesson_id: string
  new_count: number
}
```

#### `get_session_handoff`

```typescript
Input: {
  repo_slug?: string
}

Processing:
  SELECT * FROM sessions
  WHERE project_id = $project_id
    AND ($repo_slug IS NULL OR repo_slug = $repo_slug)
  ORDER BY started_at DESC
  LIMIT 1

Output: {
  found: boolean
  session?: {
    id: string
    branch: string
    task_summary: string
    decisions: object[]
    errors_hit: string[]
    files_touched: string[]
    started_at: string
    ended_at: string
    duration_minutes: number
  }
}
```

#### `start_session`

```typescript
Input: {
  repo_slug?: string
  branch: string
  task_summary: string
  user_handle?: string
}

Output: {
  session_id: string
  started_at: string
}
```

#### `end_session`

```typescript
Input: {
  session_id: string
  decisions?: Array<{ what: string, why: string }>
  errors_hit?: string[]           // lesson IDs encountered
  files_touched?: string[]
}

Output: {
  session_id: string
  duration_minutes: number
}
```

#### `get_patterns`

```typescript
Input: {
  stack_tags?: string[]
  category?: string
  limit?: number              // default: 5
}

Output: {
  patterns: Array<{
    id: string
    title: string
    description: string
    code_example?: string
    stack_tags: string[]
    usage_count: number
  }>
}
```

#### `save_pattern`

```typescript
Input: {
  title: string
  description: string
  code_example?: string
  stack_tags: string[]
  category: string
  repo_slug?: string
}

Output: {
  pattern_id: string
}
```

#### `suggest_propagations`

```typescript
Input: {}   // project identified by API key

Output: {
  suggestions: Array<{
    propagation_id: string
    lesson_title: string
    lesson_problem: string
    lesson_prevention_rule: string
    lesson_severity: string
    source_stack_tags: string[]
    suggested_at: string
  }>
  count: number
}
```

#### `accept_propagation`

```typescript
Input: {
  propagation_id: string
}

Processing:
  1. Fetch source lesson
  2. Copy to target project with project_id = current project
  3. Add reference: propagated_from = source_lesson_id
  4. Generate new embedding for target project context
  5. Update propagation status to "accepted"

Output: {
  new_lesson_id: string
  action: "accepted"
}
```

#### `reject_propagation`

```typescript
Input: {
  propagation_id: string
}

Output: {
  action: "rejected"
}
```

#### `update_preferences`

```typescript
Input: {
  user_handle: string
  preferences: {
    preferred_language?: string
    verbosity?: "concise" | "normal" | "detailed"
    auto_capture?: boolean
    [key: string]: any
  }
}

Output: {
  updated: true
}
```

### 4.4 REST API Endpoints (Non-MCP)

These are administrative endpoints not exposed via MCP:

```
POST   /api/projects/register     Register new project, get API key
DELETE /api/projects/:slug        Deregister project
GET    /api/projects/:slug/stats  Memory stats for project
GET    /health                    Server health check
GET    /metrics                   Prometheus metrics
```

### 4.5 Authentication Flow

Every MCP request:

```
1. Extract Bearer token from Authorization header
2. Hash token with bcrypt
3. SELECT project_id FROM projects WHERE api_key_hash = $hash
4. If not found: return 401
5. Open DB connection
6. SET LOCAL app.current_project_id = $project_id
7. RLS activates for this transaction
8. Execute tool logic
9. Return result
10. Release connection to pool
```

### 4.6 Relevance Scoring Algorithm

```typescript
function scoreLesson(lesson: Lesson, context: QueryContext): number {
  // Recency: decay from 1.0 to 0.0 over 180 days
  const ageDays = (Date.now() - lesson.last_seen_at) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / 180);

  // Frequency: 10+ occurrences = max score
  const frequency = Math.min(1, lesson.occurrence_count / 10);

  // Stack overlap: fraction of lesson's tags present in context
  const overlap = intersection(lesson.stack_tags, context.stack_tags);
  const stackMatch = lesson.stack_tags.length > 0
    ? overlap.length / lesson.stack_tags.length
    : 0;

  // Severity weights
  const severityWeight = {
    critical: 1.0, high: 0.8, medium: 0.5, low: 0.2
  }[lesson.severity] ?? 0.5;

  // Semantic similarity (from pgvector query, 0-1)
  const semantic = context.semanticScore ?? 0.5;

  return (
    severityWeight * 0.30 +
    recency        * 0.25 +
    semantic       * 0.25 +
    frequency      * 0.10 +
    stackMatch     * 0.10
  );
}
```

### 4.7 Cross-Project Propagation Engine

```typescript
// Runs every PROPAGATION_INTERVAL_MS (default: 1 hour)
async function runPropagation(db: Database): Promise<void> {
  // Find proven lessons (2+ occurrences, high/critical severity)
  const provenLessons = await db.query(`
    SELECT l.id, l.stack_tags, l.project_id, l.title
    FROM lessons l
    WHERE l.occurrence_count >= 2
      AND l.severity IN ('critical', 'high')
      AND l.project_id IS NOT NULL
  `);

  for (const lesson of provenLessons) {
    // Find other projects with overlapping stack (at least 1 common tag)
    const candidates = await db.query(`
      SELECT p.id
      FROM projects p
      WHERE p.id != $1
        AND p.stack_tags && $2
        AND p.id NOT IN (
          SELECT target_project_id FROM lesson_propagations
          WHERE source_lesson_id = $3
        )
    `, [lesson.project_id, lesson.stack_tags, lesson.id]);

    if (candidates.length === 0) continue;

    await db.query(`
      INSERT INTO lesson_propagations
        (source_lesson_id, target_project_id, status)
      SELECT $1, unnest($2::uuid[]), 'suggested'
      ON CONFLICT (source_lesson_id, target_project_id) DO NOTHING
    `, [lesson.id, candidates.map((c: { id: string }) => c.id)]);
  }
}
```

---

## 5. Database Specification

### 5.1 pgvector Index Configuration

For <= 100,000 vectors (startup/small team):
```sql
CREATE INDEX idx_lessons_embedding ON lessons
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

For > 100,000 vectors:
```sql
CREATE INDEX idx_lessons_embedding ON lessons
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

HNSW has better query performance but higher build time and memory usage.

### 5.2 RLS Policy Template

```sql
CREATE POLICY project_isolation ON {table}
  USING (
    project_id = current_setting('app.current_project_id', true)::UUID
    OR project_id IS NULL
  );

-- Tables with RLS enabled:
-- lessons, patterns, sessions, repositories,
-- preferences, lesson_propagations
```

---

## 6. Embedding Strategy

### 6.1 What Gets Embedded

| Record Type | Embedded Text |
|-------------|---------------|
| Lesson | title + " " + problem + " " + fix + " " + prevention_rule |
| Pattern | title + " " + description + " " + (code_example ?? "") |

### 6.2 Embedding Model

- Model: `text-embedding-3-small`
- Dimensions: 1536
- Cost: ~$0.00002 per lesson (negligible)
- Max input tokens: 8191

### 6.3 Embedding Implementation

```typescript
async function embedLesson(lesson: LessonInput): Promise<number[]> {
  const text = [
    lesson.title,
    lesson.problem,
    lesson.fix,
    lesson.prevention_rule
  ].filter(Boolean).join(' ');

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });

  return response.data[0].embedding;
}
```

---

## 7. Error Handling

### 7.1 MCP Tool Errors

All tools return structured errors:
```typescript
{
  error: true,
  code: "LESSON_NOT_FOUND" | "INVALID_PROJECT" | "EMBEDDING_FAILED" | ...,
  message: string,
  retryable: boolean
}
```

### 7.2 OpenAI Embedding Failures

If embedding generation fails:
- Log error with lesson_id
- Store lesson WITHOUT embedding
- Mark `embedding_status: 'pending'`
- Background job retries failed embeddings every 5 minutes

### 7.3 Database Connection Failures

- Connection pool size: 10
- Connection timeout: 5 seconds
- Query timeout: 10 seconds
- On failure: return 503 with `retryable: true`

---

## 8. Team Memory Model

### 8.1 Shared vs. Private Data

| Data | Shared (team) | Private (individual) |
|------|---------------|----------------------|
| Lessons learned | Yes | — |
| Code patterns | Yes | — |
| Prevention rules | Yes | — |
| Sessions | — | Yes — your session handoff |
| Preferences | — | Yes — your personal settings |

### 8.2 User Handle

Each developer sets once in their local environment:

```bash
export LORE_USER=alice
export LORE_API_KEY=lore_bc_xxxx    # same for whole team
```

### 8.3 Deduplication via Semantic Similarity

When two developers hit the same bug simultaneously:

1. Developer A saves lesson → `embedding` generated, stored
2. Developer B's `save_lesson` runs:
   - Semantic similarity check against existing lessons
   - If match > 90%: `increment_occurrence()` instead of new record
   - `hit_by_users[]` appended with Developer B's handle
3. One clean lesson, occurrence_count = 2

### 8.4 API Key Distribution

```
Project lead: lore project:register → gets LORE_PROJECT_API_KEY
             → stores in team secrets manager (1Password / Doppler / AWS)

Each developer: gets key from secrets manager
                sets: export LORE_API_KEY=lore_project_xxxx
                sets: export LORE_USER=theirname
                runs: lore install
```
