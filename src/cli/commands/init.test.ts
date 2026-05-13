import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("../utils/init-prompts.js", () => ({
  createReadline: vi.fn(),
  runWizard: vi.fn(),
  promptOverwrite: vi.fn(),
  warnIfInsecureUrl: vi.fn(),
}));

vi.mock("../api/register.js", () => ({
  checkHealth: vi.fn(),
  registerProject: vi.fn(),
}));

vi.mock("../generators/lore-yaml.js", () => ({
  generateLoreYaml: vi.fn(),
}));

vi.mock("../generators/claude-md.js", () => ({
  generateClaudeMd: vi.fn(),
}));

vi.mock("../generators/constitution.js", () => ({
  generateConstitution: vi.fn(),
}));

vi.mock("../generators/repo-identity.js", () => ({
  writeRepoIdentities: vi.fn(),
}));

import { initCommand } from "./init.js";
import * as fs from "fs";
import {
  createReadline,
  runWizard,
  promptOverwrite,
  warnIfInsecureUrl,
} from "../utils/init-prompts.js";
import { checkHealth, registerProject } from "../api/register.js";
import { generateLoreYaml } from "../generators/lore-yaml.js";
import { generateClaudeMd } from "../generators/claude-md.js";
import { generateConstitution } from "../generators/constitution.js";
import { writeRepoIdentities } from "../generators/repo-identity.js";

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);
const mockedCreateReadline = vi.mocked(createReadline);
const mockedRunWizard = vi.mocked(runWizard);
const mockedPromptOverwrite = vi.mocked(promptOverwrite);
const mockedWarnIfInsecureUrl = vi.mocked(warnIfInsecureUrl);
const mockedCheckHealth = vi.mocked(checkHealth);
const mockedRegisterProject = vi.mocked(registerProject);
const mockedGenerateLoreYaml = vi.mocked(generateLoreYaml);
const mockedGenerateClaudeMd = vi.mocked(generateClaudeMd);
const mockedGenerateConstitution = vi.mocked(generateConstitution);
const mockedWriteRepoIdentities = vi.mocked(writeRepoIdentities);

