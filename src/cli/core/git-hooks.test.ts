import { describe, it, expect, vi, beforeEach } from "vitest";
import { installGitHooks } from "./git-hooks.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
}));

import * as fs from "fs";

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);
const mockedChmodSync = vi.mocked(fs.chmodSync);

describe("installGitHooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("installs hooks in fresh repos", () => {
    mockedExistsSync.mockImplementation((p) => {
      if (String(p).endsWith(".git")) return true;
      return false;
    });

    const result = installGitHooks(["/repos/a", "/repos/b"]);

    expect(result.installed).toHaveLength(4);
    expect(result.installed).toContain("/repos/a/.git/hooks/post-commit");
    expect(result.installed).toContain("/repos/a/.git/hooks/post-merge");
    expect(result.installed).toContain("/repos/b/.git/hooks/post-commit");
    expect(result.installed).toContain("/repos/b/.git/hooks/post-merge");
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(4);
    expect(mockedChmodSync).toHaveBeenCalledTimes(4);

    const firstCall = mockedWriteFileSync.mock.calls[0];
    expect(firstCall[1]).toContain("#!/usr/bin/env bash");
    expect(firstCall[1]).toContain("# lore: gitnexus-hook");
    expect(firstCall[1]).toContain("npx gitnexus analyze --incremental --quiet &");
  });

  it("appends to existing hook files", () => {
    mockedExistsSync.mockImplementation((p) => {
      const sp = String(p);
      if (sp.endsWith(".git")) return true;
      if (sp.endsWith("post-commit") || sp.endsWith("post-merge")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("#!/bin/bash\necho 'existing'\n");

    const result = installGitHooks(["/repos/a"]);

    expect(result.installed).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);

    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("echo 'existing'");
    expect(written).toContain("# lore: gitnexus-hook");
    expect(written.indexOf("#!/bin/bash")).toBeLessThan(written.indexOf("# lore: gitnexus-hook"));
  });

  it("skips repos where marker is already present (idempotency)", () => {
    mockedExistsSync.mockImplementation((p) => {
      const sp = String(p);
      if (sp.endsWith(".git")) return true;
      if (sp.endsWith("post-commit") || sp.endsWith("post-merge")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      "#!/bin/bash\n# lore: gitnexus-hook\nnpx gitnexus analyze --incremental --quiet &\n"
    );

    const result = installGitHooks(["/repos/a"]);

    expect(result.installed).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped).toContain("/repos/a/.git/hooks/post-commit");
    expect(result.skipped).toContain("/repos/a/.git/hooks/post-merge");
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
    expect(mockedChmodSync).not.toHaveBeenCalled();
  });

  it("reports error for repo without .git directory", () => {
    mockedExistsSync.mockImplementation((p) => {
      if (String(p).endsWith(".git")) return false;
      return false;
    });

    const result = installGitHooks(["/not-a-repo"]);

    expect(result.installed).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not a git repository");
  });

  it("adds shebang when hook file exists but is empty", () => {
    mockedExistsSync.mockImplementation((p) => {
      const sp = String(p);
      if (sp.endsWith(".git")) return true;
      if (sp.endsWith("post-commit") || sp.endsWith("post-merge")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("");

    installGitHooks(["/repos/a"]);

    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("#!/usr/bin/env bash");
    expect(written).toContain("# lore: gitnexus-hook");
  });

  it("handles hook file with no trailing newline", () => {
    mockedExistsSync.mockImplementation((p) => {
      const sp = String(p);
      if (sp.endsWith(".git")) return true;
      if (sp.endsWith("post-commit") || sp.endsWith("post-merge")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("#!/bin/bash\necho 'existing'");

    installGitHooks(["/repos/a"]);

    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("echo 'existing'\n# lore: gitnexus-hook");
  });

  it("sets executable permissions on installed hooks", () => {
    mockedExistsSync.mockImplementation((p) => {
      const sp = String(p);
      if (sp.endsWith(".git")) return true;
      return false;
    });

    installGitHooks(["/repos/a"]);

    expect(mockedChmodSync).toHaveBeenCalledWith("/repos/a/.git/hooks/post-commit", 0o755);
    expect(mockedChmodSync).toHaveBeenCalledWith("/repos/a/.git/hooks/post-merge", 0o755);
  });

  it("continues installing for remaining repos when one errors", () => {
    mockedExistsSync.mockImplementation((p) => {
      const sp = String(p);
      if (sp === "/bad/.git") return false;
      if (sp.endsWith(".git")) return true;
      return false;
    });

    const result = installGitHooks(["/bad", "/good"]);

    expect(result.errors).toHaveLength(1);
    expect(result.installed).toHaveLength(2);
    expect(result.installed).toContain("/good/.git/hooks/post-commit");
    expect(result.installed).toContain("/good/.git/hooks/post-merge");
  });

  it("creates hooks directory when it does not exist", () => {
    mockedExistsSync.mockImplementation((p) => {
      const sp = String(p);
      if (sp.endsWith(".git")) return true;
      return false;
    });

    installGitHooks(["/repos/a"]);

    expect(mockedMkdirSync).toHaveBeenCalledWith("/repos/a/.git/hooks", { recursive: true });
  });

  it("guards against undefined repo path", () => {
    mockedExistsSync.mockImplementation((p) => {
      if (String(p).endsWith(".git")) return false;
      return false;
    });

    const result = installGitHooks([undefined as unknown as string]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("invalid repo path");
  });
});
