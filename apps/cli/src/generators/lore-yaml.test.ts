import { describe, it, expect } from "vitest";
import { buildLoreYaml, generateLoreYaml } from "./lore-yaml.js";
import type { WizardAnswers } from "../utils/init-prompts.js";

const baseAnswers: WizardAnswers = {
  projectName: "My Project",
  projectSlug: "my-project",
  serverUrl: "http://localhost:3100",
  repos: [
    { name: "Backend", slug: "backend", path: "../backend", stack: ["nestjs", "postgres"] },
    { name: "Frontend", slug: "frontend", path: "../frontend", stack: ["react", "vite"] },
  ],
  validateTracker: false,
};

describe("buildLoreYaml", () => {
  it("builds minimal doc without methodology", () => {
    const doc = buildLoreYaml(baseAnswers);
    expect(doc.lore.version).toBe("^1.0.0");
    expect(doc.project.name).toBe("My Project");
    expect(doc.project.slug).toBe("my-project");
    expect(doc.mcp.server).toBe("http://localhost:3100");
    expect(doc.repos).toHaveLength(2);
    expect(doc.repos[0].slug).toBe("backend");
    expect(doc.repos[0].stack).toEqual(["nestjs", "postgres"]);
    expect(doc.methodology).toBeUndefined();
    expect(doc.tracker).toBeUndefined();
  });

  it("builds doc with methodology and tracker", () => {
    const answers: WizardAnswers = {
      ...baseAnswers,
      methodology: { type: "bmad", version: "^6.0.0" },
      tracker: {
        type: "clickup",
        spaceId: "12345",
        backlogListId: "67890",
        activeSprintListId: "abcde",
        customFieldIds: { lesson_link: "field_xyz" },
      },
    };
    const doc = buildLoreYaml(answers);
    expect(doc.methodology).toEqual({ type: "bmad", version: "^6.0.0" });
    expect(doc.tracker).toEqual({
      type: "clickup",
      space_id: "12345",
      backlog_list_id: "67890",
      active_sprint_list_id: "abcde",
      config: { lesson_link: "field_xyz" },
    });
  });
});

describe("generateLoreYaml", () => {
  it("produces valid YAML string", () => {
    const yaml = generateLoreYaml(baseAnswers);
    expect(yaml).toContain("version: ^1.0.0");
    expect(yaml).toContain("name: My Project");
    expect(yaml).toContain("slug: my-project");
    expect(yaml).toContain("repos:");
  });
});
