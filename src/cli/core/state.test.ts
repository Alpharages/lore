import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
}));

import { readInstallState, writeInstallState } from "./state.js";

const mockedHomedir = vi.mocked(os.homedir);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);

describe("readInstallState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue("/home/user");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty object when state file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(readInstallState()).toEqual({});
  });

  it("returns parsed state when file exists", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastInstallAt: "2026-01-01T00:00:00.000Z" })
    );
    expect(readInstallState()).toEqual({ lastInstallAt: "2026-01-01T00:00:00.000Z" });
  });

  it("returns empty object when file contains invalid JSON", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("not-json");
    expect(readInstallState()).toEqual({});
  });
});

describe("writeInstallState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue("/home/user");
    mockedExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates ~/.lore directory and writes state", () => {
    writeInstallState({ lastInstallAt: "2026-01-01T00:00:00.000Z" });

    expect(mockedMkdirSync).toHaveBeenCalledWith("/home/user/.lore", { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json",
      JSON.stringify({ lastInstallAt: "2026-01-01T00:00:00.000Z" }, null, 2),
      "utf-8"
    );
  });

  it("merges new keys with existing state", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastInstallAt: "2026-01-01T00:00:00.000Z" })
    );

    writeInstallState({ serverVersionVerified: "1.0.0" });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json",
      JSON.stringify(
        { lastInstallAt: "2026-01-01T00:00:00.000Z", serverVersionVerified: "1.0.0" },
        null,
        2
      ),
      "utf-8"
    );
  });

  it("merges gitnexusAnalyzedAt records without overwriting existing ones", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        gitnexusAnalyzedAt: {
          "/path/repo-a": "2026-01-01T00:00:00.000Z",
        },
      })
    );

    writeInstallState({
      gitnexusAnalyzedAt: {
        "/path/repo-b": "2026-02-01T00:00:00.000Z",
      },
    });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json",
      JSON.stringify(
        {
          gitnexusAnalyzedAt: {
            "/path/repo-a": "2026-01-01T00:00:00.000Z",
            "/path/repo-b": "2026-02-01T00:00:00.000Z",
          },
        },
        null,
        2
      ),
      "utf-8"
    );
  });

  it("merges hooksInstalledAt records without overwriting existing ones", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooksInstalledAt: {
          "/path/repo-a": "2026-01-01T00:00:00.000Z",
        },
      })
    );

    writeInstallState({
      hooksInstalledAt: {
        "/path/repo-b": "2026-02-01T00:00:00.000Z",
      },
    });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json",
      JSON.stringify(
        {
          hooksInstalledAt: {
            "/path/repo-a": "2026-01-01T00:00:00.000Z",
            "/path/repo-b": "2026-02-01T00:00:00.000Z",
          },
        },
        null,
        2
      ),
      "utf-8"
    );
  });

  it("overwrites a specific repo timestamp when re-analyzed", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        gitnexusAnalyzedAt: {
          "/path/repo-a": "2026-01-01T00:00:00.000Z",
        },
      })
    );

    writeInstallState({
      gitnexusAnalyzedAt: {
        "/path/repo-a": "2026-03-01T00:00:00.000Z",
      },
    });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json",
      JSON.stringify(
        {
          gitnexusAnalyzedAt: {
            "/path/repo-a": "2026-03-01T00:00:00.000Z",
          },
        },
        null,
        2
      ),
      "utf-8"
    );
  });
});
