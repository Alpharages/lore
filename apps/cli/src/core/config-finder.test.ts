import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findLoreYaml } from "./config-finder.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

import * as fs from "fs";

const mockedExistsSync = vi.mocked(fs.existsSync);

describe("findLoreYaml", () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  it("returns absolute path when lore.yaml exists in cwd", () => {
    process.cwd = () => "/home/user/project";
    mockedExistsSync.mockImplementation((p: fs.PathLike) => p === "/home/user/project/lore.yaml");

    const result = findLoreYaml();
    expect(result).toBe("/home/user/project/lore.yaml");
  });

  it("returns parent directory lore.yaml when cwd has none", () => {
    process.cwd = () => "/home/user/project/src";
    mockedExistsSync.mockImplementation((p: fs.PathLike) => p === "/home/user/project/lore.yaml");

    const result = findLoreYaml();
    expect(result).toBe("/home/user/project/lore.yaml");
  });

  it("throws descriptive error when no lore.yaml exists", () => {
    process.cwd = () => "/home/user/project";
    mockedExistsSync.mockReturnValue(false);

    expect(() => findLoreYaml()).toThrow(/lore.yaml not found/);
    expect(() => findLoreYaml()).toThrow(/\/home\/user\/project/);
  });

  it("throws when at filesystem root and no lore.yaml exists (no infinite loop)", () => {
    process.cwd = () => "/";
    mockedExistsSync.mockReturnValue(false);

    expect(() => findLoreYaml()).toThrow(/lore.yaml not found/);
  });
});
