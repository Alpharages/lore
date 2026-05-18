export interface BenchmarkConfig {
  baseUrl: string;
  seedSize: number;
  iterations: number;
  concurrency: number;
  warmupIterations: number;
  probesComparisonIterations: number;
  stateFile: string;
  projectSlug: string;
  outputPath: string;
}

export const defaultConfig: BenchmarkConfig = {
  baseUrl: process.env.BENCHMARK_BASE_URL || "http://localhost:3100",
  seedSize: Number(process.env.BENCHMARK_SEED_SIZE) || 10_000,
  iterations: Number(process.env.BENCHMARK_ITERATIONS) || 200,
  concurrency: Number(process.env.BENCHMARK_CONCURRENCY) || 10,
  warmupIterations: Number(process.env.BENCHMARK_WARMUP) || 10,
  probesComparisonIterations: Number(process.env.BENCHMARK_PROBES_ITERATIONS) || 50,
  stateFile: process.env.BENCHMARK_STATE_FILE || "scripts/benchmark/.bench-state.json",
  projectSlug: process.env.BENCHMARK_PROJECT_SLUG || "benchmark-test-project",
  outputPath: process.env.BENCHMARK_OUTPUT || "docs/benchmarks.md",
};

export const nfrThresholds = {
  query_lessons_ms: 200,
  search_similar_ms: 500,
  query_lessons_for_task_ms: 500,
};

export interface ProbesRow {
  probes: 1 | 10;
  p50: number;
  p95: number;
}
