import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";

vi.mock("os", () => ({
  homedir: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

import {
  detectInstalledIdes,
  getProfileById,
  readIdeConfig,
  writeIdeConfig,
  configureIdeMcp,
} from "./ide-config.js";
import { LoreConfig } from "./config-parser.js";

const mockedHomedir = vi.mocked(os.homedir);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);
const mockedRenameSync = vi.mocked(fs.renameSync);

describe("IDE_PROFILES", () => {
  it("contains cursor profile", () => {
    const cursor = getProfileById("cursor");
    expect(cursor).toBeDefined();
    expect(cursor?.name).toBe("Cursor");
  });

  it("contains claude-desktop profile", () => {
    const claude = getProfileById("claude-desktop");
    expect(claude).toBeDefined();
    expect(claude?.name).toBe("Claude Desktop");
  });

  it("contains claude-code profile", () => {
    const profile = getProfileById("claude-code");
    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Claude Code");
  });

  it("contains antigravity profile", () => {
    const profile = getProfileById("antigravity");
    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Google Antigravity");
  });

  it("contains windsurf profile", () => {
    const profile = getProfileById("windsurf");
    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Windsurf");
  });

  it("contains cline profile", () => {
    const profile = getProfileById("cline");
    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Cline");
  });

  it("contains continue profile", () => {
    const profile = getProfileById("continue");
    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Continue");
  });
});

describe("detectInstalledIdes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue("/home/user");
  });

  it("returns IDs of IDEs whose config files exist", () => {
    mockedExistsSync.mockImplementation((p: string | Buffer | URL) => {
      if (typeof p === "string" && p.includes(".cursor")) return true;
      return false;
    });

    const result = detectInstalledIdes();
    expect(result).toContain("cursor");
    expect(result).not.toContain("claude-desktop");
  });

  it("returns empty array when no IDE configs exist", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(detectInstalledIdes()).toEqual([]);
  });
});

describe("readIdeConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue("/home/user");
  });

  it("returns empty mcpServers when config file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    const cursor = getProfileById("cursor")!;
    expect(readIdeConfig(cursor)).toEqual({ mcpServers: {} });
  });

  it("parses existing config file", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{"mcpServers":{"foo":{}}}');
    const cursor = getProfileById("cursor")!;
    expect(readIdeConfig(cursor)).toEqual({ mcpServers: { foo: {} } });
  });

  it("throws on malformed JSON", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("not-json");
    const cursor = getProfileById("cursor")!;
    expect(() => readIdeConfig(cursor)).toThrow("Malformed JSON");
  });
});

describe("writeIdeConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue("/home/user");
  });

  it("creates directory and writes config atomically", () => {
    mockedExistsSync.mockReturnValue(false);
    const cursor = getProfileById("cursor")!;
    writeIdeConfig(cursor, { mcpServers: {} });

    expect(mockedMkdirSync).toHaveBeenCalledWith("/home/user/.cursor", { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.cursor/mcp.json.tmp",
      expect.any(String),
      "utf-8"
    );
    expect(mockedRenameSync).toHaveBeenCalledWith(
      "/home/user/.cursor/mcp.json.tmp",
      "/home/user/.cursor/mcp.json"
    );
  });
});