describe("initCommand", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  const originalAdminSecret = process.env.LORE_ADMIN_SECRET;

  const baseAnswers = {
    projectName: "My Project",
    projectSlug: "my-project",
    serverUrl: "http://localhost:3100",
    repos: [{ name: "api", slug: "api", path: ".", stack: ["ts", "node"] }],
    validateTracker: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    process.env.LORE_ADMIN_SECRET = "admin-secret";

    mockedCreateReadline.mockReturnValue({ close: vi.fn() } as any);
    mockedRunWizard.mockResolvedValue(baseAnswers as any);
    mockedCheckHealth.mockResolvedValue(true);
    mockedRegisterProject.mockResolvedValue({
      project_id: "uuid-123",
      api_key: "lore_test_abc123",
      message: "Project registered.",
    });
    mockedGenerateLoreYaml.mockReturnValue("lore:\n  version: 1.0.0\n");
    mockedGenerateClaudeMd.mockReturnValue("# CLAUDE.md\n");
    mockedGenerateConstitution.mockReturnValue("# Constitution\n");
    mockedWriteRepoIdentities.mockReturnValue(["/cwd/repos/api/REPO_IDENTITY.md"]);
    mockedExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    exitSpy.mockRestore();
    process.env.LORE_ADMIN_SECRET = originalAdminSecret;
  });

  it("exits with error when LORE_ADMIN_SECRET is not set", async () => {
    delete process.env.LORE_ADMIN_SECRET;

    await expect(initCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: LORE_ADMIN_SECRET environment variable is not set."
    );
  });

  it("runs wizard and generates files on success", async () => {
    await initCommand();

    expect(mockedRunWizard).toHaveBeenCalled();
    expect(mockedWarnIfInsecureUrl).toHaveBeenCalledWith("http://localhost:3100");
    expect(mockedCheckHealth).toHaveBeenCalledWith("http://localhost:3100");
    expect(mockedRegisterProject).toHaveBeenCalledWith("http://localhost:3100", "admin-secret", {
      name: "My Project",
      slug: "my-project",
      stack_tags: ["ts", "node"],
      repos: [{ slug: "api", stack_tags: ["ts", "node"] }],
    });
    expect(mockedGenerateLoreYaml).toHaveBeenCalledWith(baseAnswers);
    expect(mockedGenerateClaudeMd).toHaveBeenCalledWith(baseAnswers);
    expect(mockedGenerateConstitution).toHaveBeenCalledWith(baseAnswers);
    expect(mockedWriteRepoIdentities).toHaveBeenCalledWith(baseAnswers, expect.any(String));

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("lore.yaml"),
      "lore:\n  version: 1.0.0\n",
      "utf-8"
    );
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("CLAUDE.md"),
      "# CLAUDE.md\n",
      "utf-8"
    );
    expect(mockedMkdirSync).toHaveBeenCalledWith(expect.stringContaining("ops"), {
      recursive: true,
    });

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("Project registered successfully");
    expect(logs).toContain("lore_test_abc123");
  });

  it("exits when server is unreachable", async () => {
    mockedCheckHealth.mockResolvedValue(false);

    await expect(initCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Cannot reach Lore server at http://localhost:3100"
    );
  });

  it("prompts for overwrite when lore.yaml exists and user declines", async () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) =>
      typeof p === "string" && p.includes("lore.yaml") ? true : false
    );
    mockedPromptOverwrite.mockResolvedValue(false);

    await expect(initCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(consoleLogSpy).toHaveBeenCalledWith("Init cancelled.");
    expect(mockedRegisterProject).not.toHaveBeenCalled();
  });

  it("continues when lore.yaml exists and user confirms overwrite", async () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) =>
      typeof p === "string" && p.includes("lore.yaml") ? true : false
    );
    mockedPromptOverwrite.mockResolvedValue(true);

    await initCommand();

    expect(mockedRegisterProject).toHaveBeenCalled();
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("warns about tracker validation not implemented", async () => {
    mockedRunWizard.mockResolvedValue({
      ...baseAnswers,
      methodology: { type: "bmad" as const, version: "^6.0.0" },
      validateTracker: true,
    } as any);

    await initCommand();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Tracker connection validation is not yet fully implemented")
    );
  });

  it("exits with error when registerProject fails", async () => {
    mockedRegisterProject.mockRejectedValue(new Error("Slug already exists"));

    await expect(initCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Slug already exists");
  });

  it("exits with error on unexpected exception", async () => {
    mockedRunWizard.mockRejectedValue(new Error("Wizard crashed"));

    await expect(initCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Wizard crashed");
  });

  it("deduplicates stack tags across repos", async () => {
    mockedRunWizard.mockResolvedValue({
      ...baseAnswers,
      repos: [
        { name: "api", slug: "api", path: ".", stack: ["ts", "node"] },
        { name: "web", slug: "web", path: "./web", stack: ["ts", "react"] },
      ],
    } as any);

    await initCommand();

    expect(mockedRegisterProject).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        stack_tags: ["ts", "node", "react"],
      })
    );
  });

  it("closes readline on success", async () => {
    const closeFn = vi.fn();
    mockedCreateReadline.mockReturnValue({ close: closeFn } as any);

    await initCommand();

    expect(closeFn).toHaveBeenCalled();
  });

  it("closes readline on error", async () => {
    const closeFn = vi.fn();
    mockedCreateReadline.mockReturnValue({ close: closeFn } as any);
    mockedRunWizard.mockRejectedValue(new Error("fail"));

    await expect(initCommand()).rejects.toThrow("process.exit");

    expect(closeFn).toHaveBeenCalled();
  });
});
