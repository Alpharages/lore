import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as readline from "readline/promises";
import { updateCommand } from "./update.js";
import { findLoreYaml } from "../core/config-finder.js";
import { parseLoreConfig } from "../core/config-parser.js";
import {
  getRunningVersion,
  getLatestSatisfyingTag,
  fetchChangelog,
  checkMigrationsCompatible,
} from "../core/version-check.js";
import {
  dockerPull,
  dockerComposeRunMigrations,
  dockerComposeRestart,
  findDockerComposeDir,
} from "../core/docker.js";

vi.mock("../core/config-finder.js", () => ({
  findLoreYaml: vi.fn(),
}));

vi.mock("../core/config-parser.js", () => ({
  parseLoreConfig: vi.fn(),
}));

vi.mock("../core/version-check.js", () => ({
  getRunningVersion: vi.fn(),
  getLatestSatisfyingTag: vi.fn(),
  fetchChangelog: vi.fn(),
  checkMigrationsCompatible: vi.fn(),
}));

vi.mock("../core/docker.js", () => ({
  dockerPull: vi.fn(),
  dockerComposeRunMigrations: vi.fn(),
  dockerComposeRestart: vi.fn(),
  findDockerComposeDir: vi.fn(),
}));

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("readline/promises", () => ({
  createInterface: vi.fn(),
}));

const mockedFindLoreYaml = vi.mocked(findLoreYaml);
const mockedParseLoreConfig = vi.mocked(parseLoreConfig);
const mockedGetRunningVersion = vi.mocked(getRunningVersion);
const mockedGetLatestSatisfyingTag = vi.mocked(getLatestSatisfyingTag);
const mockedFetchChangelog = vi.mocked(fetchChangelog);
const mockedCheckMigrationsCompatible = vi.mocked(checkMigrationsCompatible);
const mockedDockerPull = vi.mocked(dockerPull);
const mockedDockerComposeRunMigrations = vi.mocked(dockerComposeRunMigrations);
const mockedDockerComposeRestart = vi.mocked(dockerComposeRestart);
const mockedFindDockerComposeDir = vi.mocked(findDockerComposeDir);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);
const mockedCreateInterface = vi.mocked(readline.createInterface);

