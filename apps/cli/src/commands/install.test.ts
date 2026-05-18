import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../core/config-finder.js", () => ({
  findLoreYaml: vi.fn(),
}));

vi.mock("../core/config-parser.js", () => ({
  parseLoreConfig: vi.fn(),
}));

vi.mock("../core/git-hooks.js", () => ({
  installGitHooks: vi.fn(),
}));

vi.mock("../core/gitnexus.js", () => ({
  analyzeAllRepos: vi.fn(),
}));

vi.mock("../core/state.js", () => ({
  readInstallState: vi.fn(),
  writeInstallState: vi.fn(),
  clearInstallState: vi.fn(),
}));

vi.mock("../core/version-check.js", () => ({
  checkVersionCompatibility: vi.fn(),
}));

vi.mock("../core/credentials.js", () => ({
  getApiKey: vi.fn(),
}));

vi.mock("../core/ide-config.js", () => ({
  IDE_PROFILES: [
    { id: "cursor", name: "Cursor", configPath: (h: string) => `${h}/.cursor/mcp.json` },
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      configPath: (h: string) => `${h}/.claude-desktop/config.json`,
    },
  ],
  detectInstalledIdes: vi.fn(),
  getProfileById: vi.fn(),
  configureIdeMcp: vi.fn(),
}));

vi.mock("../utils/install-prompts.js", () => ({
  createReadline: vi.fn(),
  promptIdeSelection: vi.fn(),
}));

