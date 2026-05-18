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
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = readCredentials();
  const updated = { ...existing, [slug]: apiKey };
  const tmpPath = `${credentialsPath()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, credentialsPath());
};

export const getApiKey = (slug: string): string | undefined => readCredentials()[slug];
