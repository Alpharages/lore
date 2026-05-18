#!/usr/bin/env node
/**
 * Publishes @alpharages/lore to npm from the apps/cli workspace.
 *
 * Honors the `files` field in package.json (which must include "dist" and
 * "templates"). The CLI-focused README at scripts/README.cli.md is swapped in
 * for the duration of `npm publish`, then restored — this keeps the published
 * package page user-facing without leaving a duplicate README in the repo.
 *
 * Why this script exists (vs raw `npm publish`):
 *   1) Sanity-check that `dist/` is built and the template ships in the tarball
 *      (regression: v1.0.1 published with no template, breaking `lore init`).
 *   2) Swap in scripts/README.cli.md as the published README without polluting
 *      the repo root with a second README.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");

const otpArg = process.argv.slice(2).find((a) => a.startsWith("--otp="));
const otpFlag = otpArg ? ` ${otpArg}` : "";
const dryRun = process.argv.includes("--dry-run");

const pkgPath = path.join(cliRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const { name, version, files } = pkg;

// --- Pre-flight checks ---
const required = [
  path.join(cliRoot, "dist", "index.js"),
  path.join(cliRoot, "templates", "CLAUDE.md.hbs"),
];
for (const p of required) {
  if (!fs.existsSync(p)) {
    console.error(`✗ Required file missing: ${path.relative(cliRoot, p)}`);
    console.error(`  Run \`pnpm --filter ${name} build\` before publishing.`);
    process.exit(1);
  }
}

if (!Array.isArray(files) || !files.includes("dist") || !files.includes("templates")) {
  console.error('✗ package.json "files" must include both "dist" and "templates".');
  console.error("  Without this, the published tarball will be missing runtime assets.");
  process.exit(1);
}

// --- README swap ---
const repoReadme = path.join(cliRoot, "README.md");
const cliReadme = path.join(__dirname, "README.cli.md");
const hasRepoReadme = fs.existsSync(repoReadme);
const repoReadmeBackup = hasRepoReadme ? fs.readFileSync(repoReadme, "utf8") : null;

fs.copyFileSync(cliReadme, repoReadme);

try {
  // Show what will ship before publishing.
  console.log(`\nDry-run of tarball contents for ${name}@${version}:`);
  execSync("npm pack --dry-run", { cwd: cliRoot, stdio: "inherit" });

  if (dryRun) {
    console.log("\n--dry-run: stopping before npm publish.");
  } else {
    console.log(`\nPublishing ${name}@${version}…`);
    execSync(`npm publish --access public${otpFlag}`, { cwd: cliRoot, stdio: "inherit" });
    console.log("\n✓ Published.");
  }
} finally {
  if (repoReadmeBackup !== null) {
    fs.writeFileSync(repoReadme, repoReadmeBackup, "utf8");
  } else {
    fs.rmSync(repoReadme, { force: true });
  }
}
