import { Registry, collectDefaultMetrics, Gauge, Counter, Histogram } from "prom-client";

export const register = new Registry();

// Collect default metrics (process_start_time_seconds, etc.)
collectDefaultMetrics({ register });

// Explicit process_uptime_seconds gauge required by architecture §8.3
const processUptimeSeconds = new Gauge({
  name: "process_uptime_seconds",
  help: "Number of seconds the process has been running",
  registers: [register],
  collect() {
    this.set(process.uptime());
  },
});

// Lore-specific metrics per architecture §8.3
export const dbPoolUtilization = new Gauge({
  name: "lore_db_pool_utilization",
  help: "Ratio of used connections to max pool size (0-1)",
  registers: [register],
});

export const embeddingsTotal = new Counter({
  name: "lore_embeddings_total",
  help: "Total number of embedding generation requests",
  registers: [register],
});

export const embeddingFailuresTotal = new Counter({
  name: "lore_embedding_failures_total",
  help: "Total number of failed embedding generation requests",
  registers: [register],
});

export const mcpToolDurationMs = new Histogram({
  name: "lore_mcp_tool_duration_ms",
  help: "Duration of MCP tool executions in milliseconds",
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

export const queryLessonsForTaskDurationMs = new Histogram({
  name: "lore_query_lessons_for_task_duration_ms",
  help: "Duration of query_lessons_for_task executions in milliseconds",
  buckets: [10, 50, 100, 250, 500, 800, 1000, 2500],
  registers: [register],
});

export const propagationLastRunTimestampSeconds = new Gauge({
  name: "lore_propagation_last_run_timestamp_seconds",
  help: "Unix timestamp of the last successful propagation engine run",
  registers: [register],
});

export const postgresDiskUsageRatio = new Gauge({
  name: "lore_postgres_disk_usage_ratio",
  help: "Ratio of used Postgres disk space to volume capacity (0-1)",
  registers: [register],
});

// Typed wrappers for use by other epics/stories
export function recordToolDuration(tool: string, ms: number) {
  mcpToolDurationMs.observe(ms);
}

export function incrementEmbeddingTotal() {
  embeddingsTotal.inc();
}

export function incrementEmbeddingFailure() {
  embeddingFailuresTotal.inc();
}

export function setPropagationLastRun(timestampSeconds: number) {
  propagationLastRunTimestampSeconds.set(timestampSeconds);
}

export function setPostgresDiskUsageRatio(ratio: number) {
  postgresDiskUsageRatio.set(ratio);
}

export function setDbPoolUtilization(ratio: number) {
  dbPoolUtilization.set(ratio);
}
