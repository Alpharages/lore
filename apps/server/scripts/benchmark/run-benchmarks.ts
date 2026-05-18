import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Pool } from "pg";
import { defaultConfig, nfrThresholds, type ProbesRow } from "./benchmark.config.js";
import { renderMarkdownReport } from "./reporters/markdown.js";

/* ------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------ */
interface BenchState {
  projectId: string;
  apiKey: string;
  slug: string;
}

interface LatencyResult {
  name: string;
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  max: number;
  threshold: number;
  pass: boolean;
  failedCount: number;
}

/* ------------------------------------------------------------------
 * Stats
 * ------------------------------------------------------------------ */
const percentile = (sorted: number[], p: number): number => {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
};

/* ------------------------------------------------------------------
 * HTTP benchmark helpers
 * ------------------------------------------------------------------ */
const runRequest = async (
  baseUrl: string,
  apiKey: string,
  tool: string,
  body: unknown
): Promise<number> => {
  const start = performance.now();
  const res = await fetch(`${baseUrl}/mcp/tools/${tool}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const elapsed = performance.now() - start;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${tool}: ${text}`);
  }

  return elapsed;
};

const runConcurrentBatch = async (
  baseUrl: string,
  apiKey: string,
  tool: string,
  makeBody: (i: number) => unknown,
  count: number,
  concurrency: number
): Promise<number[]> => {
  const results: number[] = [];
  let idx = 0;

  const worker = async (): Promise<void> => {
    while (idx < count) {
      const i = idx++;
      try {
        const latency = await runRequest(baseUrl, apiKey, tool, makeBody(i));
        results.push(latency);
      } catch (err: unknown) {
        console.error(`  Request ${i} failed:`, err instanceof Error ? err.message : String(err));
        results.push(NaN);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
};

/* ------------------------------------------------------------------
 * Suite definitions
 * ------------------------------------------------------------------ */
const makeQueryLessonsBody = (i: number) => ({
  stack_tags: i % 3 === 0 ? ["typescript"] : i % 3 === 1 ? ["postgres"] : ["fastify"],
  category: i % 5 === 0 ? "performance" : i % 5 === 1 ? "security" : undefined,
  limit: 5,
});

const makeSearchSimilarBody = (i: number) => ({
  text:
    i % 4 === 0
      ? "How do I optimise database queries?"
      : i % 4 === 1
        ? "Security vulnerability in authentication"
        : i % 4 === 2
          ? "Refactoring large TypeScript modules"
          : "API design patterns for REST endpoints",
  limit: 3,
  threshold: 0.7,
});

const makeQueryLessonsForTaskBody = (i: number) => ({
  external_task_id: `benchmark-task-${i}`,
  task_context: {
    title: i % 3 === 0 ? "Optimise query performance" : "Fix auth middleware bug",
    description: "Sample task description for benchmark",
    parent_epic_id: i % 2 === 0 ? "epic-1" : "epic-2",
    stack_tags: ["typescript", "postgres"],
  },
  limit: 5,
});

/* ------------------------------------------------------------------
 * Main runner
 * ------------------------------------------------------------------ */
const runBenchmarkSuite = async (
  baseUrl: string,
  apiKey: string,
  iterations: number,
  concurrency: number,
  warmupIterations: number
): Promise<LatencyResult[]> => {
  const suites = [
    {
      name: "query_lessons",
      tool: "query_lessons",
      makeBody: makeQueryLessonsBody,
      threshold: nfrThresholds.query_lessons_ms,
    },
    {
      name: "search_similar",
      tool: "search_similar",
      makeBody: makeSearchSimilarBody,
      threshold: nfrThresholds.search_similar_ms,
    },
    {
      name: "query_lessons_for_task",
      tool: "query_lessons_for_task",
      makeBody: makeQueryLessonsForTaskBody,
      threshold: nfrThresholds.query_lessons_for_task_ms,
    },
  ];

  const results: LatencyResult[] = [];

  for (const suite of suites) {
    console.log(`\n🔹 ${suite.name}`);

    // Warm-up
    if (warmupIterations > 0) {
      process.stdout.write(`  Warming up (${warmupIterations} iterations)...`);
      await runConcurrentBatch(
        baseUrl,
        apiKey,
        suite.tool,
        suite.makeBody,
        warmupIterations,
        concurrency
      );
      console.log(" done");
    }

    // Benchmark
    process.stdout.write(`  Running ${iterations} iterations (concurrency=${concurrency})...`);
    const rawLatencies = await runConcurrentBatch(
      baseUrl,
      apiKey,
      suite.tool,
      suite.makeBody,
      iterations,
      concurrency
    );
    const failedCount = rawLatencies.filter(Number.isNaN).length;
    const latencies = rawLatencies.filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    console.log(" done");

    if (failedCount > 0) {
      console.warn(
        `  ⚠️  ${failedCount} request(s) failed and were excluded from latency calculations.`
      );
    }

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);
    const max = latencies[latencies.length - 1];
    const pass = p95 < suite.threshold;

    console.log(
      `  P50=${p50.toFixed(2)}ms  P95=${p95.toFixed(2)}ms  P99=${p99.toFixed(2)}ms  max=${max.toFixed(2)}ms  failed=${failedCount}  ${pass ? "✅ PASS" : "❌ FAIL"}`
    );

    results.push({
      name: suite.name,
      latencies,
      p50,
      p95,
      p99,
      max,
      threshold: suite.threshold,
      pass,
      failedCount,
    });
  }

  return results;
};

/* ------------------------------------------------------------------
 * Environment probe
 * ------------------------------------------------------------------ */
const probeEnvironment = async (): Promise<Record<string, string>> => {
  const env: Record<string, string> = {};

  env["Node.js"] = process.version;

  try {
    const res = await fetch(`${defaultConfig.baseUrl}/health`);
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      env["Server status"] = String(data.status ?? "unknown");
    }
  } catch {
    env["Server status"] = "unreachable";
  }

  env["Seed size"] = defaultConfig.seedSize.toLocaleString();
  env["Iterations"] = defaultConfig.iterations.toString();
  env["Concurrency"] = defaultConfig.concurrency.toString();
  env["Warm-up iterations"] = defaultConfig.warmupIterations.toString();

  return env;
};

/* ------------------------------------------------------------------
 * Pre-flight: validate stored API key is still live
 * ------------------------------------------------------------------ */
const validateState = async (baseUrl: string, apiKey: string): Promise<void> => {
  const res = await fetch(`${baseUrl}/mcp/whoami`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401) {
    throw new Error(
      "Pre-flight auth check failed (401). The stored API key in .bench-state.json is invalid.\n" +
        "Run `pnpm benchmark:seed --teardown && pnpm benchmark:seed` to create a fresh project."
    );
  }
  if (!res.ok) {
    throw new Error(
      `Pre-flight check failed: HTTP ${res.status}. Is the server running at ${baseUrl}?`
    );
  }
};

/* ------------------------------------------------------------------
 * IVFFlat probes comparison — direct DB, isolates index-scan cost
 * ------------------------------------------------------------------ */
const generateUnitVector = (dimensions: number): number[] => {
  const vec = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / norm);
};

