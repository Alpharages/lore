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

const proposeRequirement = async (
  app: any,
  apiKey: string,
  overrides: Record<string, unknown> = {}
) => {
  const res = await call(app, apiKey, "propose_project_update", {
    type: "requirement",
    title: "Exports must be paginated",
    statement: "The export API must return at most 500 records per page.",
    evidence: [{ source_kind: "manual", excerpt: "Agreed in the kickoff." }],
    ...overrides,
  });
  return JSON.parse(res.payload);
};

describe("POST /mcp/tools/review_project_update", () => {
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

  it("accepts a proposal and records the reviewing actor (FR-PE-17)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key);

    const res = await call(app, api_key, "review_project_update", {
      item_id,
      action: "accept",
      reviewer: "priya",
      note: "Confirmed with the platform team.",
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe("accepted");

    const row = await pool.query(
      `SELECT status, approved_by, reviewed_at FROM project_evolution_items WHERE id = $1`,
      [item_id]
    );
    expect(row.rows[0].status).toBe("accepted");
    expect(row.rows[0].approved_by).toBe("priya");
    expect(row.rows[0].reviewed_at).not.toBeNull();

    const event = await pool.query(
      `SELECT actor, note FROM project_evolution_events WHERE item_id = $1 AND event_type = 'accepted'`,
      [item_id]
    );
    expect(event.rows[0]).toMatchObject({
      actor: "priya",
      note: "Confirmed with the platform team.",
    });
  });

  it("refuses to accept an item with no evidence (FR-PE-18)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key, { evidence: [] });

    const res = await call(app, api_key, "review_project_update", {
      item_id,
      action: "accept",
      reviewer: "priya",
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload).message).toMatch(/at least one evidence record/);

    const row = await pool.query(`SELECT status FROM project_evolution_items WHERE id = $1`, [
      item_id,
    ]);
    expect(row.rows[0].status).toBe("proposed");
  });

  it("does not count redacted evidence toward the acceptance floor", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const proposal = await proposeRequirement(app, api_key);

    await call(app, api_key, "review_project_update", {
      item_id: proposal.item_id,
      action: "redact_evidence",
      evidence_id: proposal.evidence_ids[0],
      redaction_reason: "Contained personal data",
      reviewer: "priya",
    });

    const res = await call(app, api_key, "review_project_update", {
      item_id: proposal.item_id,
      action: "accept",
      reviewer: "priya",
    });

    expect(res.statusCode).toBe(409);
  });

  it("appends a revision without altering earlier versions (FR-PE-12)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key);

    const res = await call(app, api_key, "review_project_update", {
      item_id,
      action: "revise",
      statement: "The export API must return at most 250 records per page.",
      reviewer: "priya",
      note: "500 was still too slow.",
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).revision).toBe(2);

    const versions = await pool.query(
      `SELECT revision, statement FROM project_evolution_item_versions WHERE item_id = $1 ORDER BY revision`,
      [item_id]
    );
    expect(versions.rows).toHaveLength(2);
    // Revision 1 is untouched — the original proposal remains answerable.
    expect(versions.rows[0].statement).toContain("500 records");
    expect(versions.rows[1].statement).toContain("250 records");

    const item = await pool.query(
      `SELECT revision, statement, status FROM project_evolution_items WHERE id = $1`,
      [item_id]
    );
    expect(item.rows[0].revision).toBe(2);
    expect(item.rows[0].statement).toContain("250 records");
    expect(item.rows[0].status).toBe("proposed");
  });

  it("refuses to revise an accepted item", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key);
    await call(app, api_key, "review_project_update", { item_id, action: "accept" });

    const res = await call(app, api_key, "review_project_update", {
      item_id,
      action: "revise",
      statement: "Quietly rewritten.",
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload).message).toMatch(/superseding item/);
  });

  it("rejects a proposal without deleting it (FR-PE-14, FR-PE-23)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key);

    const res = await call(app, api_key, "review_project_update", {
      item_id,
      action: "reject",
      reviewer: "priya",
      note: "Superseded by an architectural change already in flight.",
    });

    expect(res.statusCode).toBe(200);

    const row = await pool.query(`SELECT status FROM project_evolution_items WHERE id = $1`, [
      item_id,
    ]);
    expect(row.rows[0].status).toBe("rejected");

    const evidence = await pool.query(
      `SELECT count(*)::int AS c FROM project_evolution_evidence WHERE item_id = $1`,
      [item_id]
    );
    expect(evidence.rows[0].c).toBe(1);
  });

  it("supersedes the prior accepted item atomically on acceptance (FR-PE-15, FR-PE-16)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const v1 = await proposeRequirement(app, api_key);
    await call(app, api_key, "review_project_update", { item_id: v1.item_id, action: "accept" });

    const v2 = await proposeRequirement(app, api_key, {
      title: "Exports must be paginated at 250",
      statement: "The export API must return at most 250 records per page.",
      supersedes_item_id: v1.item_id,
      evidence: [{ source_kind: "research", excerpt: "Load test showed 500 still timed out." }],
    });

    const res = await call(app, api_key, "review_project_update", {
      item_id: v2.item_id,
      action: "accept",
      reviewer: "priya",
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).superseded_item_id).toBe(v1.item_id);

    const rows = await pool.query(
      `SELECT id, status, superseded_by_item_id FROM project_evolution_items ORDER BY created_at`
    );
    expect(rows.rows[0]).toMatchObject({
      id: v1.item_id,
      status: "superseded",
      superseded_by_item_id: v2.item_id,
    });
    expect(rows.rows[1]).toMatchObject({ id: v2.item_id, status: "accepted" });

    const relation = await pool.query(
      `SELECT relation_type FROM project_evolution_relations WHERE from_item_id = $1 AND to_item_id = $2`,
      [v2.item_id, v1.item_id]
    );
    expect(relation.rows[0].relation_type).toBe("supersedes");

    const supersededEvent = await pool.query(
      `SELECT count(*)::int AS c FROM project_evolution_events WHERE item_id = $1 AND event_type = 'superseded'`,
      [v1.item_id]
    );
    expect(supersededEvent.rows[0].c).toBe(1);
  });

  it("refuses to supersede an item that is not accepted", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const v1 = await proposeRequirement(app, api_key);
    const v2 = await proposeRequirement(app, api_key, {
      title: "Replacement",
      statement: "A different statement entirely.",
      supersedes_item_id: v1.item_id,
    });

    const res = await call(app, api_key, "review_project_update", {
      item_id: v2.item_id,
      action: "accept",
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload).message).toMatch(/Only an accepted item can be superseded/);

    // The failed acceptance left nothing behind.
    const rows = await pool.query(`SELECT status FROM project_evolution_items ORDER BY created_at`);
    expect(rows.rows.map((r) => r.status)).toEqual(["proposed", "proposed"]);
  });

  it("cannot accept the same item twice", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key);

    await call(app, api_key, "review_project_update", { item_id, action: "accept" });
    const second = await call(app, api_key, "review_project_update", { item_id, action: "accept" });

    expect(second.statusCode).toBe(409);
  });

  it("returns full evidence and review history from inspect (FR-PE-61, FR-PE-64)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key);
    await call(app, api_key, "review_project_update", {
      item_id,
      action: "revise",
      rationale: "Large tenants timed out.",
      reviewer: "priya",
    });

    const res = await call(app, api_key, "review_project_update", { item_id, action: "inspect" });

    expect(res.statusCode).toBe(200);
    const { detail } = JSON.parse(res.payload);
    expect(detail.item.title).toBe("Exports must be paginated");
    expect(detail.item.rationale).toBe("Large tenants timed out.");
    expect(detail.versions).toHaveLength(2);
    expect(detail.evidence[0].excerpt).toBe("Agreed in the kickoff.");
    expect(detail.events.map((e: any) => e.event_type)).toEqual([
      "proposed",
      "evidence_added",
      "revised",
    ]);
  });

  it("supersedes evidence by appending a replacement (FR-PE-27)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const proposal = await proposeRequirement(app, api_key);
    const originalEvidenceId = proposal.evidence_ids[0];

    const res = await call(app, api_key, "review_project_update", {
      item_id: proposal.item_id,
      action: "supersede_evidence",
      evidence_id: originalEvidenceId,
      evidence: [{ source_kind: "manual", excerpt: "Corrected: agreed in the design review." }],
      reviewer: "priya",
    });

    expect(res.statusCode).toBe(200);
    const replacementId = JSON.parse(res.payload).evidence_id;

    const rows = await pool.query(
      `SELECT id, excerpt, superseded_by_evidence_id FROM project_evolution_evidence WHERE item_id = $1 ORDER BY created_at`,
      [proposal.item_id]
    );
    expect(rows.rows).toHaveLength(2);
    // The original row survives intact, pointing at its replacement.
    expect(rows.rows[0].excerpt).toBe("Agreed in the kickoff.");
    expect(rows.rows[0].superseded_by_evidence_id).toBe(replacementId);

    const event = await pool.query(
      `SELECT count(*)::int AS c FROM project_evolution_events WHERE item_id = $1 AND event_type = 'evidence_superseded'`,
      [proposal.item_id]
    );
    expect(event.rows[0].c).toBe(1);
  });

  it("leaves an audited tombstone when evidence is redacted (FR-PE-27, §14.5)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const proposal = await proposeRequirement(app, api_key);

    const res = await call(app, api_key, "review_project_update", {
      item_id: proposal.item_id,
      action: "redact_evidence",
      evidence_id: proposal.evidence_ids[0],
      redaction_reason: "Contained a customer name",
      reviewer: "priya",
    });

    expect(res.statusCode).toBe(200);

    const row = await pool.query(
      `SELECT excerpt, redacted_at, redaction_reason, source_kind FROM project_evolution_evidence WHERE id = $1`,
      [proposal.evidence_ids[0]]
    );
    expect(row.rows[0].excerpt).toBeNull();
    expect(row.rows[0].redacted_at).not.toBeNull();
    expect(row.rows[0].redaction_reason).toBe("Contained a customer name");
    // Provenance survives the erasure.
    expect(row.rows[0].source_kind).toBe("manual");

    const detail = await call(app, api_key, "review_project_update", {
      item_id: proposal.item_id,
      action: "inspect",
    });
    expect(JSON.parse(detail.payload).detail.evidence[0].redacted).toBe(true);
  });

  it("reports redacted evidence distinctly from never-had-evidence (FR-PE-27)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const proposal = await proposeRequirement(app, api_key);
    await call(app, api_key, "review_project_update", {
      item_id: proposal.item_id,
      action: "accept",
    });
    await call(app, api_key, "review_project_update", {
      item_id: proposal.item_id,
      action: "redact_evidence",
      evidence_id: proposal.evidence_ids[0],
      redaction_reason: "GDPR erasure request",
    });

    const detail = JSON.parse(
      (
        await call(app, api_key, "review_project_update", {
          item_id: proposal.item_id,
          action: "inspect",
        })
      ).payload
    ).detail.item;

    // Zero *live* evidence, but the tombstone explains why — a listing surface
    // must not render this as a missing-evidence defect (FR-PE-18).
    expect(detail.evidence_count).toBe(0);
    expect(detail.redacted_evidence_count).toBe(1);
  });

  it("adds evidence to an already-accepted item without rewriting it (FR-PE-24)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");
    const { item_id } = await proposeRequirement(app, api_key);
    await call(app, api_key, "review_project_update", { item_id, action: "accept" });

    const res = await call(app, api_key, "review_project_update", {
      item_id,
      action: "add_evidence",
      evidence: [{ source_kind: "meeting", excerpt: "Reconfirmed at the quarterly review." }],
      reviewer: "priya",
    });

    expect(res.statusCode).toBe(200);
    const row = await pool.query(
      `SELECT status, revision FROM project_evolution_items WHERE id = $1`,
      [item_id]
    );
    expect(row.rows[0]).toMatchObject({ status: "accepted", revision: 1 });

    const evidence = await pool.query(
      `SELECT count(*)::int AS c FROM project_evolution_evidence WHERE item_id = $1`,
      [item_id]
    );
    expect(evidence.rows[0].c).toBe(2);
  });

  it("returns 404 for an item that does not exist", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await call(app, api_key, "review_project_update", {
      item_id: "00000000-0000-0000-0000-000000000000",
      action: "inspect",
    });

    expect(res.statusCode).toBe(404);
  });
});
