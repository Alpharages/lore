#!/usr/bin/env node
/**
 * Publishes @alpharages/lore to npm from the apps/cli workspace.
 * Assembles a publish directory from dist/ and the local package.json,
 * then runs `npm publish`.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const distDir = path.join(cliRoot, "dist");
const publishDir = path.join(cliRoot, ".npm-publish");

const otpArg = process.argv.slice(2).find((a) => a.startsWith("--otp="));
const otpFlag = otpArg ? ` ${otpArg}` : "";

const main = await fs.promises.readFile(path.join(cliRoot, "package.json"), "utf8");
const { version } = JSON.parse(main);

// Clean and recreate publish dir
fs.rmSync(publishDir, { recursive: true, force: true });
fs.mkdirSync(publishDir, { recursive: true });

// Copy dist/** into publish root
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

copyDir(distDir, publishDir);

// Include CLI-focused README for the npm page
fs.copyFileSync(path.join(__dirname, "README.cli.md"), path.join(publishDir, "README.md"));

// Copy package.json directly
fs.copyFileSync(path.join(cliRoot, "package.json"), path.join(publishDir, "package.json"));

// npm requires the bin entry to be executable
fs.chmodSync(path.join(publishDir, "index.js"), 0o755);

console.log(`Publishing @alpharages/lore@${version} from ${publishDir}`);
try {
  execSync(`npm publish --access public${otpFlag}`, { cwd: publishDir, stdio: "inherit" });
} finally {
  fs.rmSync(publishDir, { recursive: true, force: true });
}
console.log("Done.");
