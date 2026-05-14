# Lore Platform — Technical Specification

Version: 1.0.0
Status: Final (Draft for Implementation)
Date: 2026-05-06

---

## 1. System Overview

Lore Platform consists of two independently deployable components:

| Component         | Type        | Language             | Deployment                 |
| ----------------- | ----------- | -------------------- | -------------------------- |
| `@alpharages/lore`       | npm package | TypeScript / Node.js | Developer machine (global) |
| `lore-memory-mcp` | HTTP server | TypeScript / Node.js | Docker, self-hosted        |

---

## 2. `@alpharages/lore` Specification

### 2.1 Installation

```
npm install -g @alpharages/lore
```

Minimum Node.js version: 20.0.0

### 2.2 Commands

#### `lore install`

Reads `lore.yaml` (walks directory tree upward from CWD), then:

1. Validate the YAML against the v1.0 schema.
2. Verify `lore-memory-mcp` server reachability and version compatibility
   against the `lore.version` range in `lore.yaml`.
3. Write the Cursor MCP config to `~/.cursor/mcp.json` with entries for
   `lore-memory`, `gitnexus`, and (when methodology declared)
   `bmad-mcp-server`.
4. Append the CLAUDE.md include to `~/.claude/CLAUDE.md`.
5. For each repo in `lore.yaml`:
   a. Run `npx gitnexus analyze` (full index, first time)
   b. Write `post-commit` hook to `<repo>/.git/hooks/`
   c. Write `post-merge` hook to `<repo>/.git/hooks/`
   d. Make hooks executable (chmod 755)

**`lore.yaml` search algorithm:**

```
current_dir = process.cwd()
while (current_dir !== '/') {
  if (exists(current_dir + '/lore.yaml')) return current_dir + '/lore.yaml'
  current_dir = parent(current_dir)
}
throw new Error('lore.yaml not found')
```

**Idempotency:** CLI checks `~/.lore/install-state.json` before each
step. Steps already completed are skipped. State is updated after each
step.

#### `lore init`

Interactive project initialization:

```
Prompts:
  1. Project name (string)
  2. Project slug (string, auto-derived from name; user can override)
  3. Repos (comma-separated list of repo names)
  4. For each repo: relative path and tech stack (multi-select)
  5. Lore server URL (string, default: http://localhost:3100)
  6. Use a methodology layer? (Y/n)
       If Yes:
         - Methodology type (currently only: bmad)
         - Methodology version range (e.g. "^6.0.0")
         - Tracker type (clickup | jira | asana)
         - Tracker-specific identifiers (space, lists, custom fields)
         - Validate tracker connection now? (Y/n)

Actions:
  1. Generate lore.yaml (see §2.5)
  2. Generate CLAUDE.md from template
  3. Generate ops/constitution.md from template
  4. For each repo: generate repos/<slug>/REPO_IDENTITY.md
  5. POST /api/projects/register to lore-memory-mcp
  6. Display returned API key with storage instructions
```

#### `lore update`

1. Compare `lore.version` field in `lore.yaml` against the
   `lore-memory-mcp` Docker image registry.
2. If a newer image exists matching the declared range:
   a. Display changelog (image release notes).
   b. Verify backward-compatible schema migrations exist.
   c. On confirmation: pull new image, run `db:migrate`, restart
   `lore-memory-mcp`.
   d. Update `lore.version` field in `lore.yaml`.

#### `lore inbox`

Lists pending lesson-propagation suggestions for the current project and
allows interactive accept/reject.

```
GET /api/projects/<slug>/inbox
→ Returns pending lesson_propagations with source lesson summary
  (excluding source project name).

For each suggestion, prompt:
  [a]ccept | [r]eject | [s]kip | [q]uit
On accept → call accept_propagation MCP tool
On reject → call reject_propagation MCP tool
```

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
# Auto-installed by @alpharages/lore
# Re-indexes changed files after commit (background, silent)
if command -v npx > /dev/null 2>&1; then
  npx gitnexus analyze --incremental --quiet > /dev/null 2>&1 &
fi
```

**post-merge:**

```bash
#!/bin/sh
# Auto-installed by @alpharages/lore
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
    },
    "bmad": {
      "command": "npx",
      "args": ["-y", "bmad-mcp-server@${methodology.version}"]
    }
  }
}
```

`MCP_SERVER_URL` is read from `lore.yaml`. `LORE_API_KEY` is read from
the developer's environment at runtime by Cursor. The `bmad` entry is
omitted when `methodology:` is not declared.

### 2.5 `lore.yaml` Schema

```yaml
lore:
  version: "1.0.0" # lore-memory-mcp compatibility range

project:
  name: "My Project"
  slug: "my-project"

