import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseLoreConfig } from "./config-parser.js";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

import * as fs from "fs";

const mockedReadFileSync = vi.mocked(fs.readFileSync);

describe("parseLoreConfig", () => {
  const filePath = "/home/user/project/lore.yaml";

  const validYaml = `
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
repos:
  - path: "../backend"
    stack_tags:
      - nestjs
      - postgres
`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fully typed LoreConfig for valid yaml", () => {
    mockedReadFileSync.mockReturnValue(validYaml);

    const result = parseLoreConfig(filePath);

    expect(result.lore.version).toBe("1.0.0");
    expect(result.project.name).toBe("My Project");
    expect(result.project.slug).toBe("my-project");
    expect(result.mcp.server).toBe("https://your-server");
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].path).toBe("../backend");
    expect(result.repos[0].stack_tags).toEqual(["nestjs", "postgres"]);
  });

  it("throws when lore.version is missing", () => {
    mockedReadFileSync.mockReturnValue(`
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
repos:
  - path: "../backend"
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Missing required field "lore.version" in ${filePath}`
    );
  });

  it("throws when project.name is missing", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  slug: "my-project"
mcp:
  server: "https://your-server"
repos:
  - path: "../backend"
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Missing required field "project.name" in ${filePath}`
    );
  });

  it("throws when project.slug is missing", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
mcp:
  server: "https://your-server"
repos:
  - path: "../backend"
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Missing required field "project.slug" in ${filePath}`
    );
  });

  it("throws when mcp.server is missing", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
repos:
  - path: "../backend"
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Missing required field "mcp.server" in ${filePath}`
    );
  });

  it("throws when repos is missing", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Missing required field "repos" in ${filePath}`
    );
  });

  it("throws when repos is empty array", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
repos: []
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Missing required field "repos" in ${filePath}`
    );
  });

  it("throws when repos is null", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
repos: null
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Missing required field "repos" in ${filePath}`
    );
  });

  it("throws when methodology is present but tracker is absent", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
methodology:
  type: bmad
repos:
  - path: "../backend"
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Field "tracker" is required when "methodology" is present in ${filePath}`
    );
  });

  it("throws when methodology is present but tracker is an empty object", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
methodology:
  type: bmad
tracker: {}
repos:
  - path: "../backend"
`);

    expect(() => parseLoreConfig(filePath)).toThrow(
      `Field "tracker" is required when "methodology" is present in ${filePath}`
    );
  });

  it("returns LoreConfig with methodology and tracker when both present", () => {
    mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://your-server"
methodology:
  type: bmad
  version: "^6.0.0"
tracker:
  type: clickup
  space_id: "12345"
repos:
  - path: "../backend"
`);

    const result = parseLoreConfig(filePath);
    expect(result.methodology).toBeDefined();
    expect(result.methodology?.type).toBe("bmad");
    expect(result.methodology?.version).toBe("^6.0.0");
    expect(result.tracker?.type).toBe("clickup");
    expect(result.tracker?.space_id).toBe("12345");
  });

  describe("mcp.server URL scheme validation", () => {
    it("throws when mcp.server uses http for non-localhost", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "http://prod.example.com"
repos:
  - path: "../backend"
`);

      expect(() => parseLoreConfig(filePath)).toThrow(
        `lore.yaml: mcp.server must use https:// in production (got: "http://prod.example.com"). HTTP is only allowed for localhost.`
      );
    });

    it("throws when mcp.server uses http for non-localhost with port", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "http://my-server.com:3100"
repos:
  - path: "../backend"
`);

      expect(() => parseLoreConfig(filePath)).toThrow(
        `lore.yaml: mcp.server must use https:// in production (got: "http://my-server.com:3100"). HTTP is only allowed for localhost.`
      );
    });

    it("allows mcp.server with https", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://prod.example.com"
repos:
  - path: "../backend"
`);

      const result = parseLoreConfig(filePath);
      expect(result.mcp.server).toBe("https://prod.example.com");
    });

    it("allows mcp.server with https and path", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://my-server.com/mcp/v1"
repos:
  - path: "../backend"
`);

      const result = parseLoreConfig(filePath);
      expect(result.mcp.server).toBe("https://my-server.com/mcp/v1");
    });

    it("allows mcp.server with http for localhost", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "http://localhost:3100"
repos:
  - path: "../backend"
`);

      const result = parseLoreConfig(filePath);
      expect(result.mcp.server).toBe("http://localhost:3100");
    });

    it("allows mcp.server with http for localhost without port", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "http://localhost"
repos:
  - path: "../backend"
`);

      const result = parseLoreConfig(filePath);
      expect(result.mcp.server).toBe("http://localhost");
    });

    it("allows mcp.server with http for 127.0.0.1", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "http://127.0.0.1:3100"
repos:
  - path: "../backend"
`);

      const result = parseLoreConfig(filePath);
      expect(result.mcp.server).toBe("http://127.0.0.1:3100");
    });

    it("allows mcp.server with https for localhost", () => {
      mockedReadFileSync.mockReturnValue(`
lore:
  version: "1.0.0"
project:
  name: "My Project"
  slug: "my-project"
mcp:
  server: "https://localhost:3100"
repos:
  - path: "../backend"
`);

      const result = parseLoreConfig(filePath);
      expect(result.mcp.server).toBe("https://localhost:3100");
    });
  });
});
