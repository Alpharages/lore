import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import * as embedding from "../../src/services/embedding.js";
import { ignoreHonoSocketDestroySoonNoise } from "../helpers/hono-socket-noise.js";

// This file drives the MCP Streamable HTTP transport (POST /mcp).
ignoreHonoSocketDestroySoonNoise();

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

const registerProject = async (app: any, slug: string) => {
  const res = await app.inject({
    method: "POST",
    url: "/api/projects/register",
    headers: { "x-admin-secret": ADMIN_SECRET, "content-type": "application/json" },
    payload: { name: slug, slug, repos: [{ slug: "backend" }] },
  });
  return JSON.parse(res.payload);
};

const call = (app: any, apiKey: string, tool: string, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: `/mcp/tools/${tool}`,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    payload,
  });

const adminGet = (app: any, url: string) =>
  app.inject({ method: "GET", url, headers: { "x-admin-secret": ADMIN_SECRET } });

const adminPost = (app: any, url: string, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url,
    headers: { "x-admin-secret": ADMIN_SECRET, "content-type": "application/json" },
    payload,
  });

const proposeItem = async (app: any, apiKey: string, overrides: Record<string, unknown>) =>
  JSON.parse(
    (
      await call(app, apiKey, "propose_project_update", {
        type: "requirement",
        evidence: [{ source_kind: "manual", excerpt: "Fixture evidence." }],
        ...overrides,
      })
    ).payload
  );

/** Web UI surface — FR-PE-60 … FR-PE-65. */
describe("REST /api/project-evolution", () => {
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

  it("rejects a request with no admin secret", async () => {
    const app = buildTestApp(pool, db);
    await registerProject(app, "acme");

    const res = await app.inject({
      method: "GET",
      url: "/api/project-evolution/current?project=acme",
    });
    expect(res.statusCode).toBe(401);
  });

  it("requires the project query parameter", async () => {
    const app = buildTestApp(pool, db);
    await registerProject(app, "acme");

    const res = await adminGet(app, "/api/project-evolution/current");
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown project", async () => {
    const app = buildTestApp(pool, db);
    await registerProject(app, "acme");

    const res = await adminGet(app, "/api/project-evolution/current?project=nope");
    expect(res.statusCode).toBe(404);
  });

  it("lists proposals for the review inbox (FR-PE-60)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await proposeItem(app, api_key, { title: "Pending one", statement: "Awaiting review." });
    const accepted = await proposeItem(app, api_key, {
      title: "Already accepted",
      statement: "This one is settled.",
    });
    await call(app, api_key, "review_project_update", {
      item_id: accepted.item_id,
      action: "accept",
    });

    const res = await adminGet(app, "/api/project-evolution/proposals?project=acme");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.total).toBe(1);
    expect(body.items[0].title).toBe("Pending one");
    expect(body.items[0].evidence_count).toBe(1);
  });

  it("returns current state for the context view (FR-PE-62)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const requirement = await proposeItem(app, api_key, {
      title: "A requirement",
      statement: "A requirement statement.",
    });
    const constraint = await proposeItem(app, api_key, {
      type: "constraint",
      title: "A constraint",
      statement: "A constraint statement.",
    });
    for (const item of [requirement, constraint]) {
      await call(app, api_key, "review_project_update", {
        item_id: item.item_id,
        action: "accept",
      });
    }

    const all = JSON.parse(
      (await adminGet(app, "/api/project-evolution/current?project=acme")).payload
    );
    expect(all.total).toBe(2);
    expect(new Set(all.items.map((i: any) => i.type))).toEqual(
      new Set(["requirement", "constraint"])
    );

    const filtered = JSON.parse(
      (await adminGet(app, "/api/project-evolution/current?project=acme&types=constraint")).payload
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].type).toBe("constraint");
  });

  it("returns the timeline (FR-PE-63)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const item = await proposeItem(app, api_key, { title: "Tracked", statement: "A statement." });
    await call(app, api_key, "review_project_update", {
      item_id: item.item_id,
      action: "accept",
      reviewer: "priya",
    });

    const res = await adminGet(app, "/api/project-evolution/history?project=acme");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.events[0].event_type).toBe("accepted");
    expect(body.events[0].actor).toBe("priya");
  });

  it("returns item detail with evidence, versions, events and relations (FR-PE-64)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const item = await proposeItem(app, api_key, {
      title: "Detailed item",
      statement: "A statement with detail.",
      rationale: "Because the old approach failed.",
    });

    const res = await adminGet(app, `/api/project-evolution/items/${item.item_id}?project=acme`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.item.title).toBe("Detailed item");
    expect(body.item.rationale).toBe("Because the old approach failed.");
    expect(body.versions).toHaveLength(1);
    // FR-PE-61: reviewers see the full excerpt before accepting.
    expect(body.evidence[0].excerpt).toBe("Fixture evidence.");
    expect(body.events.map((e: any) => e.event_type)).toContain("proposed");
    expect(body.relations).toEqual([]);
  });

  it("accepts and rejects from the Web UI (FR-PE-13)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const toAccept = await proposeItem(app, api_key, {
      title: "Accept me",
      statement: "Accept this statement.",
    });
    const toReject = await proposeItem(app, api_key, {
      title: "Reject me",
      statement: "Reject this statement.",
    });

    const accept = await adminPost(
      app,
      `/api/project-evolution/items/${toAccept.item_id}/review?project=acme`,
      { action: "accept", reviewer: "web-ui-user" }
    );
    expect(accept.statusCode).toBe(200);
    expect(JSON.parse(accept.payload).status).toBe("accepted");

    const reject = await adminPost(
      app,
      `/api/project-evolution/items/${toReject.item_id}/review?project=acme`,
      { action: "reject", reviewer: "web-ui-user", note: "Out of scope." }
    );
    expect(reject.statusCode).toBe(200);
    expect(JSON.parse(reject.payload).status).toBe("rejected");

    const inbox = JSON.parse(
      (await adminGet(app, "/api/project-evolution/proposals?project=acme")).payload
    );
    expect(inbox.total).toBe(0);
  });

  it("surfaces unresolved contradictions on the current-state view (FR-PE-22)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const a = await proposeItem(app, api_key, {
      type: "constraint",
      title: "Retention 90 days",
      statement: "Telemetry is retained for 90 days.",
    });
    const b = await proposeItem(app, api_key, {
      type: "constraint",
      title: "Retention one year",
      statement: "Telemetry is retained for 365 days.",
    });
    for (const item of [a, b]) {
      await call(app, api_key, "review_project_update", {
        item_id: item.item_id,
        action: "accept",
      });
    }
    await call(app, api_key, "link_project_updates", {
      from_item_id: a.item_id,
      to_item_id: b.item_id,
      relation_type: "contradicts",
    });

    const body = JSON.parse(
      (await adminGet(app, "/api/project-evolution/current?project=acme")).payload
    );
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0].kind).toBe("unresolved_contradiction");
  });

  it("cannot reach another project's item through the project query parameter", async () => {
    const app = buildTestApp(pool, db);
    await registerProject(app, "acme");
    const other = await registerProject(app, "other");

    const theirs = await proposeItem(app, other.api_key, {
      title: "Other project item",
      statement: "This belongs to the other project.",
    });

    const res = await adminGet(app, `/api/project-evolution/items/${theirs.item_id}?project=acme`);
    expect(res.statusCode).toBe(404);
  });

  it("exports project history as versioned JSON and as JSON Lines (NFR-PE-11)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const item = await proposeItem(app, api_key, {
      title: "Exported item",
      statement: "This statement is exported.",
      evidence: [{ source_kind: "manual", excerpt: "Sensitive excerpt." }],
    });
    await call(app, api_key, "review_project_update", {
      item_id: item.item_id,
      action: "accept",
    });

    const json = JSON.parse(
      (await adminGet(app, "/api/project-evolution/export?project=acme")).payload
    );
    expect(json.version).toBe("1.0");
    expect(json.records.some((r: any) => r.kind === "item")).toBe(true);
    expect(json.records.some((r: any) => r.kind === "evidence")).toBe(true);
    expect(json.records.some((r: any) => r.kind === "event")).toBe(true);
    // §14.6: excerpts stay out of a routine export.
    const evidenceRecord = json.records.find((r: any) => r.kind === "evidence");
    expect(evidenceRecord.excerpt).toBeUndefined();

    const jsonl = await adminGet(app, "/api/project-evolution/export?project=acme&format=jsonl");
    expect(jsonl.headers["content-type"]).toContain("application/x-ndjson");
    const lines = jsonl.payload.trim().split("\n");
    expect(lines.length).toBe(json.records.length);
    expect(() => lines.forEach((line: string) => JSON.parse(line))).not.toThrow();

    const withExcerpts = JSON.parse(
      (await adminGet(app, "/api/project-evolution/export?project=acme&include_excerpts=true"))
        .payload
    );
    expect(withExcerpts.records.find((r: any) => r.kind === "evidence").excerpt).toBe(
      "Sensitive excerpt."
    );
  });
});

