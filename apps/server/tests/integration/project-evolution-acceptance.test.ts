import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import {
  createTestPool,
  createTestDb,
  buildTestApp,
  resetDatabase,
  createAppRole,
  forceRowLevelSecurity,
} from "./helper.js";
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

/**
 * PRD §20 — the MVP acceptance scenario, end to end.
 *
 * "What is the current project requirement, what was it before, why did it
 * change, and which evidence confirms the change?"
 */
describe("Project Evolution — MVP acceptance scenario (PRD §20)", () => {
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

  it("records, supersedes, retrieves, explains and links a requirement change", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    /* 1. A user records and accepts an initial project requirement. */
    const v1 = JSON.parse(
      (
        await call(app, api_key, "propose_project_update", {
          type: "requirement",
          title: "Invoices are issued quarterly",
          statement: "Customers are invoiced quarterly in arrears.",
          rationale: "Matches the original finance process.",
          proposed_by: "dana",
          evidence: [
            {
              source_kind: "document",
              source_reference: "https://docs.example/billing-v1",
              excerpt: "Billing runs on a quarterly cycle, invoiced in arrears.",
            },
          ],
        })
      ).payload
    );
    expect(v1.status).toBe("proposed");

    const acceptV1 = await call(app, api_key, "review_project_update", {
      item_id: v1.item_id,
      action: "accept",
      reviewer: "priya",
    });
    expect(acceptV1.statusCode).toBe(200);

    /* 2. A later discussion is captured as evidence for a proposed change, and
     *  3. the caller supplies the normalized replacement requirement. */
    const v2 = JSON.parse(
      (
        await call(app, api_key, "propose_project_update", {
          type: "requirement",
          title: "Invoices are issued monthly",
          statement: "Customers are invoiced monthly in advance.",
          rationale: "Quarterly arrears billing created unacceptable cash-flow gaps.",
          proposed_by: "lore-agent",
          capture_mode: "ai_assisted",
          ai_confidence: 0.82,
          ai_model: "test-extractor-1",
          supersedes_item_id: v1.item_id,
          evidence: [
            {
              source_kind: "meeting",
              source_reference: "https://meet.example/finance-review-42",
              source_author: "cfo",
              external_source_id: "meeting-42",
              excerpt:
                "We cannot keep waiting a quarter to bill. Move everyone to monthly, in advance, from Q3.",
              provided_by: "ai_agent",
            },
          ],
        })
      ).payload
    );
    expect(v2.status).toBe("proposed");

    /* 4. An authorized reviewer appends a corrected revision, then accepts. */
    const revise = await call(app, api_key, "review_project_update", {
      item_id: v2.item_id,
      action: "revise",
      statement: "Customers are invoiced monthly in advance from Q3 onward.",
      reviewer: "priya",
      note: "Added the effective date the CFO gave.",
    });
    expect(JSON.parse(revise.payload).revision).toBe(2);

    const acceptV2 = await call(app, api_key, "review_project_update", {
      item_id: v2.item_id,
      action: "accept",
      reviewer: "priya",
    });
    expect(acceptV2.statusCode).toBe(200);

    /* 5. The replacement explicitly supersedes the original. */
    expect(JSON.parse(acceptV2.payload).superseded_item_id).toBe(v1.item_id);

    /* 6. A normal project-context query returns the replacement, not the original. */
    const context = JSON.parse(
      (
        await call(app, api_key, "query_project_context", {
          query: "How do we invoice customers?",
        })
      ).payload
    );
    const currentIds = context.items.map((i: any) => i.id);
    expect(currentIds).toContain(v2.item_id);
    expect(currentIds).not.toContain(v1.item_id);

    /* 7. The response explains why the requirement changed and cites the evidence. */
    const current = context.items.find((i: any) => i.id === v2.item_id);
    expect(current.rationale).toContain("cash-flow");
    expect(current.statement).toContain("from Q3 onward");
    expect(current.evidence).toHaveLength(1);
    expect(current.evidence[0].source_reference).toBe("https://meet.example/finance-review-42");
    expect(current.evidence[0].source_kind).toBe("meeting");
    expect(current.match_reasons.length).toBeGreaterThan(0);

    /* 8. A history query returns both versions, their lifecycle actions, and
     *    their relationship. */
    const history = JSON.parse((await call(app, api_key, "get_project_history", {})).payload);
    const historyIds = history.items.map((i: any) => i.id);
    expect(historyIds).toContain(v1.item_id);
    expect(historyIds).toContain(v2.item_id);

    const oldItem = history.items.find((i: any) => i.id === v1.item_id);
    expect(oldItem.status).toBe("superseded");
    expect(oldItem.superseded_by_item_id).toBe(v2.item_id);
    expect(oldItem.relations.some((r: any) => r.relation_type === "supersedes")).toBe(true);

    const eventTypes = history.events.map((e: any) => e.event_type);
    expect(eventTypes).toEqual(
      expect.arrayContaining(["proposed", "evidence_added", "revised", "accepted", "superseded"])
    );

    // The original proposal text survives the reviewer's correction.
    const detail = JSON.parse(
      (
        await call(app, api_key, "review_project_update", {
          item_id: v2.item_id,
          action: "inspect",
        })
      ).payload
    ).detail;
    expect(detail.versions).toHaveLength(2);
    expect(detail.versions[0].statement).toBe("Customers are invoiced monthly in advance.");
    expect(detail.versions[1].statement).toContain("from Q3 onward");
    expect(detail.evidence[0].excerpt).toContain("Move everyone to monthly");

    /* 9. The accepted requirement can be linked to a session that implements it. */
    const session = JSON.parse(
      (
        await call(app, api_key, "start_session", {
          repo_slug: "backend",
          branch: "feat/monthly-billing",
        })
      ).payload
    );
    const link = await call(app, api_key, "link_project_updates", {
      item_id: v2.item_id,
      session_id: session.session_id,
      actor: "dana",
    });
    expect(link.statusCode).toBe(201);

    const linkedDetail = JSON.parse(
      (
        await call(app, api_key, "review_project_update", {
          item_id: v2.item_id,
          action: "inspect",
        })
      ).payload
    ).detail;
    expect(linkedDetail.links[0].session_id).toBe(session.session_id);

    /* 10. Existing lesson, pattern and session workflows still work unchanged. */
    const lesson = await call(app, api_key, "save_lesson", {
      title: "Billing cycle change needs a migration window",
      problem: "Switching billing cycles mid-quarter double-billed two tenants.",
      fix: "Run the cycle change at a period boundary behind a feature flag.",
      prevention_rule: "Never change a billing cycle outside a period boundary.",
      session_id: session.session_id,
    });
    expect(lesson.statusCode).toBe(201);

    const pattern = await call(app, api_key, "save_pattern", {
      title: "Period-boundary migration",
      description: "Apply billing changes only at a period boundary.",
      stack_tags: ["billing"],
    });
    expect(pattern.statusCode).toBe(201);

    const endSession = await call(app, api_key, "end_session", {
      session_id: session.session_id,
      decisions: [{ what: "Moved to monthly billing", why: "Cash-flow gap" }],
    });
    expect(endSession.statusCode).toBe(200);
  });
});

