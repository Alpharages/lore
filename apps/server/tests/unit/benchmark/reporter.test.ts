import { describe, it, expect } from "vitest";
import { renderMarkdownReport } from "../../../scripts/benchmark/reporters/markdown.js";
import { defaultConfig } from "../../../scripts/benchmark/benchmark.config.js";

describe("benchmark reporter", () => {
  const passingResults = [
    {
      name: "query_lessons",
      p50: 45.2,
      p95: 120.5,
      p99: 180.1,
      max: 195.0,
      threshold: 200,
      pass: true,
      failedCount: 0,
    },
    {
      name: "search_similar",
      p50: 120.0,
      p95: 350.0,
      p99: 420.0,
      max: 480.0,
      threshold: 500,
      pass: true,
      failedCount: 0,
    },
    {
      name: "query_lessons_for_task",
      p50: 110.0,
      p95: 380.0,
      p99: 450.0,
      max: 490.0,
      threshold: 500,
      pass: true,
      failedCount: 0,
    },
  ];

  const env = { "Node.js": "v22.0.0", "Seed size": "10,000" };

  it("renders a markdown report with all required sections", () => {
    const md = renderMarkdownReport(passingResults, [], env, defaultConfig);

    expect(md).toContain("# Performance Benchmarks");
    expect(md).toContain("## Environment");
    expect(md).toContain("## Methodology");
    expect(md).toContain("## Results");
    expect(md).toContain("## Verdict");
    expect(md).toContain("✅ **All NFR thresholds met.**");
    expect(md).toContain("query_lessons");
    expect(md).toContain("search_similar");
    expect(md).toContain("query_lessons_for_task");
  });

  it("renders FAIL verdict when any threshold is exceeded", () => {
    const results = [
      {
        name: "query_lessons",
        p50: 45.2,
        p95: 250.0,
        p99: 300.0,
        max: 350.0,
        threshold: 200,
        pass: false,
        failedCount: 0,
      },
    ];

    const md = renderMarkdownReport(results, [], env, defaultConfig);

    expect(md).toContain("❌ **One or more NFR thresholds exceeded.**");
  });

  it("includes failed request count in results table", () => {
    const results = [
      {
        name: "query_lessons",
        p50: 45.2,
        p95: 120.5,
        p99: 180.1,
        max: 195.0,
        threshold: 200,
        pass: true,
        failedCount: 3,
      },
    ];

    const md = renderMarkdownReport(results, [], env, defaultConfig);

    expect(md).toContain("| 3 |");
  });

  it("renders probes comparison section when probes results are provided", () => {
    const probesResults = [
      { probes: 1 as const, p50: 8.2, p95: 22.1 },
      { probes: 10 as const, p50: 6.5, p95: 15.3 },
    ];

    const md = renderMarkdownReport(passingResults, probesResults, env, defaultConfig);

    expect(md).toContain("## IVFFlat Probes Comparison");
    expect(md).toContain("### Production Recommendation");
    expect(md).toContain("ivfflat.probes = 10");
  });

  it("recommends probes=1 when probes=10 does not reduce P95", () => {
    const probesResults = [
      { probes: 1 as const, p50: 6.0, p95: 12.0 },
      { probes: 10 as const, p50: 8.0, p95: 18.0 },
    ];

    const md = renderMarkdownReport(passingResults, probesResults, env, defaultConfig);

    expect(md).toContain("ivfflat.probes = 1");
  });

  it("notes OpenAI embedding latency in methodology", () => {
    const md = renderMarkdownReport(passingResults, [], env, defaultConfig);

    expect(md).toContain("OpenAI embedding");
  });
});
