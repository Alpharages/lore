import type { BenchmarkConfig, ProbesRow } from "../benchmark.config.js";

interface LatencyResult {
  name: string;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  threshold: number;
  pass: boolean;
  failedCount: number;
}

export const renderMarkdownReport = (
  results: LatencyResult[],
  probesResults: ProbesRow[],
  env: Record<string, string>,
  config: BenchmarkConfig
): string => {
  const now = new Date().toISOString();

  const envRows = Object.entries(env)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");

  const resultRows = results
    .map(
      (r) =>
        `| ${r.name} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.max.toFixed(2)} | ${r.threshold} | ${r.failedCount} | ${r.pass ? "✅ PASS" : "❌ FAIL"} |`
    )
    .join("\n");

  const allPass = results.every((r) => r.pass);

  const probesSection =
    probesResults.length === 2
      ? `## IVFFlat Probes Comparison

> Measured via direct DB connection (bypasses HTTP/auth overhead) using the \`search_similar\` query pattern.
> This isolates index-scan cost from embedding and serialisation latency.

| ivfflat.probes | P50 (ms) | P95 (ms) |
| --- | --- | --- |
${probesResults.map((r) => `| ${r.probes} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} |`).join("\n")}

### Production Recommendation

${(() => {
  const [p1, p10] = probesResults;
  if (p10.p95 < p1.p95) {
    return `**Use \`ivfflat.probes = 10\`** (P95 ${p10.p95.toFixed(2)}ms vs ${p1.p95.toFixed(2)}ms at probes=1). Higher probes improve recall accuracy and reduce tail latency under load for datasets of this size.`;
  }
  return `**Use \`ivfflat.probes = 1\`** (default). At this dataset size, increasing probes to 10 does not reduce P95. Re-evaluate as the dataset grows beyond 50,000 vectors.`;
})()}

To set this globally, add to your \`docker-compose.yml\` Postgres service:

\`\`\`yaml
command: postgres -c ivfflat.probes=10
\`\`\`

`
      : "";

  return `# Performance Benchmarks

> Generated automatically by the Lore benchmark suite.
> Date: ${now}

## Environment

| Property | Value |
| --- | --- |
${envRows}

## Methodology

1. **Seeding:** A temporary project is registered and populated with ${config.seedSize.toLocaleString()} synthetic lessons (1536-dim unit-normalised vectors) via direct DB insertion.
2. **Warm-up:** The first ${config.warmupIterations} iterations of each suite are discarded to allow Postgres shared_buffers and the IVFFlat index to warm up.
3. **Measurement:** Each suite runs ${config.iterations} iterations at concurrency ${config.concurrency}. Latency is measured as total HTTP round-trip time (including auth middleware, RLS SET LOCAL, query execution, and JSON serialisation).
4. **Embedding latency:** \`search_similar\` and \`query_lessons_for_task\` P95 measurements include OpenAI embedding generation time (~100–500ms per call). This reflects production behaviour — the 500ms NFR thresholds are set with this combined latency in mind.
5. **Concurrency model:** Requests are fired in concurrent batches of ${config.concurrency}. The default connection pool size is 10, so concurrency=${config.concurrency} intentionally saturates the pool to reflect real-world saturation behaviour.
6. **IVFFlat probes:** The HTTP benchmark runs at the server's default \`ivfflat.probes\` setting. A direct-DB probes comparison (section below) measures index-scan cost at probes=1 and probes=10 to produce the production recommendation.

## Results

| Tool | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Threshold (ms) | Failed | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
${resultRows}

## Verdict

${allPass ? "✅ **All NFR thresholds met.**" : "❌ **One or more NFR thresholds exceeded.**"}

${probesSection}## Reproduction

\`\`\`bash
# 1. Ensure the server is running
docker compose up -d

# 2. Seed the benchmark dataset
pnpm benchmark:seed

# 3. Run benchmarks (set DATABASE_URL for probes comparison)
DATABASE_URL=postgres://... pnpm benchmark:run

# 4. (Optional) Tear down
pnpm benchmark:seed --teardown
\`\`\`
`;
};
