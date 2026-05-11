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
    expect(result.methodology?.tracker.type).toBe("clickup");
    expect(result.methodology?.tracker.space_id).toBe("12345");
  });
});
