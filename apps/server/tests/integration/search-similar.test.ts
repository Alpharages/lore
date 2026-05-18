import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
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

const makeVector = (value: number, dim = 1536): number[] => {
  const arr = new Array(dim).fill(0);
  arr[0] = value;
  return arr;
};

describe("POST /mcp/tools/search_similar", () => {
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

  it("returns similar lessons ordered by similarity descending", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    // Seed two lessons with embeddings
    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count, stack_tags, category, severity)
       VALUES ($1, $2, 'Lesson A', 'Problem A', 'Fix A', 'Rule A', $3::vector, 'complete', 5, ARRAY['typescript'], 'database', 'high')`,
      ["11111111-1111-1111-1111-111111111111", project_id, `[${vec.join(",")}]`]
    );

    const vec2 = makeVector(0.8);
    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count, stack_tags, category, severity)
       VALUES ($1, $2, 'Lesson B', 'Problem B', 'Fix B', 'Rule B', $3::vector, 'complete', 3, ARRAY['postgres'], 'api', 'medium')`,
      ["22222222-2222-2222-2222-222222222222", project_id, `[${vec2.join(",")}]`]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
        threshold: 0.6,
        limit: 5,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(body.results[0].similarity).toBeGreaterThanOrEqual(body.results[1].similarity);
    expect(body.results[0].title).toBe("Lesson A");
    expect(body.results[0].occurrence_count).toBe(5);
    expect(body.results[0].stack_tags).toEqual(["typescript"]);
  });

  it("returns empty results when no lessons match above threshold", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
       VALUES ($1, $2, 'Lesson A', 'Problem A', 'Fix A', 'Rule A', $3::vector, 'complete', 1)`,
      ["11111111-1111-1111-1111-111111111111", project_id, `[${vec.join(",")}]`]
    );

    // Provide a different vector for the irrelevant query
    const vec2 = makeVector(1);
    vec2[0] = 0;
    vec2[1] = 1; // Orthogonal to vec[0]=1, similarity will be 0
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec2);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "irrelevant topic",
        threshold: 0.99,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("uses default threshold (0.70) and limit (3) when omitted", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    // Seed 5 lessons
    for (let i = 0; i < 5; i++) {
      const v = makeVector(1 - i * 0.05);
      await pool.query(
        `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
         VALUES ($1, $2, $3, 'Problem', 'Fix', 'Rule', $4::vector, 'complete', 1)`,
        [
          `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`,
          project_id,
          `Lesson ${i}`,
          `[${v.join(",")}]`,
        ]
      );
    }

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results.length).toBeLessThanOrEqual(3);
    expect(body.count).toBe(body.results.length);
  });

  it("enforces max limit of 20", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    // Seed 25 lessons
    for (let i = 0; i < 25; i++) {
      await pool.query(
        `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
         VALUES ($1, $2, $3, 'Problem', 'Fix', 'Rule', $4::vector, 'complete', 1)`,
        [
          `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`,
          project_id,
          `Lesson ${i}`,
          `[${vec.join(",")}]`,
        ]
      );
    }

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
        limit: 25,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results.length).toBeLessThanOrEqual(20);
    expect(body.count).toBe(body.results.length);
  });

  it("includes global lessons (project_id IS NULL) in results", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
       VALUES ($1, NULL, 'Global Lesson', 'Global Problem', 'Global Fix', 'Global Rule', $2::vector, 'complete', 1)`,
      ["11111111-1111-1111-1111-111111111111", `[${vec.join(",")}]`]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
        threshold: 0.6,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Global Lesson");
  });

  it("does not return lessons from other projects (RLS isolation)", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key: apiKeyA } = await registerProject(app, "project-a");
    const { project_id: projectIdB } = await registerProject(app, "project-b");

    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
       VALUES ($1, $2, 'Project B Lesson', 'Problem', 'Fix', 'Rule', $3::vector, 'complete', 1)`,
      ["11111111-1111-1111-1111-111111111111", projectIdB, `[${vec.join(",")}]`]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
        threshold: 0.6,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("returns empty results when embedding generation fails", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);

    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("rejects empty text with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects missing text with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {},
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
      url: "/mcp/tools/search_similar",
      headers: { "content-type": "application/json" },
      payload: {
        text: "database connection pool",
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
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
        provenance: { trust_tier: "high", source: "auto" },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("responds in under 500ms", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
       VALUES ($1, $2, 'Lesson A', 'Problem A', 'Fix A', 'Rule A', $3::vector, 'complete', 1)`,
      ["11111111-1111-1111-1111-111111111111", project_id, `[${vec.join(",")}]`]
    );

    const start = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        text: "database connection pool",
      },
    });
    const duration = Date.now() - start;

    expect(res.statusCode).toBe(200);
    expect(duration).toBeLessThan(500);
  });
});
