import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readCursorConfig, writeCursorConfig } from "./cursor-config.js";
import { LoreConfig } from "./config-parser.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

import * as fs from "fs";

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);
const mockedRenameSync = vi.mocked(fs.renameSync);

describe("readCursorConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default object when file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const result = readCursorConfig("/home/user");
    expect(result).toEqual({ mcpServers: {} });
  });

  it("returns parsed JSON when file exists", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{"mcpServers":{"gitnexus":{"command":"npx"}}}');

    const result = readCursorConfig("/home/user");
    expect(result).toEqual({ mcpServers: { gitnexus: { command: "npx" } } });
  });

  it("throws when file contains malformed JSON", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("not json");

    expect(() => readCursorConfig("/home/user")).toThrow(/Malformed JSON/);
  });
});

describe("writeCursorConfig", () => {
  const baseConfig: LoreConfig = {
    lore: { version: "1.0.0" },
    project: { name: "Test", slug: "test" },
    mcp: { server: "https://lore.test" },
    repos: [{ path: "." }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates directory and file when neither exists", () => {
    mockedExistsSync.mockReturnValue(false);

    writeCursorConfig(baseConfig, "/home/user");

    expect(mockedMkdirSync).toHaveBeenCalledWith("/home/user/.cursor", { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalled();
    expect(mockedRenameSync).toHaveBeenCalledWith(
      "/home/user/.cursor/mcp.json.tmp",
      "/home/user/.cursor/mcp.json"
    );

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers).toHaveProperty("lore-memory");
    expect(written.mcpServers).toHaveProperty("gitnexus");
    expect(written.mcpServers).not.toHaveProperty("bmad");
  });

  it("writes lore-memory with correct url", () => {
    mockedExistsSync.mockReturnValue(false);

    writeCursorConfig(baseConfig, "/home/user");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers["lore-memory"]).toEqual({ url: "https://lore.test/mcp" });
  });

  it("writes gitnexus with correct command and args", () => {
    mockedExistsSync.mockReturnValue(false);

    writeCursorConfig(baseConfig, "/home/user");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers["gitnexus"]).toEqual({
      command: "npx",
      args: ["-y", "gitnexus", "--mcp"],
    });
  });

  it("writes bmad entry when methodology is declared", () => {
    mockedExistsSync.mockReturnValue(false);
    const config: LoreConfig = {
      ...baseConfig,
      methodology: {
        type: "bmad",
        version: "1.2.0",
        tracker: { type: "clickup" },
      },
    };

    writeCursorConfig(config, "/home/user");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers["bmad"]).toEqual({
      command: "npx",
      args: ["-y", "bmad-mcp-server@^1.2.0", "--mcp"],
    });
  });

  it("uses wildcard version for bmad when methodology.version is undefined", () => {
    mockedExistsSync.mockReturnValue(false);
    const config: LoreConfig = {
      ...baseConfig,
      methodology: {
        type: "bmad",
        tracker: { type: "clickup" },
      },
    };

    writeCursorConfig(config, "/home/user");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers["bmad"]).toEqual({
      command: "npx",
      args: ["-y", "bmad-mcp-server@latest", "--mcp"],
    });
  });

  it("updates existing entry in place without duplicating", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.cursor/mcp.json");
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        mcpServers: {
          "lore-memory": { url: "https://old.test/mcp" },
          other: { command: "foo" },
        },
      })
    );

    writeCursorConfig(baseConfig, "/home/user");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers["lore-memory"]).toEqual({ url: "https://lore.test/mcp" });
    expect(written.mcpServers["other"]).toEqual({ command: "foo" });
    expect(Object.keys(written.mcpServers)).toHaveLength(3);
  });

  it("is idempotent — running twice produces same result", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.cursor/mcp.json");
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        mcpServers: {
          "lore-memory": { url: "https://lore.test/mcp" },
          gitnexus: { command: "npx", args: ["-y", "gitnexus", "--mcp"] },
        },
      })
    );

    writeCursorConfig(baseConfig, "/home/user");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers).toHaveProperty("lore-memory");
    expect(written.mcpServers).toHaveProperty("gitnexus");
    expect(Object.keys(written.mcpServers)).toHaveLength(2);
  });

  it("preserves non-mcpServers keys in existing config", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.cursor/mcp.json");
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        version: "1.0",
        mcpServers: {},
      })
    );

    writeCursorConfig(baseConfig, "/home/user");

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.version).toBe("1.0");
  });
});
