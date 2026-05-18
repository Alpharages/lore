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
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { readInstallState, writeInstallState, clearInstallState } from "./state.js";

const mockedHomedir = vi.mocked(os.homedir);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);
const mockedRenameSync = vi.mocked(fs.renameSync);
const mockedUnlinkSync = vi.mocked(fs.unlinkSync);

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
      JSON.stringify({ last_install_at: "2026-01-01T00:00:00.000Z" })
    );
    expect(readInstallState()).toEqual({ last_install_at: "2026-01-01T00:00:00.000Z" });
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

  it("creates ~/.lore directory and writes state atomically", () => {
    writeInstallState({ last_install_at: "2026-01-01T00:00:00.000Z" });

    expect(mockedMkdirSync).toHaveBeenCalledWith("/home/user/.lore", { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json.tmp",
      JSON.stringify({ last_install_at: "2026-01-01T00:00:00.000Z" }, null, 2),
      "utf-8"
    );
    expect(mockedRenameSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json.tmp",
      "/home/user/.lore/install-state.json"
    );
  });

  it("merges new keys with existing state", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ last_install_at: "2026-01-01T00:00:00.000Z" })
    );

    writeInstallState({ lore_server_version: "1.0.0" });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json.tmp",
      JSON.stringify(
        { last_install_at: "2026-01-01T00:00:00.000Z", lore_server_version: "1.0.0" },
        null,
        2
      ),
      "utf-8"
    );
  });

  it("merges repos_analyzed records without overwriting existing ones", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        repos_analyzed: {
          "repo-a": "2026-01-01T00:00:00.000Z",
        },
      })
    );

    writeInstallState({
      repos_analyzed: {
        "repo-b": "2026-02-01T00:00:00.000Z",
      },
    });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json.tmp",
      JSON.stringify(
        {
          repos_analyzed: {
            "repo-a": "2026-01-01T00:00:00.000Z",
            "repo-b": "2026-02-01T00:00:00.000Z",
          },
        },
        null,
        2
      ),
      "utf-8"
    );
  });

  it("merges hooks_installed records without overwriting existing ones", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks_installed: {
          "repo-a": { post_commit: true, post_merge: true },
        },
      })
    );

    writeInstallState({
      hooks_installed: {
        "repo-b": { post_commit: true, post_merge: false },
      },
    });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json.tmp",
      JSON.stringify(
        {
          hooks_installed: {
            "repo-a": { post_commit: true, post_merge: true },
            "repo-b": { post_commit: true, post_merge: false },
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
        repos_analyzed: {
          "repo-a": "2026-01-01T00:00:00.000Z",
        },
      })
    );

    writeInstallState({
      repos_analyzed: {
        "repo-a": "2026-03-01T00:00:00.000Z",
      },
    });

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.lore/install-state.json.tmp",
      JSON.stringify(
        {
          repos_analyzed: {
            "repo-a": "2026-03-01T00:00:00.000Z",
          },
        },
        null,
        2
      ),
      "utf-8"
    );
  });
});

describe("clearInstallState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue("/home/user");
  });

  it("deletes the state file when it exists", () => {
    mockedExistsSync.mockReturnValue(true);
    clearInstallState();
    expect(mockedUnlinkSync).toHaveBeenCalledWith("/home/user/.lore/install-state.json");
  });

  it("does nothing when the state file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    clearInstallState();
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });
});