mcp:
  server: "https://your-server"

# Optional: methodology layer (BMAD)
methodology:
  type: bmad
  version: "^6.0.0"
  allowed_workflows:
    - prd
    - architecture
    - debug-session
    - bmad-code-review
  default_dev_skill: clickup-dev-implement
  default_review_skill: clickup-code-review

# Required when methodology is declared
tracker:
  type: clickup # clickup | jira | asana
  space_id: "12345"
  backlog_list_id: "67890"
  active_sprint_list_id: "abcdef"
  config:
    custom_field_lesson_link: "field_id_xyz"

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

**Validation rules:**

- `methodology` is optional. When present, `tracker` is required.
- `lore.version` is checked by `@alpharages/lore` against the running
  `lore-memory-mcp` version on `lore install`.

---

## 3. `lore-memory-mcp` Server Specification

### 3.1 Technology Stack

| Layer            | Technology                | Version                |
| ---------------- | ------------------------- | ---------------------- |
| Runtime          | Node.js                   | 20 LTS                 |
| Language         | TypeScript                | 5.x                    |
| HTTP Framework   | Fastify                   | 4.x                    |
| MCP SDK          | @modelcontextprotocol/sdk | latest                 |
| ORM              | Drizzle ORM               | latest                 |
| Database         | PostgreSQL                | 16                     |
| Vector extension | pgvector                  | 0.7.x                  |
| Embeddings       | OpenAI API                | text-embedding-3-small |
| Containerization | Docker + Docker Compose   | latest                 |
| Schema migration | Drizzle Kit               | latest                 |

### 3.2 Environment Variables

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

### 3.3 MCP Tools — Full Specification

#### `query_lessons`

```typescript
Input: {
  stack_tags?: string[]
  category?: string
  min_severity?: "critical" | "high" | "medium" | "low"
  last_n_days?: number
  repo_slug?: string
  limit?: number              // default: 5, max: 20
  include_global?: boolean    // default: true
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
    provenance?: object        // includes trust_tier, source
  }>
  total_count: number
  query_ms: number
}
```

#### `search_similar`

```typescript
Input: {
  text: string
  limit?: number              // default: 3, max: 10
  threshold?: number          // default: 0.70
  include_patterns?: boolean  // default: true
}

Output: {
  results: Array<{
    type: "lesson" | "pattern"
    id: string
    title: string
    prevention_rule?: string
    similarity_score: number
    severity?: string
  }>
  query_ms: number
}

Implementation:
  1. Generate embedding for input text via OpenAI
  2. SELECT *, 1 - (embedding <=> $query_embedding) as similarity
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
  captured_by_user?: string
}

Processing:
  1. Generate embedding for: title + problem + fix + prevention_rule
  2. Check for semantic duplicates (cosine ≥ 0.90)
  3. If duplicate → call increment_occurrence(existing_id)
  4. If no duplicate → INSERT new lesson with
       provenance = { source: "manual", captured_by: <user>,
                      trust_tier: "manual" }

Output: {
  action: "created" | "incremented"
  lesson_id: string
}
```

#### `capture_review_finding` (NEW)

```typescript
Input: {
  external_task_id: string
  external_tracker_type: "clickup" | "jira" | "asana"
  external_task_ref?: string
  severity: "critical" | "high" | "medium" | "low"
  finding: {
    title: string
    problem: string
    root_cause?: string
    fix: string
    prevention_rule: string
    stack_tags?: string[]      // inferred from repo if omitted
    category?: string
    code_pointer?: {
      file: string
      line_start: number
      line_end: number
    }
  }
  reviewer?: string
  workflow?: string            // e.g. "bmad-code-review"
}

Processing:
  1. Same as save_lesson, plus:
  2. Stamp provenance server-side:
       {
         source: "bmad-code-review",
         workflow: <workflow>,
         skill: "clickup-code-review",
         task_id: <external_task_id>,
         reviewer: <reviewer>,
         trust_tier: "high",
         captured_at: <now>
       }
  3. Set external_task_id, external_task_ref, external_tracker_type
     on the lesson.

Output: {
  action: "created" | "incremented"
  lesson_id: string
}
```

#### `query_lessons_for_task` (NEW)

