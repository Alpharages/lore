import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import * as embedding from "../../src/services/embedding.js";

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

describe("POST /mcp/tools/link_project_updates", () => {
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

  it("creates each supported relation type (FR-PE-30)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const a = await proposeItem(app, api_key, { title: "A", statement: "Statement A." });
    const b = await proposeItem(app, api_key, { title: "B", statement: "Statement B." });

    for (const relationType of [
      "supports",
      "contradicts",
      "caused_by",
      "implements",
      "related_to",
    ]) {
      const res = await call(app, api_key, "link_project_updates", {
        from_item_id: a.item_id,
        to_item_id: b.item_id,
        relation_type: relationType,
        actor: "priya",
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).relation_type).toBe(relationType);
    }

    const rows = await pool.query(
      `SELECT relation_type FROM project_evolution_relations WHERE from_item_id = $1 ORDER BY relation_type`,
      [a.item_id]
    );
    expect(rows.rows).toHaveLength(5);
  });

  it("refuses a supersedes relation created by linking (FR-PE-15)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const a = await proposeItem(app, api_key, { title: "A", statement: "Statement A." });
    const b = await proposeItem(app, api_key, { title: "B", statement: "Statement B." });

    const res = await call(app, api_key, "link_project_updates", {
      from_item_id: a.item_id,
      to_item_id: b.item_id,
      relation_type: "supersedes",
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toMatch(/accepting a superseding item/);
  });

  it("is idempotent when the same relation is created twice", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const a = await proposeItem(app, api_key, { title: "A", statement: "Statement A." });
    const b = await proposeItem(app, api_key, { title: "B", statement: "Statement B." });

    const payload = {
      from_item_id: a.item_id,
      to_item_id: b.item_id,
      relation_type: "supports",
    };
    const first = await call(app, api_key, "link_project_updates", payload);
    const second = await call(app, api_key, "link_project_updates", payload);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.payload).already_existed).toBe(true);

    const rows = await pool.query(`SELECT count(*)::int AS c FROM project_evolution_relations`);
    expect(rows.rows[0].c).toBe(1);
  });

  it("retracts a relation by stamping it, never deleting it (§11.5)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const a = await proposeItem(app, api_key, { title: "A", statement: "Statement A." });
    const b = await proposeItem(app, api_key, { title: "B", statement: "Statement B." });

    await call(app, api_key, "link_project_updates", {
      from_item_id: a.item_id,
      to_item_id: b.item_id,
      relation_type: "supports",
    });

    const res = await call(app, api_key, "link_project_updates", {
      action: "retract",
      from_item_id: a.item_id,
      to_item_id: b.item_id,
      relation_type: "supports",
      actor: "priya",
    });

    expect(res.statusCode).toBe(200);

    const rows = await pool.query(
      `SELECT retracted_at, retracted_by FROM project_evolution_relations`
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].retracted_at).not.toBeNull();
    expect(rows.rows[0].retracted_by).toBe("priya");

    const events = await pool.query(
      `SELECT count(*)::int AS c FROM project_evolution_events WHERE event_type = 'relation_retracted'`
    );
    expect(events.rows[0].c).toBe(1);
  });

  it("rejects a self-referential relation", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const a = await proposeItem(app, api_key, { title: "A", statement: "Statement A." });

    const res = await call(app, api_key, "link_project_updates", {
      from_item_id: a.item_id,
      to_item_id: a.item_id,
      relation_type: "supports",
    });

    expect(res.statusCode).toBe(400);
  });

  it("refuses a relation whose endpoint is in another project (FR-PE-31)", async () => {
    const app = buildTestApp(pool, db);
    const acme = await registerProject(app, "acme");
    const other = await registerProject(app, "other");

    const mine = await proposeItem(app, acme.api_key, { title: "A", statement: "Statement A." });
    const theirs = await proposeItem(app, other.api_key, {
      title: "B",
      statement: "Statement B in another project.",
    });

    const res = await call(app, acme.api_key, "link_project_updates", {
      from_item_id: mine.item_id,
      to_item_id: theirs.item_id,
      relation_type: "supports",
    });

    expect(res.statusCode).toBe(404);
  });

  it("links an item to a Lore session (FR-PE-45)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const session = JSON.parse(
      (
        await call(app, api_key, "start_session", {
          repo_slug: "backend",
          branch: "feat/pagination",
        })
      ).payload
    );

    const item = await proposeItem(app, api_key, {
      title: "Paginated exports",
      statement: "Exports return at most 500 records per page.",
    });

    const res = await call(app, api_key, "link_project_updates", {
      item_id: item.item_id,
      session_id: session.session_id,
      actor: "dana",
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).target_kind).toBe("session");

    const rows = await pool.query(
      `SELECT target_kind, session_id FROM project_evolution_links WHERE item_id = $1`,
      [item.item_id]
    );
    expect(rows.rows[0]).toMatchObject({
      target_kind: "session",
      session_id: session.session_id,
    });
  });

  it("links an item to an external task", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const item = await proposeItem(app, api_key, { title: "A", statement: "Statement A." });

    const res = await call(app, api_key, "link_project_updates", {
      item_id: item.item_id,
      external_task_id: "CU-8899",
      external_task_ref: "https://app.clickup.com/t/8899",
      external_tracker_type: "clickup",
    });

    expect(res.statusCode).toBe(201);
    const rows = await pool.query(
      `SELECT target_kind, external_task_id, external_tracker_type FROM project_evolution_links WHERE item_id = $1`,
      [item.item_id]
    );
    expect(rows.rows[0]).toMatchObject({
      target_kind: "task",
      external_task_id: "CU-8899",
      external_tracker_type: "clickup",
    });
  });

  it("refuses to link a session from another project", async () => {
    const app = buildTestApp(pool, db);
    const acme = await registerProject(app, "acme");
    const other = await registerProject(app, "other");

    const theirSession = JSON.parse(
      (
        await call(app, other.api_key, "start_session", {
          repo_slug: "backend",
          branch: "main",
        })
      ).payload
    );
    const item = await proposeItem(app, acme.api_key, { title: "A", statement: "Statement A." });

    const res = await call(app, acme.api_key, "link_project_updates", {
      item_id: item.item_id,
      session_id: theirSession.session_id,
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects a request that mixes a relation and an entity link", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const a = await proposeItem(app, api_key, { title: "A", statement: "Statement A." });
    const b = await proposeItem(app, api_key, { title: "B", statement: "Statement B." });

    const res = await call(app, api_key, "link_project_updates", {
      from_item_id: a.item_id,
      to_item_id: b.item_id,
      relation_type: "supports",
      external_task_id: "CU-1",
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /mcp/tools/get_project_history", () => {
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

  it("returns lifecycle events in reverse chronological order (FR-PE-39)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const item = await proposeItem(app, api_key, {
      title: "Paginated exports",
      statement: "Exports return at most 500 records per page.",
    });
    await call(app, api_key, "review_project_update", {
      item_id: item.item_id,
      action: "accept",
      reviewer: "priya",
    });

    const res = await call(app, api_key, "get_project_history", {});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.events[0].event_type).toBe("accepted");
    expect(body.events.map((e: any) => e.event_type)).toContain("proposed");
    expect(body.total_items).toBe(1);
  });

  it("includes rejected and superseded items that current state hides (FR-PE-23)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const rejected = await proposeItem(app, api_key, {
      title: "Rejected idea",
      statement: "This one was turned down.",
    });
    await call(app, api_key, "review_project_update", {
      item_id: rejected.item_id,
      action: "reject",
    });

    const history = JSON.parse((await call(app, api_key, "get_project_history", {})).payload);
    expect(history.items.map((i: any) => i.id)).toContain(rejected.item_id);

    const current = JSON.parse((await call(app, api_key, "query_project_context", {})).payload);
    expect(current.items.map((i: any) => i.id)).not.toContain(rejected.item_id);
  });

  it("shows supersession and contradiction relationships (FR-PE-40)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const v1 = await proposeItem(app, api_key, {
      title: "Quarterly invoicing",
      statement: "Customers are invoiced quarterly.",
    });
    await call(app, api_key, "review_project_update", { item_id: v1.item_id, action: "accept" });

    const v2 = await proposeItem(app, api_key, {
      title: "Monthly invoicing",
      statement: "Customers are invoiced monthly.",
      supersedes_item_id: v1.item_id,
    });
    await call(app, api_key, "review_project_update", { item_id: v2.item_id, action: "accept" });

    const body = JSON.parse((await call(app, api_key, "get_project_history", {})).payload);
    const superseded = body.items.find((i: any) => i.id === v1.item_id);

    expect(superseded.status).toBe("superseded");
    expect(superseded.relations.some((r: any) => r.relation_type === "supersedes")).toBe(true);
  });

  it("filters by status, type and item", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const requirement = await proposeItem(app, api_key, {
      title: "A requirement",
      statement: "A requirement statement.",
    });
    await proposeItem(app, api_key, {
      type: "constraint",
      title: "A constraint",
      statement: "A constraint statement.",
    });
    await call(app, api_key, "review_project_update", {
      item_id: requirement.item_id,
      action: "accept",
    });

    const byStatus = JSON.parse(
      (await call(app, api_key, "get_project_history", { statuses: ["proposed"] })).payload
    );
    expect(byStatus.items).toHaveLength(1);
    expect(byStatus.items[0].type).toBe("constraint");

    const byType = JSON.parse(
      (await call(app, api_key, "get_project_history", { types: ["requirement"] })).payload
    );
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0].id).toBe(requirement.item_id);

    const byItem = JSON.parse(
      (await call(app, api_key, "get_project_history", { item_id: requirement.item_id })).payload
    );
    expect(byItem.events.every((e: any) => e.item_id === requirement.item_id)).toBe(true);
  });

  it("rejects a date filter that is not a valid timestamp", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await call(app, api_key, "get_project_history", { since: "not-a-date" });
    expect(res.statusCode).toBe(400);
  });

  it("paginates with limit and offset", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    for (let i = 0; i < 3; i += 1) {
      await proposeItem(app, api_key, { title: `Item ${i}`, statement: `Statement number ${i}.` });
    }

    const page1 = JSON.parse(
      (await call(app, api_key, "get_project_history", { limit: 2, offset: 0 })).payload
    );
    const page2 = JSON.parse(
      (await call(app, api_key, "get_project_history", { limit: 2, offset: 2 })).payload
    );

    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    expect(page1.total_items).toBe(3);
    const ids = new Set([...page1.items, ...page2.items].map((i: any) => i.id));
    expect(ids.size).toBe(3);
  });
});
