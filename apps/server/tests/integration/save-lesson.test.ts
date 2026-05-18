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

describe("POST /mcp/tools/save_lesson", () => {
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

  it("creates a lesson and returns 201 with pending embedding status", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Drizzle RLS GUC reset on pool reconnect",
        problem: "Pool connection reuse clears GUC",
        fix: "Always set GUC in same transaction as query",
        prevention_rule: "Set app.current_project_id in every transaction before first query",
        stack_tags: ["typescript", "drizzle-orm", "postgres"],
        severity: "high",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.lesson_id).toBeDefined();
    expect(body.embedding_status).toBe("pending");
    expect(body.action).toBe("created");

    const row = await pool.query(
      `SELECT embedding_status, provenance->>'trust_tier' AS trust_tier
       FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].embedding_status).toBe("pending");
    expect(row.rows[0].trust_tier).toBe("manual");
  });

  it("rejects missing required fields with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        problem: "Something",
        fix: "Fix it",
        prevention_rule: "Don't do it",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects invalid severity with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        severity: "critical-plus",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects unknown repo_slug with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        repo_slug: "unknown-repo",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("resolves repo_slug to repo_id when valid", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        repo_slug: "backend",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);

    const row = await pool.query(`SELECT repo_id FROM lessons WHERE id = $1`, [body.lesson_id]);
    expect(row.rows[0].repo_id).not.toBeNull();

    const repoRow = await pool.query(
      `SELECT id FROM repositories WHERE project_id = $1 AND slug = $2`,
      [project_id, "backend"]
    );
    expect(row.rows[0].repo_id).toBe(repoRow.rows[0].id);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: { "content-type": "application/json" },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects caller-supplied provenance via schema (additionalProperties: false)", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        provenance: { trust_tier: "high", source: "auto" },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("server-stamps provenance on every successful save", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        user_handle: "alice",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);

    const row = await pool.query(
      `SELECT provenance->>'trust_tier' AS trust_tier,
              provenance->>'source' AS source,
              provenance->>'captured_by' AS captured_by
       FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows[0].trust_tier).toBe("manual");
    expect(row.rows[0].source).toBe("manual");
    expect(row.rows[0].captured_by).toBe("alice");
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

      // Seed an existing lesson with the same embedding
      const existingId = "11111111-1111-1111-1111-111111111111";
      await pool.query(
        `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
         VALUES ($1, $2, 'Existing', 'Existing problem', 'Existing fix', 'Existing rule', $3::vector, 'complete', 1)`,
        [existingId, project_id, `[${vec.join(",")}]`]
      );

      const res = await app.inject({
        method: "POST",
        url: "/mcp/tools/save_lesson",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: {
          title: "Similar title",
          problem: "Similar problem",
          fix: "Similar fix",
          prevention_rule: "Similar rule",
          stack_tags: ["typescript"],
          severity: "high",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("incremented");
      expect(body.lesson_id).toBe(existingId);

      const row = await pool.query(
        `SELECT occurrence_count, hit_by_users FROM lessons WHERE id = $1`,
        [existingId]
      );
      expect(row.rows[0].occurrence_count).toBe(2);
    });

    it("appends user_handle to hit_by_users on increment", async () => {
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
        url: "/mcp/tools/save_lesson",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: {
          title: "Similar title",
          problem: "Similar problem",
          fix: "Similar fix",
          prevention_rule: "Similar rule",
          severity: "high",
          user_handle: "alice",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("incremented");

      const row = await pool.query(
        `SELECT occurrence_count, hit_by_users FROM lessons WHERE id = $1`,
        [existingId]
      );
      expect(row.rows[0].occurrence_count).toBe(2);
      expect(row.rows[0].hit_by_users).toContain("alice");
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
        url: "/mcp/tools/save_lesson",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: {
          title: "Different title",
          problem: "Different problem",
          fix: "Different fix",
          prevention_rule: "Different rule",
          severity: "high",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("created");
      expect(body.lesson_id).not.toBe(existingId);
      expect(body.embedding_status).toBe("complete");

      const row = await pool.query(`SELECT occurrence_count FROM lessons WHERE id = $1`, [
        existingId,
      ]);
      expect(row.rows[0].occurrence_count).toBe(1);
    });

    it("skips dedup and creates lesson when embedding generation fails", async () => {
      vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);

      const app = buildTestApp(pool, db);
      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "POST",
        url: "/mcp/tools/save_lesson",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: {
          title: "Title",
          problem: "Problem",
          fix: "Fix",
          prevention_rule: "Rule",
          severity: "high",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("created");
      expect(body.embedding_status).toBe("pending");
    });

    it("does not match lessons from a different project (RLS isolation)", async () => {
      const vec = makeVector(1);
      vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

      const app = buildTestApp(pool, db);
      const { api_key: apiKeyA } = await registerProject(app, "project-a");
      const { api_key: apiKeyB, project_id: projectIdB } = await registerProject(app, "project-b");

      // Seed a lesson in Project B
      const existingId = "11111111-1111-1111-1111-111111111111";
      await pool.query(
        `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
         VALUES ($1, $2, 'Existing', 'Existing problem', 'Existing fix', 'Existing rule', $3::vector, 'complete', 1)`,
        [existingId, projectIdB, `[${vec.join(",")}]`]
      );

      // Save a lesson in Project A with the same embedding
      const res = await app.inject({
        method: "POST",
        url: "/mcp/tools/save_lesson",
        headers: {
          authorization: `Bearer ${apiKeyA}`,
          "content-type": "application/json",
        },
        payload: {
          title: "Similar title",
          problem: "Similar problem",
          fix: "Similar fix",
          prevention_rule: "Similar rule",
          severity: "high",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("created");
      expect(body.lesson_id).not.toBe(existingId);
    });

    it("stores embedding directly when no duplicate is found", async () => {
      const vec = makeVector(1);
      vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

      const app = buildTestApp(pool, db);
      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "POST",
        url: "/mcp/tools/save_lesson",
        headers: {
          authorization: `Bearer ${api_key}`,
          "content-type": "application/json",
        },
        payload: {
          title: "Title",
          problem: "Problem",
          fix: "Fix",
          prevention_rule: "Rule",
          severity: "high",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.action).toBe("created");
      expect(body.embedding_status).toBe("complete");

      const row = await pool.query(
        `SELECT embedding_status, embedding IS NOT NULL AS has_embedding FROM lessons WHERE id = $1`,
        [body.lesson_id]
      );
      expect(row.rows[0].embedding_status).toBe("complete");
      expect(row.rows[0].has_embedding).toBe(true);
    });
  });
});
