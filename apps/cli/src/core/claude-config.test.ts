import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertLoreSection } from "./claude-config.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from "fs";

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);

describe("upsertLoreSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new file with lore markers when file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    upsertLoreSection("/project/CLAUDE.md", "# Lore content");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/project/CLAUDE.md",
      "<!-- lore:start -->\n# Lore content\n<!-- lore:end -->\n",
      "utf-8"
    );
  });

  it("trims section content before wrapping", () => {
    mockedExistsSync.mockReturnValue(false);

    upsertLoreSection("/project/CLAUDE.md", "\n# Lore content\n\n");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/project/CLAUDE.md",
      "<!-- lore:start -->\n# Lore content\n<!-- lore:end -->\n",
      "utf-8"
    );
  });

  it("replaces existing lore section when markers are present", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      "# My existing content\n\n<!-- lore:start -->\n# Old lore\n<!-- lore:end -->\n"
    );

    upsertLoreSection("/project/CLAUDE.md", "# New lore content");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/project/CLAUDE.md",
      "# My existing content\n\n<!-- lore:start -->\n# New lore content\n<!-- lore:end -->\n",
      "utf-8"
    );
  });

  it("appends section to existing file when no markers are present", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("# My existing content\n");

    upsertLoreSection("/project/CLAUDE.md", "# Lore content");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/project/CLAUDE.md",
      "# My existing content\n\n<!-- lore:start -->\n# Lore content\n<!-- lore:end -->\n",
      "utf-8"
    );
  });

  it("adds leading newline before appended section when file does not end with newline", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("# My existing content");

    upsertLoreSection("/project/CLAUDE.md", "# Lore content");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/project/CLAUDE.md",
      "# My existing content\n\n<!-- lore:start -->\n# Lore content\n<!-- lore:end -->\n",
      "utf-8"
    );
  });

  it("preserves content before and after markers on update", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      "# Before\n\n<!-- lore:start -->\n# Old\n<!-- lore:end -->\n\n# After\n"
    );

    upsertLoreSection("/project/CLAUDE.md", "# New");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/project/CLAUDE.md",
      "# Before\n\n<!-- lore:start -->\n# New\n<!-- lore:end -->\n\n# After\n",
      "utf-8"
    );
  });

  it("is idempotent — running twice with same content produces same result", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("<!-- lore:start -->\n# Lore content\n<!-- lore:end -->\n");

    upsertLoreSection("/project/CLAUDE.md", "# Lore content");

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/project/CLAUDE.md",
      "<!-- lore:start -->\n# Lore content\n<!-- lore:end -->\n",
      "utf-8"
    );
  });
});