const runProbesComparison = async (projectId: string, iterations: number): Promise<ProbesRow[]> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("  ⚠️  DATABASE_URL not set — skipping IVFFlat probes comparison.");
    return [];
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const queryVectors = Array.from({ length: 10 }, () => generateUnitVector(1536));
  const rows: ProbesRow[] = [];

  try {
    for (const probes of [1, 10] as const) {
      const latencies: number[] = [];
      process.stdout.write(`  probes=${probes}: running ${iterations} iterations...`);

      for (let i = 0; i < iterations; i++) {
        const vec = queryVectors[i % queryVectors.length];
        const vectorParam = `[${vec.join(",")}]`;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL app.current_project_id = '${projectId}'`);
          await client.query(`SET LOCAL ivfflat.probes = ${probes}`);
          const start = performance.now();
          await client.query(
            `SELECT id, 1 - (embedding <=> $1::vector) AS similarity
             FROM lessons
             WHERE (project_id = $2::uuid OR project_id IS NULL)
               AND embedding IS NOT NULL
               AND 1 - (embedding <=> $1::vector) >= 0.65
             ORDER BY similarity DESC
             LIMIT 5`,
            [vectorParam, projectId]
          );
          latencies.push(performance.now() - start);
          await client.query("COMMIT");
        } catch {
          await client.query("ROLLBACK").catch(() => {});
        } finally {
          client.release();
        }
      }

      console.log(" done");
      const sorted = [...latencies].sort((a, b) => a - b);
      rows.push({ probes, p50: percentile(sorted, 50), p95: percentile(sorted, 95) });
    }
  } finally {
    await pool.end();
  }

  return rows;
};

/* ------------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------------ */
const run = async (): Promise<void> => {
  const config = defaultConfig;
  const statePath = resolve(config.stateFile);

  if (!existsSync(statePath)) {
    console.error("❌ No benchmark state found. Run `pnpm benchmark:seed` first.");
    process.exit(1);
  }

  const state = JSON.parse(readFileSync(statePath, "utf-8")) as BenchState;

  console.log(`🔍 Validating stored credentials against ${config.baseUrl}...`);
  await validateState(config.baseUrl, state.apiKey);
  console.log("✅ Credentials valid.");

  console.log(`\n🚀 Benchmarking against ${config.baseUrl} (project: ${state.slug})`);

  const envInfo = await probeEnvironment();
  console.log("\n📊 Environment:");
  for (const [k, v] of Object.entries(envInfo)) {
    console.log(`  ${k}: ${v}`);
  }

  const results = await runBenchmarkSuite(
    config.baseUrl,
    state.apiKey,
    config.iterations,
    config.concurrency,
    config.warmupIterations
  );

  console.log("\n📐 IVFFlat probes comparison (direct DB, search_similar query pattern)...");
  const probesResults = await runProbesComparison(
    state.projectId,
    config.probesComparisonIterations
  );

  if (probesResults.length === 2) {
    const [p1, p10] = probesResults;
    console.log(`  probes=1  → P50=${p1.p50.toFixed(2)}ms  P95=${p1.p95.toFixed(2)}ms`);
    console.log(`  probes=10 → P50=${p10.p50.toFixed(2)}ms  P95=${p10.p95.toFixed(2)}ms`);
    const recommendation = p10.p95 < p1.p95 ? 10 : 1;
    console.log(`  Recommendation: ivfflat.probes = ${recommendation}`);
  }

  const markdown = renderMarkdownReport(results, probesResults, envInfo, config);
  writeFileSync(resolve(config.outputPath), markdown);
  console.log(`\n📝 Report written to ${config.outputPath}`);

  const allPass = results.every((r) => r.pass);
  if (!allPass) {
    console.error("\n❌ One or more NFR thresholds exceeded.");
    process.exit(1);
  }

  console.log("\n✅ All NFR thresholds met.");
};

run().catch((err: unknown) => {
  console.error("❌ Benchmark failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
