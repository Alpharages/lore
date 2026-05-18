import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const credentialsDir = (): string => path.join(os.homedir(), ".lore");
const credentialsPath = (): string => path.join(credentialsDir(), "credentials.json");

const readCredentials = (): Record<string, string> => {
  const filePath = credentialsPath();
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
};

export const writeCredential = (slug: string, apiKey: string): void => {
  const dir = credentialsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // Best-effort: ignore chmod failures (e.g. on non-POSIX volumes).
    }
  }
  const existing = readCredentials();
  const updated = { ...existing, [slug]: apiKey };
  const tmpPath = `${credentialsPath()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
  fs.renameSync(tmpPath, credentialsPath());
  try {
    fs.chmodSync(credentialsPath(), 0o600);
  } catch {
    // Best-effort: ignore chmod failures.
  }
};

export const getApiKey = (slug: string): string | undefined => readCredentials()[slug];
