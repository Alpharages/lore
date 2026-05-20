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

describe("POST /mcp/tools/save_pattern", () => {
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

  it("creates a pattern and returns 201 with pending embedding status", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_pattern",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Fastify route handler shape",
        description: "All route plugins take (app, opts, done) and return void",
        code_example: "const route = (app, opts, done) => { app.get('/', h); done(); }",
        stack_tags: ["typescript", "fastify"],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.pattern_id).toBeDefined();
    expect(body.embedding_status).toBe("pending");

    const row = await pool.query(`SELECT embedding, usage_count FROM patterns WHERE id = $1`, [
      body.pattern_id,
    ]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].embedding).toBeNull();
    expect(row.rows[0].usage_count).toBe(1);
  });

  it("returns complete embedding status when embedding succeeds", async () => {
    const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    vec[0] = 1;
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_pattern",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Drizzle RLS pattern",
        description: "Set app.current_project_id before every query",
        stack_tags: ["typescript", "drizzle-orm"],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.pattern_id).toBeDefined();
    expect(body.embedding_status).toBe("complete");

    const row = await pool.query(`SELECT embedding FROM patterns WHERE id = $1`, [body.pattern_id]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].embedding).not.toBeNull();
  });

  it("rejects missing required fields with 400", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_pattern",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        description: "Something",
        stack_tags: [],
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
      url: "/mcp/tools/save_pattern",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Test",
        description: "Test",
        stack_tags: [],
        external_tracker_type: "github",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("stores optional fields when provided", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_pattern",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Full pattern",
        description: "A pattern with all fields",
        code_example: "const x = 1;",
        stack_tags: ["typescript"],
        category: "architecture",
        external_task_id: "task-123",
        external_task_ref: "CU-123",
        external_tracker_type: "clickup",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.pattern_id).toBeDefined();

    const row = await pool.query(
      `SELECT code_example, category, external_task_id, external_task_ref, external_tracker_type
       FROM patterns WHERE id = $1`,
      [body.pattern_id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].code_example).toBe("const x = 1;");
    expect(row.rows[0].category).toBe("architecture");
    expect(row.rows[0].external_task_id).toBe("task-123");
    expect(row.rows[0].external_task_ref).toBe("CU-123");
    expect(row.rows[0].external_tracker_type).toBe("clickup");
  });
});
