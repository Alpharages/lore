import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface InstallState {
  last_install_at?: string;
  lore_server_version?: string;
  repos_analyzed?: Record<string, string>;
  hooks_installed?: Record<
    string,
    {
      post_commit: boolean;
      post_merge: boolean;
    }
  >;
}

const stateDir = (): string => path.join(os.homedir(), ".lore");

const statePath = (): string => path.join(stateDir(), "install-state.json");

export const readInstallState = (): InstallState => {
  const filePath = statePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as InstallState;
  } catch {
    return {};
  }
};

export const writeInstallState = (patch: Partial<InstallState>): void => {
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = readInstallState();

  const merged: InstallState = {
    ...existing,
    ...patch,
  };

  if (patch.hooks_installed) {
    merged.hooks_installed = {
      ...existing.hooks_installed,
      ...patch.hooks_installed,
    };
  }

  if (patch.repos_analyzed) {
    merged.repos_analyzed = {
      ...existing.repos_analyzed,
      ...patch.repos_analyzed,
    };
  }

  const tmpPath = `${statePath()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
  fs.renameSync(tmpPath, statePath());
};

export const clearInstallState = (): void => {
  const filePath = statePath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};
