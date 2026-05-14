import { describe, it, expect } from "vitest";
import { generateClaudeMd } from "../../../src/cli/generators/claude-md.js";
import type { WizardAnswers } from "../../../src/cli/utils/init-prompts.js";

const base: WizardAnswers = {
  projectName: "Test Project",
  projectSlug: "test-project",
  serverUrl: "http://localhost:3100",
  repos: [{ name: "API", slug: "api", path: ".", stack: ["typescript"] }],
  validateTracker: false,
};

describe("generateClaudeMd", () => {
  it("includes project identity fields", () => {
    const content = generateClaudeMd(base);
    expect(content).toContain("Test Project");
    expect(content).toContain("test-project");
    expect(content).toContain("http://localhost:3100");
    expect(content).toContain("lore-memory-test-project");
    expect(content).toContain("API");
    expect(content).toContain("typescript");
  });

  it("includes methodology when present", () => {
    const content = generateClaudeMd({
      ...base,
      methodology: { type: "bmad", version: "^6.0.0" },
    });
    expect(content).toContain("bmad");
    expect(content).toContain("^6.0.0");
  });

  it("omits methodology section when absent", () => {
    const content = generateClaudeMd(base);
    expect(content).not.toContain("## Methodology");
  });

  it("uses TypeScript agent standards for a TypeScript repo", () => {
    const content = generateClaudeMd(base);
    expect(content).toContain("Arrow functions");
    expect(content).toContain("pnpm lint");
    expect(content).toContain("pnpm test");
  });

  it("uses Python agent standards for a Python repo", () => {
    const content = generateClaudeMd({
      ...base,
      repos: [{ name: "API", slug: "api", path: ".", stack: ["python", "fastapi"] }],
    });
    expect(content).toContain("Type-hint");
    expect(content).toContain("pytest");
    expect(content).not.toContain("pnpm");
  });

  it("uses PHP agent standards for a Laravel repo", () => {
    const content = generateClaudeMd({
      ...base,
      repos: [{ name: "App", slug: "app", path: ".", stack: ["php", "laravel"] }],
    });
    expect(content).toContain("strict_types");
    expect(content).toContain("phpstan");
    expect(content).toContain("pest");
    expect(content).not.toContain("pnpm");
  });

  it("uses Go agent standards for a Go repo", () => {
    const content = generateClaudeMd({
      ...base,
      repos: [{ name: "API", slug: "api", path: ".", stack: ["go"] }],
    });
    expect(content).toContain("gofmt");
    expect(content).toContain("go test");
  });

  it("derives standards from all repos in a monorepo", () => {
    const content = generateClaudeMd({
      ...base,
      repos: [
        { name: "API", slug: "api", path: "./api", stack: ["python", "fastapi"] },
        { name: "Web", slug: "web", path: "./web", stack: ["typescript", "nextjs"] },
      ],
    });
    // Python has precedence in the detection order
    expect(content).toContain("pytest");
  });
});
