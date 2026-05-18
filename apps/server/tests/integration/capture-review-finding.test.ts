import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { EMBEDDING_DIMENSIONS } from "../helpers/embedding-dim.js";
import * as embedding from "../../src/services/embedding.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

async function registerProject(app: any, slug: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/projects/register",
    headers: {
      "x-admin-secret": ADMIN_SECRET,
      "content-type": "application/json",
    },
    payload: { name: slug, slug, repos: [{ slug: "backend" }] },
  });
  return JSON.parse(res.payload);
}

const validPayload = {
  external_task_id: "task-001",
  external_tracker_type: "clickup",
  severity: "high",
  finding: {
    title: "SQL injection via unsanitised input",
    problem: "User input passed directly to query",
    fix: "Use parameterised queries",
    prevention_rule: "Always use Drizzle ORM, never string concatenation",
  },
  reviewer: "alice",
  workflow: "bmad-code-review",
};

describe("POST /mcp/tools/capture_review_finding", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;

  beforeAll(() => {
    pool = createTestPool();
    db = createTestDb(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    vi.restoreAllMocks();
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
  });

  it("creates a lesson and returns 201 with server-stamped provenance", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.lesson_id).toBeDefined();
    expect(body.embedding_status).toBe("pending");
    expect(body.action).toBe("created");

    const row = await pool.query(
      `SELECT provenance->>'trust_tier' AS trust_tier,
              provenance->>'source' AS source,
              provenance->>'skill' AS skill,
              provenance->>'task_id' AS task_id,
              provenance->>'reviewer' AS reviewer,
              provenance->>'workflow' AS workflow,
              provenance->>'captured_at' AS captured_at,
              external_task_id,
              external_tracker_type,
              external_task_ref
       FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].trust_tier).toBe("high");
    expect(row.rows[0].source).toBe("bmad-code-review");
    expect(row.rows[0].skill).toBe("clickup-code-review");
    expect(row.rows[0].task_id).toBe("task-001");
    expect(row.rows[0].reviewer).toBe("alice");
    expect(row.rows[0].workflow).toBe("bmad-code-review");
    expect(row.rows[0].captured_at).toBeTruthy();
    expect(row.rows[0].external_task_id).toBe("task-001");
    expect(row.rows[0].external_tracker_type).toBe("clickup");
    expect(row.rows[0].external_task_ref).toBeNull();
  });

  it("rejects caller-supplied provenance via schema (additionalProperties: false)", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        ...validPayload,
        provenance: { trust_tier: "critical" },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects invalid external_tracker_type with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        ...validPayload,
        external_tracker_type: "github",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects missing required finding sub-fields with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-001",
        external_tracker_type: "clickup",
        severity: "high",
        finding: {
          title: "T",
          problem: "P",
          // fix missing
          prevention_rule: "R",
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects empty external_task_id with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        ...validPayload,
        external_task_id: "",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: { "content-type": "application/json" },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(401);
  });

  it("works when reviewer and workflow are omitted", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-002",
        external_tracker_type: "clickup",
        severity: "medium",
        finding: {
          title: "T",
          problem: "P",
          fix: "F",
          prevention_rule: "R",
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.lesson_id).toBeDefined();

    const row = await pool.query(
      `SELECT provenance->>'reviewer' AS reviewer,
              provenance->>'workflow' AS workflow
       FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows[0].reviewer).toBeNull();
    expect(row.rows[0].workflow).toBeNull();
  });

  it("rejects whitespace-only external_task_id with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { ...validPayload, external_task_id: "   " },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("stores code_pointer in provenance when provided", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        ...validPayload,
        finding: {
          ...validPayload.finding,
          code_pointer: { file: "src/auth.ts", line_start: 10, line_end: 20 },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    const row = await pool.query(
      `SELECT provenance->'code_pointer'->>'file' AS cp_file,
              (provenance->'code_pointer'->>'line_start')::int AS cp_line_start,
              (provenance->'code_pointer'->>'line_end')::int AS cp_line_end
       FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows[0].cp_file).toBe("src/auth.ts");
    expect(row.rows[0].cp_line_start).toBe(10);
    expect(row.rows[0].cp_line_end).toBe(20);
  });

  it("rejects code_pointer with line_end < line_start with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        ...validPayload,
        finding: {
          ...validPayload.finding,
          code_pointer: { file: "src/auth.ts", line_start: 50, line_end: 10 },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("stamps provenance.skill derived from tracker type", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { ...validPayload, external_tracker_type: "jira" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    const row = await pool.query(
      `SELECT provenance->>'skill' AS skill FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows[0].skill).toBe("jira-code-review");
  });

  it("increments occurrence on retry when embedding fails (idempotency)", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res1 = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: validPayload,
    });
    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.payload);
    expect(body1.action).toBe("created");

    const res2 = await app.inject({
      method: "POST",
      url: "/mcp/tools/capture_review_finding",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: validPayload,
    });
    expect(res2.statusCode).toBe(201);
    const body2 = JSON.parse(res2.payload);
    expect(body2.action).toBe("incremented");
    expect(body2.lesson_id).toBe(body1.lesson_id);

    const row = await pool.query(`SELECT occurrence_count FROM lessons WHERE id = $1`, [
      body1.lesson_id,
    ]);
    expect(row.rows[0].occurrence_count).toBe(2);
  });

  describe("semantic deduplication", () => {
    const makeVector = (value: number, dim = EMBEDDING_DIMENSIONS): number[] => {
      const arr = new Array(dim).fill(0);
      arr[0] = value;
      return arr;
    };

    it("increments occurrence when a similar lesson exists (cosine >= 0.85)", async () => {
      const vec = makeVector(1);
      vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

      const app = buildTestApp(pool, db);
      const { api_key, project_id } = await registerProject(app, "acme");

      const existingId = "11111111-1111-1111-1111-111111111111";
      await pool.query(
        `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
         VALUES ($1, $2, 'Existing', 'Existing problem', 'Existing fix', 'Existing rule', $3::vector, 'complete', 1)`,
        [existingId, project_id, `[${vec.join(",")}]`]
      );

      const res = await app.inject({
        method: "POST",
        url: "/mcp/tools/capture_review_finding",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("incremented");
      expect(body.lesson_id).toBe(existingId);

      const row = await pool.query(`SELECT occurrence_count FROM lessons WHERE id = $1`, [
        existingId,
      ]);
      expect(row.rows[0].occurrence_count).toBe(2);
    });

    it("creates a new lesson when no similar lesson exists (cosine < 0.85)", async () => {
      const existingVec = makeVector(1);
      const newVec = makeVector(0);
      newVec[0] = 0;
      newVec[1] = 1;

      vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(newVec);

      const app = buildTestApp(pool, db);
      const { api_key, project_id } = await registerProject(app, "acme");

      const existingId = "11111111-1111-1111-1111-111111111111";
      await pool.query(
        `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
         VALUES ($1, $2, 'Existing', 'Existing problem', 'Existing fix', 'Existing rule', $3::vector, 'complete', 1)`,
        [existingId, project_id, `[${existingVec.join(",")}]`]
      );

      const res = await app.inject({
        method: "POST",
        url: "/mcp/tools/capture_review_finding",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("created");
      expect(body.lesson_id).not.toBe(existingId);
      expect(body.embedding_status).toBe("complete");
    });

    it("skips dedup and creates lesson when embedding generation fails", async () => {
      vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);

      const app = buildTestApp(pool, db);
      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "POST",
        url: "/mcp/tools/capture_review_finding",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("created");
      expect(body.embedding_status).toBe("pending");
    });
  });
});
