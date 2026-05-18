import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { findLoreYaml } from "../core/config-finder.js";
import { parseLoreConfig, LoreConfig, LoreRepo } from "../core/config-parser.js";
import { checkVersionCompatibility } from "../core/version-check.js";
import { appendClaudeMdInclude } from "../core/claude-config.js";
import { installGitHooks } from "../core/git-hooks.js";
import { analyzeAllRepos } from "../core/gitnexus.js";
import { readInstallState, writeInstallState, clearInstallState } from "../core/state.js";
import {
  IDE_PROFILES,
  detectInstalledIdes,
  getProfileById,
  configureIdeMcp,
} from "../core/ide-config.js";
import { getApiKey } from "../core/credentials.js";
import {
  createReadline,
  promptIdeSelection,
  promptClaudeInclude,
} from "../utils/install-prompts.js";

const getRepoSlug = (repo: LoreRepo, repoPath: string): string =>
  repo.slug || path.basename(repoPath);

const resolveIdeIds = async (options: { ide?: string; force?: boolean }): Promise<string[]> => {
  if (options.ide) {
    if (options.ide === "all") {
      return IDE_PROFILES.map((p) => p.id);
    }
    if (options.ide === "detected") {
      return detectInstalledIdes();
    }
    return options.ide
      .split(",")
      .map((s) => s.trim())
      .filter((s) => getProfileById(s) !== undefined);
  }

  const detected = detectInstalledIdes();

  if (process.stdin.isTTY) {
    const selected = await promptIdeSelection(IDE_PROFILES, detected);
    return selected;
  }

  // Non-TTY: fall back to detected profiles only (configure nothing if none found)
  return detected;
};

const resolveClaudeInclude = async (): Promise<boolean> => {
  const claudeDir = path.join(os.homedir(), ".claude");
  const detected = fs.existsSync(claudeDir);

  if (process.stdin.isTTY) {
    const rl = createReadline();
    try {
      return await promptClaudeInclude(rl, detected);
    } finally {
      rl.close();
    }
  }

  return true;
};