vi.mock("os", () => ({
  homedir: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { installCommand } from "./install.js";
import { findLoreYaml } from "../core/config-finder.js";
import { parseLoreConfig, LoreConfig } from "../core/config-parser.js";
import { installGitHooks } from "../core/git-hooks.js";
import { analyzeAllRepos } from "../core/gitnexus.js";
import { readInstallState, writeInstallState, clearInstallState } from "../core/state.js";
import { checkVersionCompatibility } from "../core/version-check.js";
import { detectInstalledIdes, getProfileById, configureIdeMcp } from "../core/ide-config.js";
import { promptIdeSelection } from "../utils/install-prompts.js";
import { getApiKey } from "../core/credentials.js";
import * as os from "os";
import * as fs from "fs";

const mockedFindLoreYaml = vi.mocked(findLoreYaml);
const mockedParseLoreConfig = vi.mocked(parseLoreConfig);
const mockedInstallGitHooks = vi.mocked(installGitHooks);
const mockedAnalyzeAllRepos = vi.mocked(analyzeAllRepos);
const mockedWriteInstallState = vi.mocked(writeInstallState);
const mockedReadInstallState = vi.mocked(readInstallState);
const mockedClearInstallState = vi.mocked(clearInstallState);
const mockedCheckVersionCompatibility = vi.mocked(checkVersionCompatibility);
const mockedDetectInstalledIdes = vi.mocked(detectInstalledIdes);
const mockedGetProfileById = vi.mocked(getProfileById);
const mockedConfigureIdeMcp = vi.mocked(configureIdeMcp);
const mockedPromptIdeSelection = vi.mocked(promptIdeSelection);
const mockedGetApiKey = vi.mocked(getApiKey);
const mockedHomedir = vi.mocked(os.homedir);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);

describe("installCommand", () => {
  const baseConfig: LoreConfig = {
    lore: { version: "1.0.0" },
    project: { name: "Test", slug: "test" },
    mcp: { server: "https://lore.test" },
    repos: [{ path: "." }],
  };

  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    mockedHomedir.mockReturnValue("/home/user");
    mockedFindLoreYaml.mockReturnValue("/projects/myapp/lore.yaml");
    mockedParseLoreConfig.mockReturnValue(baseConfig);
    mockedInstallGitHooks.mockReturnValue({ installed: [], skipped: [], errors: [] });
    mockedAnalyzeAllRepos.mockResolvedValue([]);
    mockedCheckVersionCompatibility.mockResolvedValue("1.0.0");
    mockedReadInstallState.mockReturnValue({});
    mockedGetApiKey.mockReturnValue(undefined);
    mockedDetectInstalledIdes.mockReturnValue(["cursor"]);
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedGetProfileById.mockImplementation((id: string) => {
      if (id === "cursor")
        return { id: "cursor", name: "Cursor", configPath: (h: string) => `${h}/.cursor/mcp.json` };
      if (id === "claude-desktop")
        return {
          id: "claude-desktop",
          name: "Claude Desktop",
          configPath: (h: string) => `${h}/.claude-desktop/config.json`,
        };
      return undefined;
    });
    mockedConfigureIdeMcp.mockReturnValue(false);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("prints summary when cursor config is updated", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync
      .mockReturnValueOnce("") // before
      .mockReturnValueOnce("@/projects/myapp/CLAUDE.md\n"); // after
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(true);

    await installCommand();

    expect(mockedConfigureIdeMcp).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cursor" }),
      baseConfig,
      "/home/user",
      undefined
    );

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("Created Cursor MCP config");
    expect(logs).toContain("lore-memory");
    expect(logs).toContain("gitnexus");
    expect(logs).not.toContain("~/.claude/CLAUDE.md");
  });

  it("installs git hooks for declared repos", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedInstallGitHooks.mockReturnValue({
      installed: [
        "/projects/myapp/.git/hooks/post-commit",
        "/projects/myapp/.git/hooks/post-merge",
      ],
      skipped: [],
      errors: [],
    });

    await installCommand();

    expect(mockedInstallGitHooks).toHaveBeenCalledWith(["/projects/myapp"]);

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("Checking git hooks for 1 repo(s)");
    expect(logs).toContain("✓ Installed hook: /projects/myapp/.git/hooks/post-commit");
    expect(logs).toContain("✓ Git hooks installed successfully.");
  });

  it("resolves relative repo paths against lore.yaml directory", async () => {
    mockedParseLoreConfig.mockReturnValue({
      ...baseConfig,
      repos: [{ path: "../backend" }, { path: "./frontend" }],
    });
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);

    await installCommand();

    expect(mockedInstallGitHooks).toHaveBeenCalledWith([
      "/projects/backend",
      "/projects/myapp/frontend",
    ]);
  });

  it("warns but does not exit when some hooks fail", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedInstallGitHooks.mockReturnValue({
      installed: ["/projects/myapp/.git/hooks/post-commit"],
      skipped: [],
      errors: ["/projects/myapp/.git/hooks/post-merge: not a git repository"],
    });

    await installCommand();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "  ⚠ /projects/myapp/.git/hooks/post-merge: not a git repository"
    );

    const warnLogs = consoleWarnSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(warnLogs).toContain("Some hooks could not be installed");
  });

  it("prints 'no changes needed' when both configs are already up to date", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);

    await installCommand();

    expect(mockedConfigureIdeMcp).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cursor" }),
      baseConfig,
      "/home/user",
      undefined
    );

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("no changes needed");
  });

  it("prints bmad entry when methodology is present", async () => {
    const config: LoreConfig = {
      ...baseConfig,
      methodology: {
        type: "bmad",
        version: "1.2.0",
      },
      tracker: { type: "clickup" },
    };
    mockedParseLoreConfig.mockReturnValue(config);
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(true);

    await installCommand();

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("bmad");
    expect(logs).toContain("bmad-mcp-server@^1.2.0");
  });

  it("does not double-prefix caret when version already starts with ^", async () => {
    const config: LoreConfig = {
      ...baseConfig,
      methodology: {
        type: "bmad",
        version: "^1.2.0",
      },
    };
    mockedParseLoreConfig.mockReturnValue(config);
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(true);

    await installCommand();

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("bmad-mcp-server@^1.2.0");
    expect(logs).not.toContain("bmad-mcp-server@^^1.2.0");
  });

  it("exits with error when lore.yaml is not found", async () => {
    mockedFindLoreYaml.mockImplementation(() => {
      throw new Error("lore.yaml not found");
    });

    await expect(installCommand()).rejects.toThrow("process.exit");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: lore.yaml not found");
  });

  it("exits with error when parseLoreConfig fails", async () => {
    mockedParseLoreConfig.mockImplementation(() => {
      throw new Error("Invalid YAML");
    });

    await expect(installCommand()).rejects.toThrow("process.exit");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Invalid YAML");
  });

  it("exits with error when configureIdeMcp fails", async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    await expect(installCommand()).rejects.toThrow("process.exit");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Permission denied");
  });

  it("runs gitnexus analysis for all repos and records state", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedInstallGitHooks.mockReturnValue({
      installed: [
        "/projects/myapp/.git/hooks/post-commit",
        "/projects/myapp/.git/hooks/post-merge",
      ],
      skipped: [],
      errors: [],
    });
    mockedAnalyzeAllRepos.mockResolvedValue([
      { repoPath: "/projects/myapp", success: true, analyzedAt: "2026-05-11T12:00:00.000Z" },
    ]);

    await installCommand();

    expect(mockedAnalyzeAllRepos).toHaveBeenCalledWith(["/projects/myapp"]);
    expect(mockedWriteInstallState).toHaveBeenCalled();

    const stateCall = mockedWriteInstallState.mock.calls[0][0];
    expect(stateCall.repos_analyzed).toEqual({
      myapp: "2026-05-11T12:00:00.000Z",
    });
    expect(stateCall.hooks_installed).toEqual({
      myapp: { post_commit: true, post_merge: true },
    });
    expect(stateCall.last_install_at).toBeDefined();
    expect(stateCall.lore_server_version).toBe("1.0.0");

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("Checking GitNexus analysis for 1 repo(s)");
    expect(logs).toContain("✓ GitNexus analysis complete.");
  });

  it("warns but completes when gitnexus analysis fails for a repo", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedInstallGitHooks.mockReturnValue({
      installed: ["/projects/myapp/.git/hooks/post-commit"],
      skipped: [],
      errors: [],
    });
    mockedAnalyzeAllRepos.mockResolvedValue([
      { repoPath: "/projects/myapp", success: false, error: "gitnexus not found" },
    ]);

    await installCommand();

    expect(mockedWriteInstallState).toHaveBeenCalled();
    const stateCall = mockedWriteInstallState.mock.calls[0][0];
    expect(stateCall.repos_analyzed).toEqual({});

    const warnLogs = consoleWarnSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(warnLogs).toContain("Some repos could not be analyzed");
  });

  it("does not record failed repo in repos_analyzed", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedInstallGitHooks.mockReturnValue({
      installed: [],
      skipped: [],
      errors: [],
    });
    mockedAnalyzeAllRepos.mockResolvedValue([
      { repoPath: "/projects/a", success: true, analyzedAt: "2026-05-11T12:00:00.000Z" },
      { repoPath: "/projects/b", success: false, error: "npx not found" },
      { repoPath: "/projects/c", success: true, analyzedAt: "2026-05-11T12:01:00.000Z" },
    ]);
    mockedParseLoreConfig.mockReturnValue({
      ...baseConfig,
      repos: [{ path: "/projects/a" }, { path: "/projects/b" }, { path: "/projects/c" }],
    });

    await installCommand();

    const stateCall = mockedWriteInstallState.mock.calls[0][0];
    expect(stateCall.repos_analyzed).toEqual({
      a: "2026-05-11T12:00:00.000Z",
      c: "2026-05-11T12:01:00.000Z",
    });
  });

  it("skips hooks and analysis for repos already in state", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedReadInstallState.mockReturnValue({
      hooks_installed: {
        myapp: { post_commit: true, post_merge: true },
      },
      repos_analyzed: {
        myapp: "2026-05-10T10:00:00.000Z",
      },
    });

    await installCommand();

    expect(mockedInstallGitHooks).not.toHaveBeenCalled();
    expect(mockedAnalyzeAllRepos).not.toHaveBeenCalled();

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("hooks already installed for myapp, skipping");
    expect(logs).toContain("myapp already analyzed at 2026-05-10T10:00:00.000Z, skipping");

    const stateCall = mockedWriteInstallState.mock.calls[0][0];
    expect(stateCall.hooks_installed).toEqual({
      myapp: { post_commit: true, post_merge: true },
    });
    expect(stateCall.repos_analyzed).toEqual({
      myapp: "2026-05-10T10:00:00.000Z",
    });
  });

  it("clears state and reinstalls everything when force is true", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedInstallGitHooks.mockReturnValue({
      installed: [
        "/projects/myapp/.git/hooks/post-commit",
        "/projects/myapp/.git/hooks/post-merge",
      ],
      skipped: [],
      errors: [],
    });
    mockedAnalyzeAllRepos.mockResolvedValue([
      { repoPath: "/projects/myapp", success: true, analyzedAt: "2026-05-11T12:00:00.000Z" },
    ]);
    mockedReadInstallState.mockReturnValue({
      hooks_installed: {
        myapp: { post_commit: true, post_merge: true },
      },
      repos_analyzed: {
        myapp: "2026-05-10T10:00:00.000Z",
      },
    });

    await installCommand({ force: true });

    expect(mockedClearInstallState).toHaveBeenCalled();
    expect(mockedInstallGitHooks).toHaveBeenCalledWith(["/projects/myapp"]);
    expect(mockedAnalyzeAllRepos).toHaveBeenCalledWith(["/projects/myapp"]);

    const stateCall = mockedWriteInstallState.mock.calls[0][0];
    expect(stateCall.hooks_installed).toEqual({
      myapp: { post_commit: true, post_merge: true },
    });
    expect(stateCall.repos_analyzed).toEqual({
      myapp: "2026-05-11T12:00:00.000Z",
    });
  });

  it("installs only new repos when state exists for others", async () => {
    mockedParseLoreConfig.mockReturnValue({
      ...baseConfig,
      repos: [
        { slug: "backend", path: "../backend" },
        { slug: "frontend", path: "./frontend" },
      ],
    });
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);
    mockedReadInstallState.mockReturnValue({
      hooks_installed: {
        backend: { post_commit: true, post_merge: true },
      },
      repos_analyzed: {
        backend: "2026-05-10T10:00:00.000Z",
      },
    });
    mockedInstallGitHooks.mockReturnValue({
      installed: [
        "/projects/myapp/frontend/.git/hooks/post-commit",
        "/projects/myapp/frontend/.git/hooks/post-merge",
      ],
      skipped: [],
      errors: [],
    });
    mockedAnalyzeAllRepos.mockResolvedValue([
      {
        repoPath: "/projects/myapp/frontend",
        success: true,
        analyzedAt: "2026-05-11T12:00:00.000Z",
      },
    ]);

    await installCommand();

    expect(mockedInstallGitHooks).toHaveBeenCalledWith(["/projects/myapp/frontend"]);
    expect(mockedAnalyzeAllRepos).toHaveBeenCalledWith(["/projects/myapp/frontend"]);

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("hooks already installed for backend, skipping");
    expect(logs).toContain("backend already analyzed at 2026-05-10T10:00:00.000Z, skipping");

    const stateCall = mockedWriteInstallState.mock.calls[0][0];
    expect(stateCall.hooks_installed).toEqual({
      backend: { post_commit: true, post_merge: true },
      frontend: { post_commit: true, post_merge: true },
    });
    expect(stateCall.repos_analyzed).toEqual({
      backend: "2026-05-10T10:00:00.000Z",
      frontend: "2026-05-11T12:00:00.000Z",
    });
  });

  it("resolves --ide all to all profile IDs", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedConfigureIdeMcp.mockReturnValue(false);

    await installCommand({ ide: "all" });

    expect(mockedPromptIdeSelection).not.toHaveBeenCalled();
    expect(mockedConfigureIdeMcp).toHaveBeenCalledTimes(2); // cursor + claude-desktop from mock
  });

  it("resolves --ide detected to detected profiles", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedDetectInstalledIdes.mockReturnValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);

    await installCommand({ ide: "detected" });

    expect(mockedPromptIdeSelection).not.toHaveBeenCalled();
    expect(mockedConfigureIdeMcp).toHaveBeenCalledTimes(1);
  });

  it("resolves --ide csv to matching profile IDs", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedConfigureIdeMcp.mockReturnValue(false);

    await installCommand({ ide: "cursor,bogus-id" });

    expect(mockedPromptIdeSelection).not.toHaveBeenCalled();
    expect(mockedConfigureIdeMcp).toHaveBeenCalledTimes(1);
  });

  it("passes apiKey from credentials to configureIdeMcp", async () => {
    mockedGetApiKey.mockReturnValue("lore_test_secretkey");
    mockedExistsSync.mockReturnValue(false);
    mockedPromptIdeSelection.mockResolvedValue(["cursor"]);
    mockedConfigureIdeMcp.mockReturnValue(false);

    await installCommand();

    expect(mockedConfigureIdeMcp).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cursor" }),
      baseConfig,
      "/home/user",
      "lore_test_secretkey"
    );
  });

  it("warns when no valid profiles match --ide", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");
    mockedConfigureIdeMcp.mockReturnValue(false);

    await installCommand({ ide: "bogus-id" });

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("No IDEs selected for MCP configuration");
  });
});