describe("updateCommand", () => {
  const baseConfig = {
    lore: { version: "^1.0.0" },
    project: { name: "Test", slug: "test" },
    mcp: { server: "https://lore.test" },
    repos: [{ path: "." }],
  };

  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    mockedFindLoreYaml.mockReturnValue("/projects/test/lore.yaml");
    mockedParseLoreConfig.mockReturnValue(baseConfig);
    mockedGetRunningVersion.mockResolvedValue("1.0.0");
    mockedGetLatestSatisfyingTag.mockResolvedValue("1.1.0");
    mockedFetchChangelog.mockResolvedValue(null);
    mockedCheckMigrationsCompatible.mockResolvedValue({ compatible: true, message: "" });

    mockedCreateInterface.mockReturnValue({
      question: vi.fn().mockResolvedValue("y"),
      close: vi.fn(),
    } as any);

    mockedDockerPull.mockResolvedValue({ success: true, exitCode: 0 });
    mockedDockerComposeRunMigrations.mockResolvedValue({ success: true, exitCode: 0 });
    mockedDockerComposeRestart.mockResolvedValue({ success: true, exitCode: 0 });
    mockedFindDockerComposeDir.mockReturnValue("/projects/test");
    mockedReadFileSync.mockReturnValue('lore:\n  version: "^1.0.0"\n');
    mockedWriteFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("exits with 0 if already up to date", async () => {
    mockedGetLatestSatisfyingTag.mockResolvedValue("1.0.0");

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Already up to date"));
  });

  it("performs full upgrade when confirmed", async () => {
    await updateCommand();

    expect(mockedDockerPull).toHaveBeenCalledWith("ghcr.io/alpharages/lore-memory-mcp", "1.1.0");
    expect(mockedDockerComposeRunMigrations).toHaveBeenCalled();
    expect(mockedDockerComposeRestart).toHaveBeenCalled();
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/projects/test/lore.yaml",
      expect.stringContaining('version: "^1.1.0"'),
      "utf-8"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Successfully upgraded to v1.1.0")
    );
  });

  it("uses custom image from config.mcp.image", async () => {
    mockedParseLoreConfig.mockReturnValue({
      ...baseConfig,
      mcp: { server: "https://lore.test", image: "custom.io/my-image" },
    });

    await updateCommand();

    expect(mockedDockerPull).toHaveBeenCalledWith("custom.io/my-image", "1.1.0");
  });

  it("exits if user declines", async () => {
    mockedCreateInterface.mockReturnValue({
      question: vi.fn().mockResolvedValue("n"),
      close: vi.fn(),
    } as any);

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockedDockerPull).not.toHaveBeenCalled();
  });

  it("exits with error if pull fails", async () => {
    mockedDockerPull.mockResolvedValue({ success: false, error: "Network error", exitCode: 1 });

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to pull image"));
  });

  it("exits with error if migration fails", async () => {
    mockedDockerComposeRunMigrations.mockResolvedValue({
      success: false,
      error: "DB error",
      exitCode: 1,
    });

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Migration failed"));
  });

  it("exits with error if restart fails", async () => {
    mockedDockerComposeRestart.mockResolvedValue({
      success: false,
      error: "Container error",
      exitCode: 1,
    });

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Restart failed"));
  });

  it("warns and proceeds if server is unreachable", async () => {
    mockedGetRunningVersion.mockRejectedValue(new Error("Connection refused"));

    await updateCommand();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not reach running server")
    );
    expect(mockedDockerPull).toHaveBeenCalled();
  });

  it("displays changelog when available", async () => {
    mockedFetchChangelog.mockResolvedValue("Fixed bugs\nImproved performance");

    await updateCommand();

    expect(mockedFetchChangelog).toHaveBeenCalledWith(
      "ghcr.io/alpharages/lore-memory-mcp",
      "1.1.0"
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Release notes"));
  });

  it("shows changelog unavailable notice when fetch returns null", async () => {
    mockedFetchChangelog.mockResolvedValue(null);

    await updateCommand();

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Changelog not available"));
  });

  it("shows migration check message when provided", async () => {
    mockedCheckMigrationsCompatible.mockResolvedValue({
      compatible: true,
      message: "Migrations verified.",
    });

    await updateCommand();

    expect(mockedCheckMigrationsCompatible).toHaveBeenCalledWith("https://lore.test", "1.1.0");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Migration check: Migrations verified.")
    );
  });

  it("exits with error if lore.yaml update fails", async () => {
    mockedWriteFileSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to update lore.yaml")
    );
  });

  it("passes compose dir from findDockerComposeDir to docker commands", async () => {
    mockedFindDockerComposeDir.mockReturnValue("/custom/compose/dir");

    await updateCommand();

    expect(mockedDockerComposeRunMigrations).toHaveBeenCalledWith("/custom/compose/dir");
    expect(mockedDockerComposeRestart).toHaveBeenCalledWith("/custom/compose/dir");
  });

  it("exits with error if docker-compose.yml is not found", async () => {
    mockedFindDockerComposeDir.mockImplementation(() => {
      throw new Error("docker-compose.yml not found in /projects/test or any parent directory.");
    });

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("docker-compose.yml not found")
    );
  });

  it("exits with error if migration check reports incompatible", async () => {
    mockedCheckMigrationsCompatible.mockResolvedValue({
      compatible: false,
      message: "Schema migration v1.1 is not backward-compatible.",
    });

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Migration compatibility check failed")
    );
    expect(mockedDockerPull).not.toHaveBeenCalled();
  });

  it("exits if user types 'no'", async () => {
    mockedCreateInterface.mockReturnValue({
      question: vi.fn().mockResolvedValue("no"),
      close: vi.fn(),
    } as any);

    await expect(updateCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockedDockerPull).not.toHaveBeenCalled();
  });
});
