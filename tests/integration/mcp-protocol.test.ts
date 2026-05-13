import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

const MCP_ACCEPT = "application/json, text/event-stream";

// @hono/node-server calls socket.destroySoon() on a timeout, but Fastify's
// inject-based mock streams don't implement it. Swallow those specific errors
// so they don't pollute the test output.
const originalListeners = process.listeners("uncaughtException");
process.removeAllListeners("uncaughtException");
process.on("uncaughtException", (err) => {
  if (err instanceof TypeError && err.message.includes("socket.destroySoon is not a function")) {
    return;
  }
  originalListeners.forEach((fn) => fn(err));
});

describe("MCP Streamable HTTP Protocol", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;

  beforeAll(async () => {
    pool = createTestPool();
    db = createTestDb(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  async function registerProject(app: any, slug: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/register",
      headers: {
        "x-admin-secret": ADMIN_SECRET,
        "content-type": "application/json",
      },
      payload: { name: slug, slug },
    });
    return JSON.parse(res.payload);
  }

  it("returns 405 on GET /mcp", async () => {
    const app = buildTestApp(pool, db);
    const res = await app.inject({ method: "GET", url: "/mcp" });
    expect(res.statusCode).toBe(405);
  });

  it("returns 401 on POST /mcp without auth", async () => {
    const app = buildTestApp(pool, db);
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it("handles MCP initialize handshake", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
        accept: MCP_ACCEPT,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result.serverInfo.name).toBe("lore-memory");
  });

  it("lists all 13 tools via tools/list", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    // initialize first
    await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
        accept: MCP_ACCEPT,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
        accept: MCP_ACCEPT,
      },
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result.tools).toHaveLength(13);
    const names = body.result.tools.map((t: any) => t.name);
    expect(names).toContain("save_lesson");
    expect(names).toContain("increment_occurrence");
    expect(names).toContain("query_lessons");
    expect(names).toContain("search_similar");
    expect(names).toContain("start_session");
    expect(names).toContain("end_session");
    expect(names).toContain("start_session_from_task");
    expect(names).toContain("query_lessons_for_task");
    expect(names).toContain("link_lessons_to_task");
    expect(names).toContain("get_pending_propagations");
    expect(names).toContain("accept_propagation");
    expect(names).toContain("reject_propagation");
    expect(names).toContain("capture_review_finding");
  });

  it("calls save_lesson via tools/call", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    // initialize
    await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
        accept: MCP_ACCEPT,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
        accept: MCP_ACCEPT,
      },
      payload: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "save_lesson",
          arguments: {
            title: "Test Lesson",
            problem: "A problem",
            fix: "The fix",
            prevention_rule: "The rule",
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result.content[0].text).toContain("lesson_id");
    expect(body.result.content[0].text).toContain('"action":"created"');
  });

  it("returns error for unknown tool name", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    // initialize
    await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
        accept: MCP_ACCEPT,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
        accept: MCP_ACCEPT,
      },
      payload: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "nonexistent_tool",
          arguments: {},
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Tool nonexistent_tool not found");
  });
});