/**
 * NFR-PE-01 / FR-PE-44: project isolation is enforced by the database, not just
 * by the query's WHERE clause. These tests connect as a non-superuser role
 * because PostgreSQL superusers bypass RLS even under FORCE ROW LEVEL SECURITY.
 */
describe("Project Evolution — RLS isolation", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;
  let appRoleUrl: string;

  beforeAll(async () => {
    pool = createTestPool();
    db = createTestDb(pool);
    appRoleUrl = await createAppRole(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await forceRowLevelSecurity(pool);
    vi.restoreAllMocks();
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
  });

  it("hides another project's evolution items, evidence, relations and events", async () => {
    const app = buildTestApp(pool, db);
    const acme = await registerProject(app, "acme");
    const other = await registerProject(app, "other");

    const acmeItem = JSON.parse(
      (
        await call(app, acme.api_key, "propose_project_update", {
          type: "requirement",
          title: "Acme only",
          statement: "This requirement belongs to acme.",
          evidence: [{ source_kind: "manual", excerpt: "Acme confidential." }],
        })
      ).payload
    );
    const otherItem = JSON.parse(
      (
        await call(app, other.api_key, "propose_project_update", {
          type: "requirement",
          title: "Other only",
          statement: "This requirement belongs to the other project.",
          evidence: [{ source_kind: "manual", excerpt: "Other confidential." }],
        })
      ).payload
    );

    await call(app, acme.api_key, "review_project_update", {
      item_id: acmeItem.item_id,
      action: "accept",
    });
    await call(app, other.api_key, "review_project_update", {
      item_id: otherItem.item_id,
      action: "accept",
    });

    // Cross-project reads through the API return nothing.
    const acmeContext = JSON.parse(
      (await call(app, acme.api_key, "query_project_context", {})).payload
    );
    expect(acmeContext.items.map((i: any) => i.id)).toEqual([acmeItem.item_id]);

    const crossRead = await call(app, acme.api_key, "review_project_update", {
      item_id: otherItem.item_id,
      action: "inspect",
    });
    expect(crossRead.statusCode).toBe(404);

    // And the policy holds at the database level for a non-superuser role.
    const restricted = new Pool({ connectionString: appRoleUrl });
    try {
      const client = await restricted.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_project_id', $1, true)", [
          acme.project_id,
        ]);

        const items = await client.query(`SELECT id FROM project_evolution_items`);
        expect(items.rows.map((r) => r.id)).toEqual([acmeItem.item_id]);

        const evidence = await client.query(`SELECT excerpt FROM project_evolution_evidence`);
        expect(evidence.rows.map((r) => r.excerpt)).toEqual(["Acme confidential."]);

        const events = await client.query(
          `SELECT DISTINCT project_id FROM project_evolution_events`
        );
        expect(events.rows.map((r) => r.project_id)).toEqual([acme.project_id]);

        const versions = await client.query(
          `SELECT DISTINCT project_id FROM project_evolution_item_versions`
        );
        expect(versions.rows.map((r) => r.project_id)).toEqual([acme.project_id]);

        await client.query("COMMIT");
      } finally {
        client.release();
      }
    } finally {
      await restricted.end();
    }
  });

  it("returns no evolution rows at all when no project scope is set", async () => {
    const app = buildTestApp(pool, db);
    const acme = await registerProject(app, "acme");

    await call(app, acme.api_key, "propose_project_update", {
      type: "requirement",
      title: "Acme only",
      statement: "This requirement belongs to acme.",
      evidence: [{ source_kind: "manual", excerpt: "Acme confidential." }],
    });

    const restricted = new Pool({ connectionString: appRoleUrl });
    try {
      const rows = await restricted.query(`SELECT id FROM project_evolution_items`);
      expect(rows.rows).toHaveLength(0);

      const evidence = await restricted.query(`SELECT id FROM project_evolution_evidence`);
      expect(evidence.rows).toHaveLength(0);
    } finally {
      await restricted.end();
    }
  });
});
