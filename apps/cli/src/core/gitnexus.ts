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

const STDERR_LINE_CAP = 20;
const STDERR_LINE_MAX_CHARS = 500;

export const runGitnexusAnalyze = async (repoPath: string): Promise<GitNexusResult> => {
  const slug = getRepoSlug(repoPath);

  return new Promise((resolve) => {
    const recentStderr: string[] = [];
    let stderrLinesSeen = 0;
    let stderrLinesPrinted = 0;

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
      for (const rawLine of text.split("\n")) {
        if (!rawLine.trim()) continue;
        const line =
          rawLine.length > STDERR_LINE_MAX_CHARS
            ? `${rawLine.slice(0, STDERR_LINE_MAX_CHARS)}… (truncated)`
            : rawLine;
        stderrLinesSeen++;
        recentStderr.push(line);
        if (recentStderr.length > STDERR_LINE_CAP) recentStderr.shift();
        if (stderrLinesPrinted < STDERR_LINE_CAP) {
          process.stderr.write(`[${slug}] ${line}\n`);
          stderrLinesPrinted++;
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
        const suppressed = stderrLinesSeen - stderrLinesPrinted;
        if (suppressed > 0) {
          process.stderr.write(
            `[${slug}] …(${suppressed} more stderr line${suppressed === 1 ? "" : "s"} suppressed)\n`
          );
        }
        const errorMsg =
          recentStderr.length > 0 ? recentStderr.join("\n") : `Process exited with code ${code}`;
        resolve({
          repoPath,
          success: false,
          error: errorMsg,
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
