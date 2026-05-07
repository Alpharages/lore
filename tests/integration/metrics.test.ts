import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { register } from "../../src/services/metrics.js";

describe("GET /metrics", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(() => {
    pool = createTestPool();
    db = createTestDb(pool);
    app = buildTestApp(pool, db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  it("returns 200 with Prometheus text/plain content type", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
  });

  it("exposes every metric named in architecture §8.3 with correct types", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    const payload = response.payload;

    const expectedMetrics = [
      { name: "lore_db_pool_utilization", type: "gauge" },
      { name: "lore_embeddings_total", type: "counter" },
      { name: "lore_embedding_failures_total", type: "counter" },
      { name: "lore_mcp_tool_duration_ms", type: "histogram" },
      { name: "lore_query_lessons_for_task_duration_ms", type: "histogram" },
      { name: "lore_propagation_last_run_timestamp_seconds", type: "gauge" },
      { name: "lore_postgres_disk_usage_ratio", type: "gauge" },
      { name: "process_uptime_seconds", type: "gauge" },
    ];

    for (const { name, type } of expectedMetrics) {
      // Check TYPE line exists
      const typeRegex = new RegExp(`^# TYPE ${name} ${type}`, "m");
      expect(payload).toMatch(typeRegex);

      // Check metric line exists (or _bucket/_sum/_count for histograms)
      if (type === "histogram") {
        expect(payload).toMatch(new RegExp(`^${name}_count`, "m"));
        expect(payload).toMatch(new RegExp(`^${name}_sum`, "m"));
        expect(payload).toMatch(new RegExp(`^${name}_bucket`, "m"));
      } else {
        expect(payload).toMatch(new RegExp(`^${name} `, "m"));
      }
    }
  });

  it("includes default process metrics from prom-client", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    const payload = response.payload;
    expect(payload).toMatch(/^process_uptime_seconds /m);
    expect(payload).toMatch(/^process_cpu_user_seconds_total /m);
  });

  it("counters are monotonically non-decreasing across scrapes", async () => {
    // Trigger an embedding counter increment
    const { incrementEmbeddingTotal } = await import("../../src/services/metrics.js");
    incrementEmbeddingTotal();

    const response1 = await app.inject({ method: "GET", url: "/metrics" });
    const match1 = response1.payload.match(/^lore_embeddings_total (\d+)/m);
    expect(match1).toBeTruthy();
    const count1 = Number(match1![1]);

    incrementEmbeddingTotal();

    const response2 = await app.inject({ method: "GET", url: "/metrics" });
    const match2 = response2.payload.match(/^lore_embeddings_total (\d+)/m);
    expect(match2).toBeTruthy();
    const count2 = Number(match2![1]);

    expect(count2).toBeGreaterThanOrEqual(count1 + 1);
  });
});