```typescript
Input: {
  external_task_id: string
  task_context?: {
    title: string
    description?: string
    acceptance_criteria?: string
    parent_epic_id?: string
    stack_tags?: string[]
  }
  limit?: number              // default: 10
}

Processing:
  1. Generate embedding from task_context.title + description.
  2. Run combined query:
       - Semantic similarity (pgvector cosine)
       - Stack-tag overlap filter
       - If parent_epic_id present: also pull lessons attached to
         sibling tasks (lessons.external_task_id IN (sibling task IDs))
  3. Score using relevance algorithm (§3.6).
  4. Also fetch top patterns matching stack_tags.

Output: {
  lessons: Array<Lesson & { relevance_score: number, match_reason: string }>
  patterns: Array<Pattern>
  query_ms: number
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

#### `start_session_from_task` (NEW)

```typescript
Input: {
  external_task_id: string
  external_tracker_type: "clickup" | "jira" | "asana"
  external_task_ref?: string
  task_summary?: string        // auto-fetched if omitted by caller
  branch: string
  user_handle?: string
  bmad_skill: string           // e.g. "clickup-dev-implement"
  bmad_workflow?: string
  repo_slug?: string
}

Processing:
  1. Look for existing open session with same
     (project_id, external_task_id, external_tracker_type).
  2. If found → return resumed=true with prior_session_summary.
  3. Else → INSERT new session row with bmad_skill / bmad_workflow.

Output: {
  session_id: string
  resumed: boolean
  prior_session_summary?: {
    branch: string
    decisions: object[]
    files_touched: string[]
    started_at: string
    ended_at: string
  }
}
```

#### `end_session`

```typescript
Input: {
  session_id: string
  decisions?: Array<{ what: string, why: string }>
  lessons_applied?: string[]   // lesson UUIDs
  files_touched?: string[]
}

Output: {
  session_id: string
  duration_minutes: number
}
```

#### `link_lessons_to_task` (NEW)

```typescript
Input: {
  external_task_id: string
  consulted: string[]          // lesson UUIDs shown to agent
  applied: string[]            // lesson UUIDs the agent acted on
}

Processing:
  Update the open session for the given task with:
    - lessons_consulted = lessons_consulted UNION consulted
    - lessons_applied   = lessons_applied   UNION applied

Output: { linked: number }
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

Output: { lesson_id: string, new_count: number }
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

Output: { pattern_id: string }
```

#### `get_pending_propagations`

```typescript
Input: {
} // project identified by API key

Output: {
  suggestions: Array<{
    propagation_id: string;
    lesson_title: string;
    lesson_problem: string;
    lesson_prevention_rule: string;
    lesson_severity: string;
    source_stack_tags: string[];
    suggested_at: string;
  }>;
  count: number;
}
```

#### `accept_propagation`

```typescript
Input: { propagation_id: string }

Processing:
  1. Fetch source lesson.
  2. Copy to target project with project_id = current project,
     occurrence_count = 1, propagated_from = source_lesson_id.
  3. Generate fresh embedding (target context may differ).
  4. Update lesson_propagations.status = "accepted".

Output: {
  new_lesson_id: string
  action: "accepted"
}
```

#### `reject_propagation`

```typescript
Input: {
  propagation_id: string;
}

Output: {
  action: "rejected";
}
```

### 3.4 REST API Endpoints (Non-MCP)

```
POST   /api/projects/register     Register new project, get API key
DELETE /api/projects/:slug        Deregister project
GET    /api/projects/:slug/stats  Memory stats for project
GET    /api/projects/:slug/inbox  Pending propagations (used by lore inbox CLI)
GET    /health                    Server health check
GET    /metrics                   Prometheus metrics
```

### 3.5 Authentication Flow

```
1. Extract Bearer token from Authorization header.
2. Look up project by bcrypt-comparing token against api_key_hash.
3. If not found → 401.
4. Open DB connection.
5. SET LOCAL app.current_project_id = $project_id.
6. RLS activates for this transaction.
7. Execute tool logic.
8. Return result.
9. Release connection to pool.
```

### 3.6 Relevance Scoring Algorithm

```typescript
function scoreLesson(lesson: Lesson, context: QueryContext): number {
  // Recency: decay from 1.0 to 0.0 over 180 days
  const ageDays = (Date.now() - lesson.last_seen_at) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / 180);

  // Frequency: 10+ occurrences = max score
  const frequency = Math.min(1, lesson.occurrence_count / 10);

  // Stack overlap: fraction of lesson's tags present in context
  const overlap = intersection(lesson.stack_tags, context.stack_tags);
  const stackMatch = lesson.stack_tags.length > 0 ? overlap.length / lesson.stack_tags.length : 0;

  // Severity weights
  const severityWeight =
    {
      critical: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.2,
    }[lesson.severity] ?? 0.5;

  // Semantic similarity (from pgvector query, 0–1)
  const semantic = context.semanticScore ?? 0.5;

  // Trust tier — currently stored but weight = 1.0 in v1.0;
  // tunable in future versions
  const trustWeight = 1.0;

  return (
    (severityWeight * 0.3 + recency * 0.25 + semantic * 0.25 + frequency * 0.1 + stackMatch * 0.1) *
    trustWeight
  );
}
```

### 3.7 Cross-Project Propagation Engine

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
    // Find other projects with overlapping stack (at least 1 common tag).
    // Tracker type is irrelevant — propagation is tracker-agnostic.
    const candidates = await db.query(
      `
      SELECT p.id
      FROM projects p
      WHERE p.id != $1
        AND p.stack_tags && $2
        AND p.id NOT IN (
          SELECT target_project_id FROM lesson_propagations
          WHERE source_lesson_id = $3
        )
    `,
      [lesson.project_id, lesson.stack_tags, lesson.id]
    );

    if (candidates.length === 0) continue;

    await db.query(
      `
      INSERT INTO lesson_propagations
        (source_lesson_id, target_project_id, status)
      SELECT $1, unnest($2::uuid[]), 'suggested'
      ON CONFLICT (source_lesson_id, target_project_id) DO NOTHING
    `,
      [lesson.id, candidates.map((c: { id: string }) => c.id)]
    );
  }
}
```

