import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard: in v1.0.1 the published npm tarball omitted templates/,
// so `lore init` failed at runtime with "Template not found: CLAUDE.md.hbs".
// These tests lock down both halves of that bug:
//   1) The template file exists at the expected on-disk location.
//   2) The publish manifest (package.json "files") includes it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "../..");

describe("CLI template packaging", () => {
  it("ships templates/CLAUDE.md.hbs in the repo", () => {
    const templatePath = path.join(pkgRoot, "templates", "CLAUDE.md.hbs");
    expect(fs.existsSync(templatePath)).toBe(true);
  });

  it("declares templates/ in package.json files manifest", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf-8")) as {
      files?: string[];
    };
    expect(pkg.files).toBeDefined();
    expect(pkg.files).toContain("templates");
  });
});