export const installCommand = async (
  options: { force?: boolean; ide?: string } = {}
): Promise<void> => {
  if (options.force) {
    clearInstallState();
  }

  const state = readInstallState();
  let config: LoreConfig;
  let loreYamlPath: string;

  try {
    loreYamlPath = findLoreYaml();
    config = parseLoreConfig(loreYamlPath);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  let serverVersion: string;
  try {
    serverVersion = await checkVersionCompatibility(config);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const homeDir = os.homedir();
  const selectedIdeIds = await resolveIdeIds(options);
  const configureClaude = await resolveClaudeInclude();

  const apiKey = getApiKey(config.project.slug) ?? process.env.LORE_API_KEY;
  if (!apiKey) {
    console.warn(
      "  ⚠ No API key found for this project. MCP auth will not be configured.\n" +
        "    Run `lore init` first, or set LORE_API_KEY and re-run install."
    );
  }

  // --- IDE MCP Configs ---
  const ideUpdates: { profileId: string; name: string; existed: boolean; updated: boolean }[] = [];

  for (const profileId of selectedIdeIds) {
    const profile = getProfileById(profileId);
    if (!profile) continue;

    const configPath = profile.configPath(homeDir);
    const existed = fs.existsSync(configPath);

    try {
      const updated = configureIdeMcp(profile, config, homeDir, apiKey);
      ideUpdates.push({ profileId, name: profile.name, existed, updated });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  // --- Claude Code context includes ---
  const claudeMdPath = path.join(homeDir, ".claude", "CLAUDE.md");
  const claudeExisted = fs.existsSync(claudeMdPath);
  let claudeUpdated = false;

  if (configureClaude) {
    try {
      const before = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, "utf-8") : "";
      appendClaudeMdInclude(loreYamlPath, homeDir);
      const after = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, "utf-8") : "";
      claudeUpdated = before !== after;
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  console.log("✓ Install complete.");
  console.log("");

  // Print IDE config summary
  if (ideUpdates.length > 0) {
    for (const { name, existed, updated } of ideUpdates) {
      if (updated) {
        console.log(`  ${existed ? "Updated" : "Created"} ${name} MCP config`);
        console.log(`    • lore-memory  → ${config.mcp.server}/mcp`);
        console.log(`    • gitnexus     → npx -y gitnexus --mcp`);
        if (config.methodology) {
          const version = config.methodology.version;
          const versionSpec = version
            ? version.startsWith("^") ||
              version.startsWith("~") ||
              version.startsWith(">=") ||
              version.startsWith(">")
              ? version
              : `^${version}`
            : "latest";
          console.log(`    • bmad         → npx -y bmad-mcp-server@${versionSpec} --mcp`);
        }
      } else {
        console.log(`  ${name} MCP config — no changes needed (already up to date)`);
      }
    }
  } else {
    console.log("  No IDEs selected for MCP configuration.");
  }

  console.log("");

  if (configureClaude) {
    if (claudeUpdated) {
      console.log(`  ${claudeExisted ? "Updated" : "Created"} ~/.claude/CLAUDE.md`);
      console.log(`    • Include → @${path.join(path.dirname(loreYamlPath), "CLAUDE.md")}`);
    } else {
      console.log("  ~/.claude/CLAUDE.md — no changes needed (already up to date)");
    }
  } else {
    console.log("  Claude Code context includes skipped.");
  }

  const loreYamlDir = path.dirname(loreYamlPath);
  const reposWithPaths = config.repos.map((repo) => {
    const repoPath = path.resolve(loreYamlDir, repo.path);
    return {
      repo,
      repoPath,
      slug: getRepoSlug(repo, repoPath),
    };
  });

  // --- Git Hooks ---
  const reposNeedingHooks = reposWithPaths.filter(({ slug }) => {
    const hooksState = state.hooks_installed?.[slug];
    if (!options.force && hooksState?.post_commit && hooksState?.post_merge) {
      return false;
    }
    return true;
  });

  const repoPathsForHooks = reposNeedingHooks.map(({ repoPath }) => repoPath);

  console.log("");
  console.log(`Checking git hooks for ${reposWithPaths.length} repo(s)…`);

  let hookResults: ReturnType<typeof installGitHooks>;
  if (repoPathsForHooks.length > 0) {
    hookResults = installGitHooks(repoPathsForHooks);

    for (const { slug, repoPath } of reposWithPaths) {
      if (!repoPathsForHooks.includes(repoPath)) {
        console.log(`  ↩ hooks already installed for ${slug}, skipping`);
      }
    }

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
  } else {
    hookResults = { installed: [], skipped: [], errors: [] };
    for (const { slug } of reposWithPaths) {
      console.log(`  ↩ hooks already installed for ${slug}, skipping`);
    }
    console.log("\n✓ Git hooks already up to date.");
  }

  // Build hooks_installed state
  const hooksInstalled: Record<string, { post_commit: boolean; post_merge: boolean }> = {
    ...state.hooks_installed,
  };

  const getRepoPathFromHookPath = (hookPath: string): string => {
    // hookPath = <repo>/.git/hooks/<hook-name>
    return path.dirname(path.dirname(path.dirname(hookPath)));
  };

  const repoHookStatus = new Map<string, { post_commit: boolean; post_merge: boolean }>();

  for (const hookPath of hookResults.installed) {
    const repoPath = getRepoPathFromHookPath(hookPath);
    const current = repoHookStatus.get(repoPath) || { post_commit: false, post_merge: false };
    if (path.basename(hookPath) === "post-commit") current.post_commit = true;
    if (path.basename(hookPath) === "post-merge") current.post_merge = true;
    repoHookStatus.set(repoPath, current);
  }

  for (const hookPath of hookResults.skipped) {
    const repoPath = getRepoPathFromHookPath(hookPath);
    const current = repoHookStatus.get(repoPath) || { post_commit: false, post_merge: false };
    if (path.basename(hookPath) === "post-commit") current.post_commit = true;
    if (path.basename(hookPath) === "post-merge") current.post_merge = true;
    repoHookStatus.set(repoPath, current);
  }

  for (const { slug, repoPath } of reposWithPaths) {
    const status = repoHookStatus.get(repoPath);
    if (status) {
      hooksInstalled[slug] = status;
    }
  }

  // --- GitNexus Analysis ---
  const reposNeedingAnalysis = reposWithPaths.filter(({ slug }) => {
    const alreadyAnalyzed = state.repos_analyzed?.[slug];
    if (!options.force && alreadyAnalyzed) {
      return false;
    }
    return true;
  });

  const repoPathsForAnalysis = reposNeedingAnalysis.map(({ repoPath }) => repoPath);

  console.log("");
  console.log(`Checking GitNexus analysis for ${reposWithPaths.length} repo(s)…`);

  let analysisResults: Awaited<ReturnType<typeof analyzeAllRepos>> = [];
  const reposAnalyzed: Record<string, string> = { ...state.repos_analyzed };

  if (repoPathsForAnalysis.length > 0) {
    analysisResults = await analyzeAllRepos(repoPathsForAnalysis);

    for (const { slug, repoPath } of reposWithPaths) {
      if (!repoPathsForAnalysis.includes(repoPath)) {
        const ts = state.repos_analyzed?.[slug];
        console.log(`  ↩ ${slug} already analyzed at ${ts}, skipping`);
      }
    }

    for (const result of analysisResults) {
      if (result.success && result.analyzedAt) {
        const matched = reposWithPaths.find(({ repoPath }) => repoPath === result.repoPath);
        if (matched) {
          reposAnalyzed[matched.slug] = result.analyzedAt;
        }
      }
    }

    if (analysisResults.some((r) => !r.success)) {
      console.warn(
        "\n⚠️  Some repos could not be analyzed (see above). Install completed with warnings."
      );
    } else {
      console.log("\n✓ GitNexus analysis complete.");
    }
  } else {
    for (const { slug } of reposWithPaths) {
      const ts = state.repos_analyzed?.[slug];
      console.log(`  ↩ ${slug} already analyzed at ${ts}, skipping`);
    }
    console.log("\n✓ GitNexus analysis already up to date.");
  }

  writeInstallState({
    last_install_at: new Date().toISOString(),
    lore_server_version: serverVersion,
    hooks_installed: hooksInstalled,
    repos_analyzed: reposAnalyzed,
  });

  console.log("✅ lore install complete");
};