---

## 4. Database Specification

### 4.1 pgvector Index Configuration

For ≤ 100,000 vectors (startup/small team):

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

HNSW has better query performance but higher build time and memory
usage.

### 4.2 RLS Policy Template

```sql
CREATE POLICY project_isolation ON {table}
  USING (
    project_id = current_setting('app.current_project_id', true)::UUID
    OR project_id IS NULL
  );

-- Tables with RLS enabled:
-- lessons, patterns, sessions, repositories, lesson_propagations
```

---

## 5. Embedding Strategy

### 5.1 What Gets Embedded

| Record Type | Embedded Text                                             |
| ----------- | --------------------------------------------------------- |
| Lesson      | title + " " + problem + " " + fix + " " + prevention_rule |
| Pattern     | title + " " + description + " " + (code_example ?? "")    |

### 5.2 Embedding Model

- Model: `text-embedding-3-small`
- Dimensions: 1536
- Cost: ~$0.00002 per lesson (negligible)
- Max input tokens: 8191

### 5.3 Embedding Implementation

```typescript
async function embedLesson(lesson: LessonInput): Promise<number[]> {
  const text = [lesson.title, lesson.problem, lesson.fix, lesson.prevention_rule]
    .filter(Boolean)
    .join(" ");

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });

  return response.data[0].embedding;
}
```

---

## 6. Error Handling

### 6.1 MCP Tool Errors

All tools return structured errors:

```typescript
{
  error: true,
  code: "LESSON_NOT_FOUND" | "INVALID_PROJECT" | "EMBEDDING_FAILED"
        | "TASK_NOT_FOUND" | ...,
  message: string,
  retryable: boolean
}
```

### 6.2 OpenAI Embedding Failures

If embedding generation fails:

- Log error with `lesson_id`
- Store lesson WITHOUT embedding
- Mark `embedding_status: 'pending'`
- Background job retries failed embeddings every 5 minutes

### 6.3 Database Connection Failures

- Connection pool size: 10
- Connection timeout: 5 seconds
- Query timeout: 10 seconds
- On failure: return 503 with `retryable: true`

---

## 7. Team Memory Model

### 7.1 Shared vs. Private Data

| Data             | Shared (team)                       | Private (individual)                 |
| ---------------- | ----------------------------------- | ------------------------------------ |
| Lessons learned  | Yes                                 | —                                    |
| Code patterns    | Yes                                 | —                                    |
| Prevention rules | Yes                                 | —                                    |
| Sessions         | Yes (queryable by all team members) | Originator recorded in `user_handle` |

There is no per-developer memory pool in v1.0. Memory is team-shared,
project-isolated.

### 7.2 User Handle

Each developer sets once in their local environment:

```bash
export LORE_USER=alice
export LORE_API_KEY=lore_project_xxxx    # same key for whole team
```

### 7.3 Deduplication via Semantic Similarity

When two developers hit the same bug simultaneously:

1. Developer A's `clickup-code-review` captures lesson →
   `embedding` generated, stored.
2. Developer B's `clickup-code-review` runs `capture_review_finding`:
   - Semantic similarity check against existing lessons.
   - If match > 0.90: `increment_occurrence()` instead of new record.
   - `hit_by_users[]` appended with Developer B's handle.
3. One clean lesson, occurrence_count = 2 → eligible for cross-project
   propagation.

### 7.4 API Key Distribution

```
Project lead: lore project:register → gets LORE_PROJECT_API_KEY
              → stores in team secrets manager
                (1Password / Doppler / AWS Secrets Manager)

Each developer: gets key from secrets manager
                sets: export LORE_API_KEY=lore_project_xxxx
                sets: export LORE_USER=theirname
                runs: lore install
```
