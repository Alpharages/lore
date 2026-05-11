import { describe, it, expect, vi, beforeEach } from "vitest";
import { appendClaudeMdInclude } from "./claude-config.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from "fs";

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);

describe("appendClaudeMdInclude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates directory and file when neither exists", () => {
    mockedExistsSync.mockReturnValue(false);

    appendClaudeMdInclude("/projects/myapp/lore.yaml", "/home/user");

    expect(mockedMkdirSync).toHaveBeenCalledWith("/home/user/.claude", { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.claude/CLAUDE.md",
      "@/projects/myapp/CLAUDE.md\n"
    );
  });

  it("appends include line to existing file", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.claude/CLAUDE.md");
    mockedReadFileSync.mockReturnValue("@/projects/other/CLAUDE.md\n");

    appendClaudeMdInclude("/projects/myapp/lore.yaml", "/home/user");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.claude/CLAUDE.md",
      "@/projects/other/CLAUDE.md\n@/projects/myapp/CLAUDE.md\n"
    );
  });

  it("is idempotent — skips when exact line already exists", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.claude/CLAUDE.md");
    mockedReadFileSync.mockReturnValue("@/projects/myapp/CLAUDE.md\n");

    appendClaudeMdInclude("/projects/myapp/lore.yaml", "/home/user");

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it("skips when line exists with surrounding whitespace", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.claude/CLAUDE.md");
    mockedReadFileSync.mockReturnValue("  @/projects/myapp/CLAUDE.md  \n");

    appendClaudeMdInclude("/projects/myapp/lore.yaml", "/home/user");

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it("adds leading newline when existing file does not end with newline", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.claude/CLAUDE.md");
    mockedReadFileSync.mockReturnValue("some content");

    appendClaudeMdInclude("/projects/myapp/lore.yaml", "/home/user");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.claude/CLAUDE.md",
      "some content\n@/projects/myapp/CLAUDE.md\n"
    );
  });

  it("handles empty existing file", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.claude/CLAUDE.md");
    mockedReadFileSync.mockReturnValue("");

    appendClaudeMdInclude("/projects/myapp/lore.yaml", "/home/user");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/home/user/.claude/CLAUDE.md",
      "@/projects/myapp/CLAUDE.md\n"
    );
  });

  it("does not remove existing includes for other projects", () => {
    mockedExistsSync.mockImplementation((p) => p === "/home/user/.claude/CLAUDE.md");
    mockedReadFileSync.mockReturnValue("@/projects/other/CLAUDE.md\n");

    appendClaudeMdInclude("/projects/myapp/lore.yaml", "/home/user");

    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("@/projects/other/CLAUDE.md");
    expect(written).toContain("@/projects/myapp/CLAUDE.md");
  });
});
