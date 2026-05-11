import { describe, it, expect } from "vitest";
import { generateRepoIdentity } from "../../../src/cli/generators/repo-identity.js";
import type { WizardRepo, WizardAnswers } from "../../../src/cli/utils/init-prompts.js";

const baseAnswers: WizardAnswers = {
  projectName: "Test Project",
  projectSlug: "test-project",
  serverUrl: "http://localhost:3100",
  repos: [],
  validateTracker: false,
};

const repo: WizardRepo = {
  name: "Backend API",
  slug: "backend",
  path: "../backend",
  stack: ["nestjs", "postgres", "typescript"],
};

describe("generateRepoIdentity", () => {
  it("generates content from template", () => {
    const content = generateRepoIdentity(repo, baseAnswers);
    expect(content).toContain("Backend API");
    expect(content).toContain("backend");
    expect(content).toContain("../backend");
    expect(content).toContain("nestjs");
    expect(content).toContain("postgres");
    expect(content).toContain("typescript");
  });
});
