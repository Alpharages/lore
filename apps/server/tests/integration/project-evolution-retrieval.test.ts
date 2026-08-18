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

const call = (app: any, apiKey: string, tool: string, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: `/mcp/tools/${tool}`,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    payload,
  });

/** Propose and immediately accept, which is how a fixture becomes current state. */
const acceptedItem = async (
  app: any,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<string> => {
  const proposed = JSON.parse(
    (
      await call(app, apiKey, "propose_project_update", {
        evidence: [{ source_kind: "manual", excerpt: "Fixture evidence." }],
        ...payload,
      })
    ).payload
  );
  await call(app, apiKey, "review_project_update", {
    item_id: proposed.item_id,
    action: "accept",
    reviewer: "fixture",
  });
  return proposed.item_id;
};

describe("POST /mcp/tools/query_project_context", () => {
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
    // No embedding provider by default: the lexical branch must carry the
    // feature on its own (NFR-PE-07).
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
  });

  it("returns the current accepted state when no query is supplied (FR-PE-19)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await acceptedItem(app, api_key, {
      type: "requirement",
      title: "Paginated exports",
      statement: "Exports return at most 500 records per page.",
    });
    await acceptedItem(app, api_key, {
      type: "constraint",
      title: "EU data residency",
      statement: "EU tenant data stays in the EU region.",
    });

    const res = await call(app, api_key, "query_project_context", {});

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.count).toBe(2);
    expect(body.items.every((i: any) => i.status === "accepted")).toBe(true);
    expect(body.items.every((i: any) => i.match_reasons.includes("current_state"))).toBe(true);
  });

  it("excludes proposed, rejected and superseded items from current state (FR-PE-23)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await acceptedItem(app, api_key, {
      type: "requirement",
      title: "Accepted requirement",
      statement: "This one is current.",
    });

    // A proposal nobody has reviewed.
    await call(app, api_key, "propose_project_update", {
      type: "requirement",
      title: "Still under discussion",
      statement: "This one is only proposed.",
      evidence: [{ source_kind: "manual", excerpt: "Someone mentioned it." }],
    });

    // A rejected proposal.
    const rejected = JSON.parse(
      (
        await call(app, api_key, "propose_project_update", {
          type: "requirement",
          title: "Rejected idea",
          statement: "This one was turned down.",
          evidence: [{ source_kind: "manual", excerpt: "Raised and dismissed." }],
        })
      ).payload
    );
    await call(app, api_key, "review_project_update", {
      item_id: rejected.item_id,
      action: "reject",
    });

    const res = await call(app, api_key, "query_project_context", {});
    const body = JSON.parse(res.payload);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe("Accepted requirement");
  });

  it("matches on full text with no embedding provider configured (FR-PE-54, NFR-PE-07)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await acceptedItem(app, api_key, {
      type: "constraint",
      title: "Payment vendor throughput",
      statement: "The payments vendor caps throughput at 50 transactions per second.",
    });
    await acceptedItem(app, api_key, {
      type: "requirement",
      title: "Dark mode",
      statement: "The dashboard supports a dark colour theme.",
    });

    const res = await call(app, api_key, "query_project_context", {
      query: "payment throughput limits",
    });

    const body = JSON.parse(res.payload);
    expect(body.degraded).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].title).toBe("Payment vendor throughput");
    expect(body.items[0].match_reasons).toContain("text");
  });

  it("cites evidence and the reason each item matched (FR-PE-38)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await acceptedItem(app, api_key, {
      type: "decision",
      title: "Postgres for lexical search",
      statement: "Lexical retrieval uses PostgreSQL tsvector.",
      evidence: [
        {
          source_kind: "meeting",
          source_reference: "https://meet.example/arch-review",
          source_author: "priya",
          excerpt: "We agreed tsvector is enough at our scale.",
        },
      ],
    });

    const res = await call(app, api_key, "query_project_context", { query: "lexical retrieval" });
    const item = JSON.parse(res.payload).items[0];

    expect(item.match_reasons.length).toBeGreaterThan(0);
    expect(item.evidence).toHaveLength(1);
    expect(item.evidence[0].source_reference).toBe("https://meet.example/arch-review");
    expect(item.evidence[0].source_author).toBe("priya");
  });

  it("returns only a bounded preview of evidence excerpts by default (§14.6, NFR-PE-12)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const longExcerpt = `Sensitive detail. ${"x".repeat(500)}`;
    await acceptedItem(app, api_key, {
      type: "constraint",
      title: "Contractual cap",
      statement: "A contractual throughput cap applies.",
      evidence: [{ source_kind: "document", excerpt: longExcerpt }],
    });

    const res = await call(app, api_key, "query_project_context", { query: "contractual cap" });
    const evidence = JSON.parse(res.payload).items[0].evidence[0];

    expect(evidence.excerpt).toBeUndefined();
    expect(evidence.excerpt_preview.length).toBeLessThan(longExcerpt.length);
    expect(evidence.has_excerpt).toBe(true);
  });

  it("returns the current replacement when a query matches superseded wording (FR-PE-42)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const v1 = await acceptedItem(app, api_key, {
      type: "requirement",
      title: "Quarterly invoicing",
      statement: "Customers are invoiced quarterly in arrears.",
    });

    const v2 = JSON.parse(
      (
        await call(app, api_key, "propose_project_update", {
          type: "requirement",
          title: "Monthly invoicing",
          statement: "Customers are invoiced monthly in advance.",
          supersedes_item_id: v1,
          evidence: [{ source_kind: "manual", excerpt: "Finance changed the billing cycle." }],
        })
      ).payload
    );
    await call(app, api_key, "review_project_update", { item_id: v2.item_id, action: "accept" });

    const res = await call(app, api_key, "query_project_context", { query: "quarterly invoicing" });
    const body = JSON.parse(res.payload);

    const returned = body.items.find((i: any) => i.id === v2.item_id);
    expect(returned).toBeDefined();
    expect(returned.replaces.id).toBe(v1);
    // The superseded item itself is not offered as current truth.
    expect(body.items.some((i: any) => i.id === v1)).toBe(false);
    expect(body.warnings.some((w: any) => w.kind === "superseded_match")).toBe(true);
  });

  it("warns about unresolved contradictions among returned items (FR-PE-22)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const a = await acceptedItem(app, api_key, {
      type: "constraint",
      title: "Retention is 90 days",
      statement: "Telemetry is retained for 90 days.",
    });
    const b = await acceptedItem(app, api_key, {
      type: "constraint",
      title: "Retention is one year",
      statement: "Telemetry is retained for 365 days.",
    });

    await call(app, api_key, "link_project_updates", {
      from_item_id: a,
      to_item_id: b,
      relation_type: "contradicts",
      actor: "priya",
    });

    const res = await call(app, api_key, "query_project_context", { query: "telemetry retention" });
    const body = JSON.parse(res.payload);

    const warning = body.warnings.find((w: any) => w.kind === "unresolved_contradiction");
    expect(warning).toBeDefined();
    expect(warning.item_ids.sort()).toEqual([a, b].sort());
  });

  it("stops warning once the contradiction is retracted", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const a = await acceptedItem(app, api_key, {
      type: "constraint",
      title: "Retention is 90 days",
      statement: "Telemetry is retained for 90 days.",
    });
    const b = await acceptedItem(app, api_key, {
      type: "constraint",
      title: "Retention is one year",
      statement: "Telemetry is retained for 365 days.",
    });

    await call(app, api_key, "link_project_updates", {
      from_item_id: a,
      to_item_id: b,
      relation_type: "contradicts",
    });
    await call(app, api_key, "link_project_updates", {
      action: "retract",
      from_item_id: a,
      to_item_id: b,
      relation_type: "contradicts",
    });

    const res = await call(app, api_key, "query_project_context", { query: "telemetry retention" });
    const body = JSON.parse(res.payload);
    expect(body.warnings.filter((w: any) => w.kind === "unresolved_contradiction")).toHaveLength(0);
  });

  it("expands one and two hops of related items (FR-PE-32)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const requirement = await acceptedItem(app, api_key, {
      type: "requirement",
      title: "Zero-downtime deploys",
      statement: "Deployments must not interrupt in-flight requests.",
    });
    const decision = await acceptedItem(app, api_key, {
      type: "decision",
      title: "Blue-green rollout",
      statement: "We roll out with a blue-green strategy behind the load balancer.",
    });
    const constraint = await acceptedItem(app, api_key, {
      type: "constraint",
      title: "Single load balancer",
      statement: "The hosting plan provides exactly one load balancer.",
    });

    await call(app, api_key, "link_project_updates", {
      from_item_id: decision,
      to_item_id: requirement,
      relation_type: "implements",
    });
    await call(app, api_key, "link_project_updates", {
      from_item_id: decision,
      to_item_id: constraint,
      relation_type: "caused_by",
    });

    const oneHop = JSON.parse(
      (
        await call(app, api_key, "query_project_context", {
          query: "zero-downtime deploys",
          hops: 1,
        })
      ).payload
    );
    const oneHopIds = oneHop.items.map((i: any) => i.id);
    expect(oneHopIds).toContain(requirement);
    expect(oneHopIds).toContain(decision);
    expect(oneHopIds).not.toContain(constraint);

    const twoHop = JSON.parse(
      (
        await call(app, api_key, "query_project_context", {
          query: "zero-downtime deploys",
          hops: 2,
        })
      ).payload
    );
    const twoHopIds = twoHop.items.map((i: any) => i.id);
    expect(twoHopIds).toContain(constraint);

    const constraintItem = twoHop.items.find((i: any) => i.id === constraint);
    expect(constraintItem.hops).toBe(2);
    expect(constraintItem.match_reasons.some((r: string) => r.startsWith("relationship:"))).toBe(
      true
    );

    const noHop = JSON.parse(
      (
        await call(app, api_key, "query_project_context", {
          query: "zero-downtime deploys",
          hops: 0,
        })
      ).payload
    );
    expect(noHop.items.map((i: any) => i.id)).not.toContain(constraint);
  });

  it("bounds the response and reports truncation (FR-PE-41)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    for (let i = 0; i < 6; i += 1) {
      await acceptedItem(app, api_key, {
        type: "requirement",
        title: `Requirement ${i}`,
        statement: `Requirement number ${i} about caching behaviour.`,
      });
    }

    const res = await call(app, api_key, "query_project_context", {
      query: "caching behaviour",
      limit: 2,
    });

    const body = JSON.parse(res.payload);
    expect(body.items).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(body.truncated).toBe(true);
  });

  it("refuses a limit above the documented ceiling", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await call(app, api_key, "query_project_context", { limit: 5000 });
    expect(res.statusCode).toBe(400);
  });

  it("filters by item type", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await acceptedItem(app, api_key, {
      type: "requirement",
      title: "A requirement",
      statement: "Something about caching.",
    });
    await acceptedItem(app, api_key, {
      type: "constraint",
      title: "A constraint",
      statement: "Something else about caching.",
    });

    const res = await call(app, api_key, "query_project_context", { types: ["constraint"] });
    const body = JSON.parse(res.payload);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe("constraint");
  });

  it("returns a deterministic ordering for repeated identical queries (NFR-PE-07)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    for (let i = 0; i < 4; i += 1) {
      await acceptedItem(app, api_key, {
        type: "requirement",
        title: `Caching rule ${i}`,
        statement: `Caching rule ${i} governs response caching.`,
      });
    }

    const first = JSON.parse(
      (await call(app, api_key, "query_project_context", { query: "caching rule" })).payload
    );
    const second = JSON.parse(
      (await call(app, api_key, "query_project_context", { query: "caching rule" })).payload
    );

    expect(second.items.map((i: any) => i.id)).toEqual(first.items.map((i: any) => i.id));
  });

  it("uses the semantic branch when embeddings are available (FR-PE-36)", async () => {
    const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    vec[0] = 1;
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    await acceptedItem(app, api_key, {
      type: "decision",
      title: "Chosen queue technology",
      statement: "Background jobs run on a Postgres-backed queue.",
    });

    // Wording that shares no keywords with the stored statement: only the
    // semantic branch can find this.
    const res = await call(app, api_key, "query_project_context", {
      query: "asynchronous worker infrastructure",
    });

    const body = JSON.parse(res.payload);
    expect(body.degraded).toBe(false);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].match_reasons).toContain("semantic");
  });
});
