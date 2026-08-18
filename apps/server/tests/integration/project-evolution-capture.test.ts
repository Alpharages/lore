import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { EMBEDDING_DIMENSIONS } from "../helpers/embedding-dim.js";
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

const propose = (app: any, apiKey: string, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/mcp/tools/propose_project_update",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    payload,
  });

const manualEvidence = (overrides: Record<string, unknown> = {}) => ({
  source_kind: "manual",
  excerpt: "Recorded during the kickoff planning session.",
  ...overrides,
});

describe("POST /mcp/tools/propose_project_update", () => {
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

  it("captures a structured requirement as proposed, never accepted (FR-PE-11)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "requirement",
      title: "Exports must be paginated",
      statement: "The export API must return at most 500 records per page.",
      rationale: "Full exports timed out for the largest tenant.",
      proposed_by: "dana",
      evidence: [manualEvidence()],
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("proposed");
    expect(body.action).toBe("created");
    expect(body.revision).toBe(1);
    expect(body.needs_review).toBe(true);
    expect(body.extraction).toBe("structured");
    expect(body.evidence_ids).toHaveLength(1);

    const row = await pool.query(
      `SELECT status, type, revision, proposed_by, embedding_status FROM project_evolution_items WHERE id = $1`,
      [body.item_id]
    );
    expect(row.rows[0]).toMatchObject({
      status: "proposed",
      type: "requirement",
      revision: 1,
      proposed_by: "dana",
      embedding_status: "pending",
    });
  });

  it("writes revision 1 to the append-only version table and a proposed event", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "decision",
      title: "Use PostgreSQL full-text search",
      statement: "Lexical retrieval uses PostgreSQL tsvector rather than a separate engine.",
      evidence: [manualEvidence()],
    });
    const { item_id } = JSON.parse(res.payload);

    const versions = await pool.query(
      `SELECT revision, title FROM project_evolution_item_versions WHERE item_id = $1`,
      [item_id]
    );
    expect(versions.rows).toHaveLength(1);
    expect(versions.rows[0].revision).toBe(1);

    const events = await pool.query(
      `SELECT event_type FROM project_evolution_events WHERE item_id = $1 ORDER BY created_at`,
      [item_id]
    );
    expect(events.rows.map((r) => r.event_type)).toEqual(["proposed", "evidence_added"]);
  });

  it("rejects an unknown item type", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "rumour",
      title: "Something",
      statement: "Someone said something.",
      evidence: [manualEvidence()],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe("validation_error");
  });

  it("rejects an attempt to forge a status field (additionalProperties: false)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "requirement",
      title: "Sneaky",
      statement: "This proposal tries to accept itself.",
      status: "accepted",
      evidence: [manualEvidence()],
    });

    expect(res.statusCode).toBe(400);
  });

  it("is idempotent for a repeated external_source_id (FR-PE-07)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const payload = {
      type: "constraint",
      title: "GDPR requires EU data residency",
      statement: "Customer data for EU tenants must remain in the EU region.",
      evidence: [
        {
          source_kind: "slack",
          external_source_id: "C123/p1700000000",
          source_reference: "https://slack.example/archives/C123/p1700000000",
          excerpt: "Legal confirmed EU tenants cannot be served from us-east-1.",
          provided_by: "adapter",
        },
      ],
    };

    const first = await propose(app, api_key, payload);
    const second = await propose(app, api_key, payload);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);

    const firstBody = JSON.parse(first.payload);
    const secondBody = JSON.parse(second.payload);
    expect(secondBody.item_id).toBe(firstBody.item_id);
    expect(secondBody.idempotent).toBe(true);
    expect(secondBody.action).toBe("existing");

    const count = await pool.query(`SELECT count(*)::int AS c FROM project_evolution_items`);
    expect(count.rows[0].c).toBe(1);

    const evidenceCount = await pool.query(
      `SELECT count(*)::int AS c FROM project_evolution_evidence`
    );
    expect(evidenceCount.rows[0].c).toBe(1);
  });

  it("collapses an exact duplicate statement onto the existing item (FR-PE-08)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const first = await propose(app, api_key, {
      type: "requirement",
      title: "Rate limiting",
      statement: "The public API must rate limit to 100 requests per minute.",
      evidence: [manualEvidence()],
    });

    // Same statement, different casing and spacing, different title.
    const second = await propose(app, api_key, {
      type: "requirement",
      title: "API throttling",
      statement: "The Public API   must rate limit to 100 requests per minute.",
      evidence: [manualEvidence({ source_kind: "meeting", excerpt: "Reconfirmed in standup." })],
    });

    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.payload);
    expect(secondBody.action).toBe("duplicate");
    expect(secondBody.item_id).toBe(JSON.parse(first.payload).item_id);

    const items = await pool.query(`SELECT count(*)::int AS c FROM project_evolution_items`);
    expect(items.rows[0].c).toBe(1);

    // The second capture's evidence still lands — more support for a statement
    // already on file is a gain, not noise.
    const evidence = await pool.query(
      `SELECT source_kind FROM project_evolution_evidence WHERE item_id = $1 ORDER BY created_at`,
      [secondBody.item_id]
    );
    expect(evidence.rows.map((r) => r.source_kind)).toEqual(["manual", "meeting"]);
  });

  it("suggests semantic duplicates without merging them (FR-PE-09)", async () => {
    const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    vec[0] = 1;
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const first = await propose(app, api_key, {
      type: "requirement",
      title: "Session timeout",
      statement: "Sessions expire after 30 minutes of inactivity.",
      evidence: [manualEvidence()],
    });

    const second = await propose(app, api_key, {
      type: "requirement",
      title: "Idle logout",
      statement: "An idle user is logged out after half an hour.",
      evidence: [manualEvidence()],
    });

    const body = JSON.parse(second.payload);
    expect(second.statusCode).toBe(201);
    expect(body.action).toBe("created");
    expect(body.duplicate_suggestions.map((d: any) => d.id)).toContain(
      JSON.parse(first.payload).item_id
    );

    // Suggested, never merged: both items exist independently.
    const items = await pool.query(`SELECT count(*)::int AS c FROM project_evolution_items`);
    expect(items.rows[0].c).toBe(2);
  });

  it("drafts title and statement from an evidence excerpt when they are omitted (FR-PE-02)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "research_finding",
      capture_mode: "adapter",
      evidence: [
        {
          source_kind: "research",
          excerpt:
            "Benchmarks show pgvector HNSW beats ivfflat above 100k rows. We measured a 4x recall improvement at equal latency.",
          provided_by: "ai_agent",
        },
      ],
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.extraction).toBe("deterministic_draft");
    expect(body.status).toBe("proposed");
    expect(body.needs_review).toBe(true);

    const row = await pool.query(
      `SELECT title, statement, capture_mode FROM project_evolution_items WHERE id = $1`,
      [body.item_id]
    );
    expect(row.rows[0].title).toBe("Benchmarks show pgvector HNSW beats ivfflat above 100k rows.");
    expect(row.rows[0].statement).toContain("4x recall improvement");
    expect(row.rows[0].capture_mode).toBe("adapter");
  });

  it("refuses a capture with neither structured fields nor a usable excerpt", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "requirement",
      evidence: [{ source_kind: "manual", source_reference: "https://example.test/doc" }],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toMatch(/title and statement are required/);
  });

  it("records AI confidence and model for audit but still yields a proposal (FR-PE-10, FR-PE-51)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "scope_change",
      title: "Drop the mobile app from v1",
      statement: "The v1 release ships web only; the mobile app moves to v2.",
      capture_mode: "ai_assisted",
      ai_confidence: 0.99,
      ai_model: "test-extractor-1",
      evidence: [manualEvidence()],
    });

    const body = JSON.parse(res.payload);
    expect(body.status).toBe("proposed");

    const row = await pool.query(
      `SELECT ai_confidence, ai_model, capture_mode, status FROM project_evolution_items WHERE id = $1`,
      [body.item_id]
    );
    expect(Number(row.rows[0].ai_confidence)).toBeCloseTo(0.99);
    expect(row.rows[0].ai_model).toBe("test-extractor-1");
    expect(row.rows[0].capture_mode).toBe("ai_assisted");
    // Highest possible confidence, still only proposed.
    expect(row.rows[0].status).toBe("proposed");
  });

  it("rejects ai_confidence outside 0..1", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "decision",
      title: "Overconfident",
      statement: "Confidence is out of range.",
      ai_confidence: 1.5,
      evidence: [manualEvidence()],
    });

    expect(res.statusCode).toBe(400);
  });

  it("accepts an unknown source_kind so adapters need no core release (FR-PE-58)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "constraint",
      title: "Vendor SLA caps throughput",
      statement: "The payments vendor caps us at 50 transactions per second.",
      evidence: [
        {
          source_kind: "notion",
          source_reference: "https://notion.example/vendor-sla",
          excerpt: "Contract section 4.2 caps throughput at 50 TPS.",
        },
      ],
    });

    expect(res.statusCode).toBe(201);
    const row = await pool.query(
      `SELECT source_kind FROM project_evolution_evidence WHERE item_id = $1`,
      [JSON.parse(res.payload).item_id]
    );
    expect(row.rows[0].source_kind).toBe("notion");
  });

  it("stores the captured proposal even when the embedding provider fails (NFR-PE-08)", async () => {
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);

    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await propose(app, api_key, {
      type: "requirement",
      title: "Audit log retention",
      statement: "Audit logs are retained for seven years.",
      evidence: [manualEvidence({ excerpt: "Compliance mandated a seven-year window." })],
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.embedding_status).toBe("pending");

    const evidenceRow = await pool.query(
      `SELECT excerpt FROM project_evolution_evidence WHERE item_id = $1`,
      [body.item_id]
    );
    expect(evidenceRow.rows[0].excerpt).toBe("Compliance mandated a seven-year window.");
  });

  it("requires authentication", async () => {
    const app = buildTestApp(pool, db);
    await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/propose_project_update",
      headers: { "content-type": "application/json" },
      payload: { type: "requirement", title: "x", statement: "y" },
    });

    expect(res.statusCode).toBe(401);
  });
});