describe("configureIdeMcp", () => {
  const baseConfig: LoreConfig = {
    lore: { version: "1.0.0" },
    project: { name: "Test", slug: "test" },
    mcp: { server: "https://lore.test" },
    repos: [{ path: "." }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue("/home/user");
  });

  it("returns true when config changes", () => {
    let renamed = false;
    mockedExistsSync.mockImplementation((p: unknown) => {
      if (typeof p === "string" && p.includes(".cursor") && !p.endsWith(".tmp")) {
        return renamed;
      }
      return false;
    });
    mockedReadFileSync.mockImplementation((p: unknown) => {
      if (typeof p === "string" && p.includes(".cursor") && !p.endsWith(".tmp") && renamed) {
        return JSON.stringify({
          mcpServers: {
            "lore-memory": { url: "https://lore.test/mcp" },
            gitnexus: { command: "npx", args: ["-y", "gitnexus", "--mcp"] },
          },
        });
      }
      return JSON.stringify({ mcpServers: {} });
    });
    mockedRenameSync.mockImplementation(() => {
      renamed = true;
    });

    const cursor = getProfileById("cursor")!;
    const updated = configureIdeMcp(cursor, baseConfig);
    expect(updated).toBe(true);
  });

  it("returns false when config is already up to date", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        mcpServers: {
          "lore-memory": { url: "https://lore.test/mcp" },
          gitnexus: { command: "npx", args: ["-y", "gitnexus", "--mcp"] },
        },
      })
    );
    const cursor = getProfileById("cursor")!;
    const updated = configureIdeMcp(cursor, baseConfig);
    expect(updated).toBe(false);
  });

  it("writes bmad entry when methodology is present", () => {
    mockedExistsSync.mockReturnValue(false);
    const cursor = getProfileById("cursor")!;
    const config: LoreConfig = {
      ...baseConfig,
      methodology: { type: "bmad", version: "1.2.0" },
    };
    configureIdeMcp(cursor, config);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers["bmad"]).toEqual({
      command: "npx",
      args: ["-y", "bmad-mcp-server@^1.2.0", "--mcp"],
    });
  });

  it("merges with existing mcpServers without destroying them", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        mcpServers: {
          other: { command: "foo" },
        },
      })
    );
    const cursor = getProfileById("cursor")!;
    configureIdeMcp(cursor, baseConfig);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.mcpServers["other"]).toEqual({ command: "foo" });
    expect(written.mcpServers["lore-memory"]).toBeDefined();
  });

  it("writes continue config in array format", () => {
    let renamed = false;
    mockedExistsSync.mockImplementation((p: unknown) => {
      if (typeof p === "string" && p.includes(".continue") && !p.endsWith(".tmp")) {
        return renamed;
      }
      return false;
    });
    mockedReadFileSync.mockImplementation((p: unknown) => {
      if (typeof p === "string" && p.includes(".continue") && !p.endsWith(".tmp") && renamed) {
        return JSON.stringify({
          experimental: {
            modelContextProtocolServers: [
              { name: "lore-memory", transport: { type: "http", url: "https://lore.test/mcp" } },
              {
                name: "gitnexus",
                transport: { type: "stdio", command: "npx", args: ["-y", "gitnexus", "--mcp"] },
              },
            ],
          },
        });
      }
      return JSON.stringify({ mcpServers: {} });
    });
    mockedRenameSync.mockImplementation(() => {
      renamed = true;
    });

    const continueProfile = getProfileById("continue")!;
    const updated = configureIdeMcp(continueProfile, baseConfig);
    expect(updated).toBe(true);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.experimental).toBeDefined();
    expect(written.experimental.modelContextProtocolServers).toBeInstanceOf(Array);
    expect(written.experimental.modelContextProtocolServers.length).toBe(2);
    expect(written.experimental.modelContextProtocolServers[0].name).toBe("lore-memory");
    expect(written.experimental.modelContextProtocolServers[0].transport.type).toBe("http");
    expect(written.experimental.modelContextProtocolServers[1].name).toBe("gitnexus");
    expect(written.experimental.modelContextProtocolServers[1].transport.type).toBe("stdio");
  });

  it("deduplicates continue servers by name on re-run", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        experimental: {
          modelContextProtocolServers: [
            { name: "lore-memory", transport: { type: "http", url: "https://old.test/mcp" } },
            { name: "other", transport: { type: "stdio", command: "foo" } },
          ],
        },
      })
    );
    const continueProfile = getProfileById("continue")!;
    configureIdeMcp(continueProfile, baseConfig);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.experimental.modelContextProtocolServers.length).toBe(3);
    const names = written.experimental.modelContextProtocolServers.map(
      (s: Record<string, unknown>) => s.name
    );
    expect(names).toEqual(["lore-memory", "gitnexus", "other"]);
    const loreMemory = written.experimental.modelContextProtocolServers.find(
      (s: Record<string, unknown>) => s.name === "lore-memory"
    );
    expect(loreMemory.transport.url).toBe("https://lore.test/mcp");
  });

  it("preserves unrelated keys in continue config", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        theme: "dark",
        experimental: {
          otherFeature: true,
        },
      })
    );
    const continueProfile = getProfileById("continue")!;
    configureIdeMcp(continueProfile, baseConfig);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.theme).toBe("dark");
    expect(written.experimental.otherFeature).toBe(true);
  });
});
