import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";

// Set admin secret for middleware
process.env.ADMIN_SECRET = ADMIN_SECRET;

describe("Project Registration & Admin Routes", () => {
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
  });

  describe("AC-1 / AC-2 — POST /api/projects/register", () => {
    it("registers a project and returns a one-time API key", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: {
          name: "Acme",
          slug: "acme",
          stack_tags: ["nestjs", "postgres"],
          repos: [{ slug: "backend", stack_tags: ["nestjs"] }],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.project_id).toBeDefined();
      expect(body.api_key).toMatch(/^lore_acme_[A-Za-z0-9]{24}$/);
      expect(body.message).toBe("Project registered. Store API key securely.");

      // DoD: verify bcrypt hash is stored correctly and matches the issued key
      const row = await pool.query<{ api_key_hash: string }>(
        "SELECT api_key_hash FROM projects WHERE id = $1",
        [body.project_id]
      );
      expect(row.rows).toHaveLength(1);
      const hashMatches = await bcrypt.compare(body.api_key, row.rows[0].api_key_hash);
      expect(hashMatches).toBe(true);
    });

    it("rejects duplicate slugs with 409", async () => {
      const app = buildTestApp(pool, db);
      await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme" },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Acme Two", slug: "acme" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("rejects invalid slugs with 400", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Bad", slug: "acme_corp" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("AC-3 — GET /api/projects", () => {
    it("lists projects without key material", async () => {
      const app = buildTestApp(pool, db);
      await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.projects)).toBe(true);
      expect(body.projects.length).toBe(1);
      const project = body.projects[0];
      expect(project).toHaveProperty("id");
      expect(project).toHaveProperty("slug");
      expect(project).toHaveProperty("name");
      expect(project).toHaveProperty("stackTags");
      expect(project).toHaveProperty("createdAt");
      expect(project).toHaveProperty("lessonCount");
      expect(typeof project.lessonCount).toBe("number");
      expect(project).not.toHaveProperty("api_key_hash");
      expect(project).not.toHaveProperty("api_key");
      expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/);
    });
  });

  describe("AC-4 — DELETE /api/projects/:slug", () => {
    it("deletes a project and cascades dependencies", async () => {
      const app = buildTestApp(pool, db);
      const createRes = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: {
          name: "Acme",
          slug: "acme",
          repos: [{ slug: "backend" }],
        },
      });
      const { project_id, api_key } = JSON.parse(createRes.payload);

      // Seed a session and a lesson directly via DB (admin bypass)
      await pool.query(`INSERT INTO sessions (project_id, task_summary) VALUES ($1, 'test')`, [
        project_id,
      ]);
      await pool.query(
        `INSERT INTO lessons (project_id, title, problem, fix, prevention_rule)
         VALUES ($1, 'L', 'p', 'f', 'r')`,
        [project_id]
      );

      const delRes = await app.inject({
        method: "DELETE",
        url: "/api/projects/acme",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });

      expect(delRes.statusCode).toBe(204);

      // Verify project row is gone
      const listRes = await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      expect(JSON.parse(listRes.payload).projects).toEqual([]);

      // Verify ON DELETE CASCADE removed all child rows
      const repoCount = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM repositories WHERE project_id = $1",
        [project_id]
      );
      expect(parseInt(repoCount.rows[0].count, 10)).toBe(0);

      const sessionCount = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM sessions WHERE project_id = $1",
        [project_id]
      );
      expect(parseInt(sessionCount.rows[0].count, 10)).toBe(0);

      const lessonCount = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM lessons WHERE project_id = $1",
        [project_id]
      );
      expect(parseInt(lessonCount.rows[0].count, 10)).toBe(0);

      // Verify API key no longer works
      const authRes = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(authRes.statusCode).toBe(401);
    });
  });

  describe("AC-7 — Admin auth", () => {
    it("rejects missing admin secret with 401", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: { "content-type": "application/json" },
        payload: { name: "Acme", slug: "acme" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("admin_auth_required");
    });

    it("rejects wrong admin secret with 401", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": "wrong-secret",
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
