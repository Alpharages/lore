import * as fs from "fs";
import * as path from "path";

const GITNEXUS_MARKER = "# lore: gitnexus-hook";
const HOOK_COMMAND = "npx gitnexus analyze --incremental --quiet &";

const HOOK_BLOCK = `\n${GITNEXUS_MARKER}\n${HOOK_COMMAND}\n`;

export interface GitHooksResult {
  installed: string[];
  skipped: string[];
  errors: string[];
}

export const installGitHooks = (repoPaths: string[]): GitHooksResult => {
  const results: GitHooksResult = { installed: [], skipped: [], errors: [] };

  for (const repoPath of repoPaths) {
    if (!repoPath || typeof repoPath !== "string") {
      results.errors.push(`invalid repo path: ${repoPath}`);
      continue;
    }
    if (!fs.existsSync(path.join(repoPath, ".git"))) {
      results.errors.push(`${repoPath}: not a git repository`);
      continue;
    }
    for (const hookName of ["post-commit", "post-merge"]) {
      try {
        installHook(repoPath, hookName, results);
      } catch (err: any) {
        results.errors.push(`${repoPath}/${hookName}: ${err.message}`);
      }
    }
  }

  return results;
};

const installHook = (repoPath: string, hookName: string, results: GitHooksResult): void => {
  const gitDir = path.join(repoPath, ".git");
  const hooksDir = path.join(gitDir, "hooks");
  const hookPath = path.join(hooksDir, hookName);

  fs.mkdirSync(hooksDir, { recursive: true });

  let existing = "";
  if (fs.existsSync(hookPath)) {
    existing = fs.readFileSync(hookPath, "utf-8");
  }

  if (existing.includes(GITNEXUS_MARKER)) {
    results.skipped.push(hookPath);
    return;
  }

  const newContent = existing
    ? existing.trimEnd() + HOOK_BLOCK
    : `#!/usr/bin/env bash\n${HOOK_BLOCK}`;

  fs.writeFileSync(hookPath, newContent, "utf-8");
  fs.chmodSync(hookPath, 0o755);
  results.installed.push(hookPath);
};
