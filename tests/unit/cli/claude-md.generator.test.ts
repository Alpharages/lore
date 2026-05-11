import { describe, it, expect } from "vitest";
import { generateClaudeMd } from "../../../src/cli/generators/claude-md.js";
import type { WizardAnswers } from "../../../src/cli/utils/init-prompts.js";

const baseAnswers: WizardAnswers = {
  projectName: "Test Project",
  projectSlug: "test-project",
  serverUrl: "http://localhost:3100",
  repos: [{ name: "API", slug: "api", path: ".", stack: ["typescript"] }],
  validateTracker: false,
};

describe("generateClaudeMd", () => {
  it("generates content from template", () => {
    const content = generateClaudeMd(baseAnswers);
    expect(content).toContain("Test Project");
    expect(content).toContain("test-project");
    expect(content).toContain("http://localhost:3100");
    expect(content).toContain("API");
    expect(content).toContain("typescript");
  });

  it("includes methodology when present", () => {
    const answers: WizardAnswers = {
      ...baseAnswers,
      methodology: { type: "bmad", version: "^6.0.0" },
    };
    const content = generateClaudeMd(answers);
    expect(content).toContain("bmad");
    expect(content).toContain("^6.0.0");
  });

  it("shows no methodology message when absent", () => {
    const content = generateClaudeMd(baseAnswers);
    expect(content).toContain("No methodology layer configured.");
  });
});
