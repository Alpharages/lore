import { spawn } from "child_process";
import * as path from "path";

export interface GitNexusResult {
  repoPath: string;
  success: boolean;
  error?: string;
  analyzedAt?: string;
}

const getRepoSlug = (repoPath: string): string => {
  return path.basename(repoPath);
};

export const runGitnexusAnalyze = async (repoPath: string): Promise<GitNexusResult> => {
  const slug = getRepoSlug(repoPath);

  return new Promise((resolve) => {
    let stderr = "";

    const child = spawn("npx", ["gitnexus", "analyze"], {
      cwd: repoPath,
      shell: false,
    });

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      for (const line of text.split("\n")) {
        if (line.trim()) {
          process.stdout.write(`[${slug}] ${line}\n`);
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      stderr += text;
      for (const line of text.split("\n")) {
        if (line.trim()) {
          process.stderr.write(`[${slug}] ${line}\n`);
        }
      }
    });

    child.on("error", (err: Error) => {
      resolve({
        repoPath,
        success: false,
        error: err.message,
      });
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({
          repoPath,
          success: true,
          analyzedAt: new Date().toISOString(),
        });
      } else {
        resolve({
          repoPath,
          success: false,
          error: stderr.trim() || `Process exited with code ${code}`,
        });
      }
    });
  });
};

export const analyzeAllRepos = async (repoPaths: string[]): Promise<GitNexusResult[]> => {
  const results: GitNexusResult[] = [];

  for (const repoPath of repoPaths) {
    const slug = getRepoSlug(repoPath);
    process.stdout.write(`Analyzing ${slug}… `);

    const result = await runGitnexusAnalyze(repoPath);
    results.push(result);

    if (result.success) {
      process.stdout.write("✓\n");
    } else {
      process.stdout.write("✗\n");
      console.warn(`  ⚠ ${result.error}`);
    }
  }

  return results;
};
