import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

describe("Project API — Security", () => {
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

  describe("AC-2 — GET /api/projects omits all key material", () => {
    it("never exposes api_key_hash, api_key, or any bcrypt signature", async () => {
      const app = buildTestApp(pool, db);

      // Register a project so there is data to list
      const createRes = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme", stack_tags: ["nestjs"] },
      });
      expect(createRes.statusCode).toBe(201);

      const listRes = await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });

      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.payload);
      expect(body).toHaveProperty("projects");
      expect(Array.isArray(body.projects)).toBe(true);
      expect(body.projects.length).toBe(1);

      const project = body.projects[0];
      const allowedKeys = ["id", "slug", "name", "stackTags", "createdAt", "lessonCount"];
      const actualKeys = Object.keys(project);

      for (const key of actualKeys) {
        expect(allowedKeys).toContain(key);
      }

      expect(project).not.toHaveProperty("api_key_hash");
      expect(project).not.toHaveProperty("apiKeyHash");
      expect(project).not.toHaveProperty("api_key");
      expect(project).not.toHaveProperty("apiKey");
      expect(project).not.toHaveProperty("hash");
      expect(project).not.toHaveProperty("key");

      // No bcrypt signature anywhere in the JSON response
      expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/);
    });

    it("returns an empty projects array when no projects exist", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ projects: [] });
    });
  });

  describe("AC-1 — Registration stores hash, not plaintext", () => {
    it("persists api_key_hash starting with $2b$12$ after registration", async () => {
      const app = buildTestApp(pool, db);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme" },
      });

      expect(res.statusCode).toBe(201);
      const { project_id, api_key } = JSON.parse(res.payload);

      const row = await pool.query<{ api_key_hash: string }>(
        "SELECT api_key_hash FROM projects WHERE id = $1",
        [project_id]
      );

      expect(row.rows).toHaveLength(1);
      const hash = row.rows[0].api_key_hash;
      expect(hash).toMatch(/^\$2b\$12\$/);

      // Verify the hash corresponds to the issued key
      const bcrypt = await import("bcrypt");
      const valid = await bcrypt.compare(api_key, hash);
      expect(valid).toBe(true);
    });
  });
});
