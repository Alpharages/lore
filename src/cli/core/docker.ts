import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

export interface DockerResult {
  success: boolean;
  error?: string;
  exitCode: number | null;
}

const runCommand = async (cmd: string, args: string[], cwd?: string): Promise<DockerResult> => {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      stdio: "inherit",
    });

    child.on("error", (err: Error) => {
      resolve({
        success: false,
        error: err.message,
        exitCode: null,
      });
    });

    child.on("close", (code: number | null) => {
      resolve({
        success: code === 0,
        exitCode: code,
        error:
          code === 0
            ? undefined
            : `Command "${cmd} ${args.join(" ")}" failed with exit code ${code}`,
      });
    });
  });
};

export const dockerPull = async (image: string, tag: string): Promise<DockerResult> => {
  return runCommand("docker", ["pull", `${image}:${tag}`]);
};

export const dockerComposeRunMigrations = async (cwd: string): Promise<DockerResult> => {
  return runCommand(
    "docker",
    ["compose", "run", "--rm", "mcp-server", "npm", "run", "db:migrate"],
    cwd
  );
};

export const dockerComposeRestart = async (cwd: string): Promise<DockerResult> => {
  return runCommand("docker", ["compose", "up", "-d", "mcp-server"], cwd);
};

export const findDockerComposeDir = (startDir: string): string => {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "docker-compose.yml"))) return dir;
    if (fs.existsSync(path.join(dir, "docker-compose.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`docker-compose.yml not found in ${startDir} or any parent directory.`);
    }
    dir = parent;
  }
};
