import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";
import { findLoreYaml } from "../core/config-finder.js";
import { parseLoreConfig, LoreConfig } from "../core/config-parser.js";
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

const DEFAULT_IMAGE = "ghcr.io/alpharages/lore-memory-mcp";

const updateLoreVersion = (content: string, newVersion: string): string => {
  const lines = content.split("\n");
  const loreIndex = lines.findIndex((l) => l.trim() === "lore:");
  if (loreIndex === -1) return content;

  const loreIndent = lines[loreIndex].length - lines[loreIndex].trimStart().length;

  for (let i = loreIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Exit lore block if we hit another top-level key
    if (trimmed.length > 0 && !trimmed.startsWith("#") && indent <= loreIndent) {
      break;
    }

    if (trimmed.startsWith("version:")) {
      const prefix = line.substring(0, line.indexOf("version:") + "version:".length);
      const rest = trimmed.slice("version:".length).trim();
      const quote = rest.startsWith('"') ? '"' : rest.startsWith("'") ? "'" : "";
      lines[i] = `${prefix} ${quote}^${newVersion}${quote}`;
      break;
    }
  }

  return lines.join("\n");
};

export const updateCommand = async (): Promise<void> => {
  let loreYamlPath: string;
  let config: LoreConfig;

  try {
    loreYamlPath = findLoreYaml();
    config = parseLoreConfig(loreYamlPath);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const serverUrl = config.mcp.server;
  const versionRange = config.lore.version;
  const image = config.mcp.image || DEFAULT_IMAGE;

  console.log(`Checking for updates for ${image}…`);

  let runningVersion: string;
  try {
    runningVersion = await getRunningVersion(serverUrl);
    console.log(`  Current running version: v${runningVersion}`);
  } catch (err: any) {
    console.warn(`  ⚠ Could not reach running server: ${err.message}`);
    console.warn(`  Proceeding with offline update check…`);
    runningVersion = "0.0.0"; // Fallback to force update if unreachable
  }

  let latestTag: string;
  try {
    latestTag = await getLatestSatisfyingTag(image, versionRange);
    console.log(`  Latest compatible version: v${latestTag}`);
  } catch (err: any) {
    console.error(`Error: Failed to query registry: ${err.message}`);
    process.exit(1);
  }

  if (latestTag === runningVersion) {
    console.log(`\n✅ Already up to date (v${runningVersion})`);
    process.exit(0);
  }

  console.log(`\nAn update is available: v${runningVersion} → v${latestTag}`);

  // AC-4: Display changelog before prompting
  const changelog = await fetchChangelog(image, latestTag);
  if (changelog) {
    console.log("\n📋 Release notes:");
    console.log(
      changelog
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")
    );
  } else {
    console.log("\n  (Changelog not available for this image)");
  }

  // AC-5: Verify backward-compatible schema migrations
  const migrationCheck = await checkMigrationsCompatible(serverUrl, latestTag);
  if (!migrationCheck.compatible) {
    console.error(`\n❌ Migration compatibility check failed: ${migrationCheck.message}`);
    process.exit(1);
  }
  if (migrationCheck.message) {
    console.log(`\n  🔍 Migration check: ${migrationCheck.message}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await rl.question(`\nUpgrade lore-memory-mcp to v${latestTag}? [Y/n] `);
  rl.close();

  if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
    console.log("Cancelled.");
    process.exit(0);
  }

  let composeDir: string;
  try {
    composeDir = findDockerComposeDir(path.dirname(loreYamlPath));
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n[1/3] Pulling new image ${image}:${latestTag}…`);
  const pullRes = await dockerPull(image, latestTag);
  if (!pullRes.success) {
    console.error(`\n❌ Failed to pull image: ${pullRes.error}`);
    process.exit(1);
  }

  console.log(`\n[2/3] Running database migrations…`);
  const migrateRes = await dockerComposeRunMigrations(composeDir);
  if (!migrateRes.success) {
    console.error(`\n❌ Migration failed: ${migrateRes.error}`);
    process.exit(1);
  }

  console.log(`\n[3/3] Restarting server…`);
  const restartRes = await dockerComposeRestart(composeDir);
  if (!restartRes.success) {
    console.error(`\n❌ Restart failed: ${restartRes.error}`);
    process.exit(1);
  }

  console.log(`\nUpdating ${path.basename(loreYamlPath)}…`);
  try {
    const content = fs.readFileSync(loreYamlPath, "utf-8");
    const updatedContent = updateLoreVersion(content, latestTag);
    fs.writeFileSync(loreYamlPath, updatedContent, "utf-8");
  } catch (err: any) {
    console.error(`\n❌ Failed to update lore.yaml: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n✅ Successfully upgraded to v${latestTag}`);
};
