import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../core/config-finder.js", () => ({
  findLoreYaml: vi.fn(),
}));

vi.mock("../core/config-parser.js", () => ({
  parseLoreConfig: vi.fn(),
}));

vi.mock("../core/cursor-config.js", () => ({
  readCursorConfig: vi.fn(),
  writeCursorConfig: vi.fn(),
}));

vi.mock("../core/claude-config.js", () => ({
  appendClaudeMdInclude: vi.fn(),
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
import { readCursorConfig, writeCursorConfig } from "../core/cursor-config.js";
import { appendClaudeMdInclude } from "../core/claude-config.js";
import * as os from "os";
import * as fs from "fs";

const mockedFindLoreYaml = vi.mocked(findLoreYaml);
const mockedParseLoreConfig = vi.mocked(parseLoreConfig);
const mockedReadCursorConfig = vi.mocked(readCursorConfig);
const mockedWriteCursorConfig = vi.mocked(writeCursorConfig);
const mockedAppendClaudeMdInclude = vi.mocked(appendClaudeMdInclude);
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
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    mockedHomedir.mockReturnValue("/home/user");
    mockedFindLoreYaml.mockReturnValue("/projects/myapp/lore.yaml");
    mockedParseLoreConfig.mockReturnValue(baseConfig);
    mockedWriteCursorConfig.mockImplementation(() => {});
    mockedAppendClaudeMdInclude.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("prints summary when cursor and claude configs are updated", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadCursorConfig.mockReturnValueOnce({ mcpServers: {} }).mockReturnValueOnce({
      mcpServers: {
        "lore-memory": { url: "https://lore.test/mcp" },
        gitnexus: { command: "npx", args: ["-y", "gitnexus", "--mcp"] },
      },
    });
    mockedReadFileSync
      .mockReturnValueOnce("") // before
      .mockReturnValueOnce("@/projects/myapp/CLAUDE.md\n"); // after

    await installCommand();

    expect(mockedWriteCursorConfig).toHaveBeenCalledWith(baseConfig, "/home/user");
    expect(mockedAppendClaudeMdInclude).toHaveBeenCalledWith(
      "/projects/myapp/lore.yaml",
      "/home/user"
    );

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("Created ~/.cursor/mcp.json");
    expect(logs).toContain("Updated ~/.claude/CLAUDE.md");
    expect(logs).toContain("lore-memory");
    expect(logs).toContain("gitnexus");
  });

  it("prints 'no changes needed' when both configs are already up to date", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadCursorConfig.mockReturnValue({
      mcpServers: {
        "lore-memory": { url: "https://lore.test/mcp" },
        gitnexus: { command: "npx", args: ["-y", "gitnexus", "--mcp"] },
      },
    });
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");

    await installCommand();

    expect(mockedWriteCursorConfig).toHaveBeenCalledWith(baseConfig, "/home/user");
    expect(mockedAppendClaudeMdInclude).toHaveBeenCalledWith(
      "/projects/myapp/lore.yaml",
      "/home/user"
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
        tracker: { type: "clickup" },
      },
    };
    mockedParseLoreConfig.mockReturnValue(config);
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadCursorConfig.mockReturnValueOnce({ mcpServers: {} }).mockReturnValueOnce({
      mcpServers: {
        "lore-memory": { url: "https://lore.test/mcp" },
        gitnexus: { command: "npx", args: ["-y", "gitnexus", "--mcp"] },
        bmad: { command: "npx", args: ["-y", "bmad-mcp-server@^1.2.0", "--mcp"] },
      },
    });
    mockedReadFileSync
      .mockReturnValueOnce("") // before
      .mockReturnValueOnce("@/projects/myapp/CLAUDE.md\n"); // after

    await installCommand();

    const logs = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(logs).toContain("bmad");
    expect(logs).toContain("bmad-mcp-server@^1.2.0");
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

  it("exits with error when writeCursorConfig fails", async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadCursorConfig.mockReturnValue({ mcpServers: {} });
    mockedWriteCursorConfig.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    await expect(installCommand()).rejects.toThrow("process.exit");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Permission denied");
  });

  it("exits with error when appendClaudeMdInclude fails", async () => {
    mockedExistsSync.mockImplementation((p) => {
      if (p === "/home/user/.claude/CLAUDE.md") return true;
      return false;
    });
    mockedReadCursorConfig.mockReturnValueOnce({ mcpServers: {} }).mockReturnValueOnce({
      mcpServers: {
        "lore-memory": { url: "https://lore.test/mcp" },
        gitnexus: { command: "npx", args: ["-y", "gitnexus", "--mcp"] },
      },
    });
    mockedReadFileSync
      .mockReturnValueOnce("") // before
      .mockReturnValueOnce("@/projects/myapp/CLAUDE.md\n"); // after
    mockedAppendClaudeMdInclude.mockImplementation(() => {
      throw new Error("Disk full");
    });

    await expect(installCommand()).rejects.toThrow("process.exit");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Disk full");
  });
});
