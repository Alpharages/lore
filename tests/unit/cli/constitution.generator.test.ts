import { describe, it, expect } from "vitest";
import { generateConstitution } from "../../../src/cli/generators/constitution.js";
import type { WizardAnswers } from "../../../src/cli/utils/init-prompts.js";

const baseAnswers: WizardAnswers = {
  projectName: "Test Project",
  projectSlug: "test-project",
  serverUrl: "http://localhost:3100",
  repos: [
    { name: "Backend", slug: "backend", path: "../backend", stack: ["nestjs"] },
    { name: "Frontend", slug: "frontend", path: "../frontend", stack: ["react"] },
  ],
  validateTracker: false,
};

describe("generateConstitution", () => {
  it("generates content from template", () => {
    const content = generateConstitution(baseAnswers);
    expect(content).toContain("Test Project");
    expect(content).toContain("Backend");
    expect(content).toContain("backend");
    expect(content).toContain("Frontend");
    expect(content).toContain("frontend");
  });
});
