import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { findLoreYaml } from "../core/config-finder.js";
import { parseLoreConfig, LoreConfig } from "../core/config-parser.js";
import { checkVersionCompatibility } from "../core/version-check.js";
import { writeCursorConfig, readCursorConfig } from "../core/cursor-config.js";
import { appendClaudeMdInclude } from "../core/claude-config.js";
import { installGitHooks } from "../core/git-hooks.js";

export const installCommand = async (): Promise<void> => {
  let config: LoreConfig;
  let loreYamlPath: string;

  try {
    loreYamlPath = findLoreYaml();
    config = parseLoreConfig(loreYamlPath);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  try {
    await checkVersionCompatibility(config);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const homeDir = os.homedir();
  const cursorConfigPath = path.join(homeDir, ".cursor", "mcp.json");
  const claudeMdPath = path.join(homeDir, ".claude", "CLAUDE.md");
  const cursorExisted = fs.existsSync(cursorConfigPath);
  const claudeExisted = fs.existsSync(claudeMdPath);

  let cursorUpdated = false;
  try {
    const before = JSON.stringify(readCursorConfig(homeDir));
    writeCursorConfig(config, homeDir);
    const after = JSON.stringify(readCursorConfig(homeDir));
    cursorUpdated = before !== after;
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  let claudeUpdated = false;
  try {
    const before = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, "utf-8") : "";
    appendClaudeMdInclude(loreYamlPath, homeDir);
    const after = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, "utf-8") : "";
    claudeUpdated = before !== after;
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log("✓ Install complete.");
  console.log("");

  if (cursorUpdated) {
    console.log(`  ${cursorExisted ? "Updated" : "Created"} ~/.cursor/mcp.json`);
    console.log(`    • lore-memory  → ${config.mcp.server}/mcp`);
    console.log(`    • gitnexus     → npx -y gitnexus --mcp`);
    if (config.methodology) {
      const version = config.methodology.version;
      const versionSpec = version ? `^${version}` : "latest";
      console.log(`    • bmad         → npx -y bmad-mcp-server@${versionSpec} --mcp`);
    }
  } else {
    console.log("  ~/.cursor/mcp.json — no changes needed (already up to date)");
  }

  console.log("");

  if (claudeUpdated) {
    console.log(`  ${claudeExisted ? "Updated" : "Created"} ~/.claude/CLAUDE.md`);
    console.log(`    • Include → @${path.join(path.dirname(loreYamlPath), "CLAUDE.md")}`);
  } else {
    console.log("  ~/.claude/CLAUDE.md — no changes needed (already up to date)");
  }

  const loreYamlDir = path.dirname(loreYamlPath);
  const repoPaths = config.repos.map((r) => path.resolve(loreYamlDir, r.path));
  console.log("");
  console.log(`Installing git hooks for ${repoPaths.length} repo(s)…`);

  const hookResults = installGitHooks(repoPaths);

  for (const p of hookResults.installed) console.log(`  ✓ Installed hook: ${p}`);
  for (const p of hookResults.skipped) console.log(`  ↩ Already installed: ${p}`);
  for (const e of hookResults.errors) console.warn(`  ⚠ ${e}`);

  if (hookResults.errors.length > 0) {
    console.warn(
      "\n⚠️  Some hooks could not be installed (see above). Install completed with warnings."
    );
  } else {
    console.log("\n✓ Git hooks installed successfully.");
  }
};
