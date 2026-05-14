#!/usr/bin/env node
/**
 * Publishes the CLI portion of this repo as @alpharages/lore on npm.
 *
 * Why a separate script: the main package.json carries server-side deps
 * (fastify, drizzle, pg, etc.) that are irrelevant to CLI consumers.
 * This script assembles a slim publish directory with only dist/cli/** and
 * a lean package.json containing just the CLI's runtime dependencies.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distCli = path.join(root, "dist", "cli");
const publishDir = path.join(root, ".npm-publish");

const otpArg = process.argv.slice(2).find((a) => a.startsWith("--otp="));
const otpFlag = otpArg ? ` ${otpArg}` : "";

const main = await fs.promises.readFile(path.join(root, "package.json"), "utf8");
const { version, engines } = JSON.parse(main);

const cliPackageJson = {
  name: "@alpharages/lore",
  version,
  description: "Lore CLI — institutional memory for BMAD-driven AI development",
  type: "module",
  bin: { lore: "./index.js" },
  dependencies: {
    "@inquirer/checkbox": "^5.1.5",
    commander: "^14.0.3",
    handlebars: "^4.7.9",
    semver: "^7.8.0",
    yaml: "^2.8.4",
  },
  engines,
  publishConfig: { access: "public" },
  keywords: ["lore", "mcp", "bmad", "ai", "memory", "cli"],
  license: "MIT",
  homepage: "https://github.com/alpharages/lore",
  repository: {
    type: "git",
    url: "git+https://github.com/alpharages/lore.git",
  },
};

// Clean and recreate publish dir
fs.rmSync(publishDir, { recursive: true, force: true });
fs.mkdirSync(publishDir, { recursive: true });

// Copy dist/cli/** into publish root
const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

copyDir(distCli, publishDir);

// Include CLI-focused README for the npm page
fs.copyFileSync(path.join(__dirname, "README.cli.md"), path.join(publishDir, "README.md"));

// Write slim package.json
fs.writeFileSync(
  path.join(publishDir, "package.json"),
  JSON.stringify(cliPackageJson, null, 2) + "\n"
);

// npm requires the bin entry to be executable
fs.chmodSync(path.join(publishDir, "index.js"), 0o755);

console.log(`Publishing @alpharages/lore@${version} from ${publishDir}`);
try {
  execSync(`npm publish --access public${otpFlag}`, { cwd: publishDir, stdio: "inherit" });
} finally {
  fs.rmSync(publishDir, { recursive: true, force: true });
}
console.log("Done.");