/** The standard MCP Streamable HTTP transport must expose the same five tools. */
describe("MCP JSON-RPC — Project Evolution tools", () => {
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

  const rpc = (app: any, apiKey: string, body: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: body,
    });

  it("lists the five Project Evolution tools", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await rpc(app, api_key, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.statusCode).toBe(200);

    const names = JSON.parse(res.payload).result.tools.map((t: any) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "propose_project_update",
        "review_project_update",
        "query_project_context",
        "get_project_history",
        "link_project_updates",
      ])
    );
  });

  it("proposes, accepts and queries through JSON-RPC", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const proposeRes = await rpc(app, api_key, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "propose_project_update",
        arguments: {
          type: "decision",
          title: "Adopt trunk-based development",
          statement: "All work merges to main behind feature flags.",
          evidence: [{ source_kind: "meeting", excerpt: "Team agreed in the retro." }],
        },
      },
    });
    expect(proposeRes.statusCode).toBe(200);
    const proposed = JSON.parse(JSON.parse(proposeRes.payload).result.content[0].text);
    expect(proposed.status).toBe("proposed");

    const acceptRes = await rpc(app, api_key, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "review_project_update",
        arguments: { item_id: proposed.item_id, action: "accept", reviewer: "priya" },
      },
    });
    const accepted = JSON.parse(JSON.parse(acceptRes.payload).result.content[0].text);
    expect(accepted.status).toBe("accepted");

    const queryRes = await rpc(app, api_key, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "query_project_context", arguments: { query: "trunk based development" } },
    });
    const context = JSON.parse(JSON.parse(queryRes.payload).result.content[0].text);
    expect(context.items.map((i: any) => i.id)).toContain(proposed.item_id);
  });

  it("rolls back the transaction when a tool call fails", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await rpc(app, api_key, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "propose_project_update",
        arguments: {
          type: "requirement",
          // Neither structured fields nor a usable excerpt: the service throws.
          evidence: [{ source_kind: "manual", source_reference: "https://example.test" }],
        },
      },
    });

    expect(JSON.parse(res.payload).result.isError).toBe(true);

    const rows = await pool.query(`SELECT count(*)::int AS c FROM project_evolution_items`);
    expect(rows.rows[0].c).toBe(0);
  });
});
