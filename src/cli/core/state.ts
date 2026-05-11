import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface InstallState {
  lastInstallAt?: string;
  serverVersionVerified?: string;
  hooksInstalledAt?: Record<string, string>;
  gitnexusAnalyzedAt?: Record<string, string>;
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

  if (patch.hooksInstalledAt) {
    merged.hooksInstalledAt = {
      ...existing.hooksInstalledAt,
      ...patch.hooksInstalledAt,
    };
  }

  if (patch.gitnexusAnalyzedAt) {
    merged.gitnexusAnalyzedAt = {
      ...existing.gitnexusAnalyzedAt,
      ...patch.gitnexusAnalyzedAt,
    };
  }

  fs.writeFileSync(statePath(), JSON.stringify(merged, null, 2), "utf-8");
};
