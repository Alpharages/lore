import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

const adminHeaders = {
  "x-admin-secret": ADMIN_SECRET,
  "content-type": "application/json",
};

describe("Project API — Key Management (story 10.4)", () => {
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

  const registerProject = async (slug = "acme") => {
    const app = buildTestApp(pool, db);
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/register",
      headers: adminHeaders,
      payload: { name: "Acme", slug },
    });
    expect(res.statusCode).toBe(201);
    return { app, body: JSON.parse(res.payload) as { project_id: string; api_key: string } };
  };

  describe("GET /api/projects/:slug/key", () => {
    it("returns keyId and masked key reference", async () => {
      const { app } = await registerProject();
      const res = await app.inject({
        method: "GET",
        url: "/api/projects/acme/key",
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.keyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(body.maskedKey).toBe("lore_acme_••••••••••••••••••••••••");
    });

    it("returns null reference after revoke", async () => {
      const { app } = await registerProject();
      const keyRes = await app.inject({
        method: "GET",
        url: "/api/projects/acme/key",
        headers: adminHeaders,
      });
      const { keyId } = JSON.parse(keyRes.payload);

      const revokeRes = await app.inject({
        method: "DELETE",
        url: `/api/projects/acme/keys/${keyId}`,
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      expect(revokeRes.statusCode).toBe(204);

      const afterRes = await app.inject({
        method: "GET",
        url: "/api/projects/acme/key",
        headers: adminHeaders,
      });
      expect(afterRes.statusCode).toBe(200);
      const after = JSON.parse(afterRes.payload);
      expect(after.keyId).toBeNull();
      expect(after.maskedKey).toBeNull();
    });

    it("returns 404 when project is missing", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "GET",
        url: "/api/projects/ghost/key",
        headers: adminHeaders,
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects invalid slug with 400", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "GET",
        url: "/api/projects/BAD_SLUG/key",
        headers: adminHeaders,
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects missing admin secret with 401", async () => {
      const { app } = await registerProject();
      const res = await app.inject({
        method: "GET",
        url: "/api/projects/acme/key",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("DELETE /api/projects/:slug/keys/:keyId", () => {
    it("revokes the active key and invalidates the issued plain key", async () => {
      const { app, body } = await registerProject();
      const keyRes = await app.inject({
        method: "GET",
        url: "/api/projects/acme/key",
        headers: adminHeaders,
      });
      const { keyId } = JSON.parse(keyRes.payload);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/projects/acme/keys/${keyId}`,
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      expect(res.statusCode).toBe(204);

      // The hash column is cleared
      const row = await pool.query<{ api_key_hash: string | null; api_key_id: string | null }>(
        "SELECT api_key_hash, api_key_id FROM projects WHERE slug = 'acme'"
      );
      expect(row.rows[0].api_key_hash).toBeNull();
      expect(row.rows[0].api_key_id).toBeNull();

      // The previously issued plain-text key no longer authenticates
      const authRes = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${body.api_key}` },
      });
      expect(authRes.statusCode).toBe(401);
    });

    it("returns 404 when the keyId does not match", async () => {
      await registerProject();
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "DELETE",
        url: "/api/projects/acme/keys/00000000-0000-0000-0000-000000000000",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects malformed keyId with 400", async () => {
      await registerProject();
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "DELETE",
        url: "/api/projects/acme/keys/not-a-uuid",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/projects/:slug/keys/regenerate", () => {
    it("returns a new plain-text key, rotates the stored hash, and invalidates the old key", async () => {
      const { app, body: registerBody } = await registerProject();

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/acme/keys/regenerate",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.payload);
      expect(result.key).toMatch(/^lore_acme_[A-Za-z0-9]{24}$/);
      expect(result.keyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(result.key).not.toBe(registerBody.api_key);

      // Old key no longer authenticates
      const oldRes = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${registerBody.api_key}` },
      });
      expect(oldRes.statusCode).toBe(401);

      // New key authenticates
      const newRes = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${result.key}` },
      });
      expect(newRes.statusCode).toBe(200);
    });

    it("returns 404 when the project does not exist", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/ghost/keys/regenerate",
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
