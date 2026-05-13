import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { LoreConfig } from "./config-parser.js";

export const readCursorConfig = (homeDir = os.homedir()): Record<string, unknown> => {
  const configPath = path.join(homeDir, ".cursor", "mcp.json");
  if (!fs.existsSync(configPath)) {
    return { mcpServers: {} };
  }

  const content = fs.readFileSync(configPath, "utf-8");
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(`Malformed JSON in ${configPath}`);
  }
};

export const writeCursorConfig = (config: LoreConfig, homeDir = os.homedir()): void => {
  const cursorDir = path.join(homeDir, ".cursor");
  const configPath = path.join(cursorDir, "mcp.json");
  const tmpPath = `${configPath}.tmp`;

  if (!fs.existsSync(cursorDir)) {
    fs.mkdirSync(cursorDir, { recursive: true });
  }

  const existing = readCursorConfig(homeDir);
  const mcpServers = (existing.mcpServers as Record<string, unknown>) ?? {};

  const servers: Record<string, unknown> = { ...mcpServers };

  servers["lore-memory"] = {
    url: `${config.mcp.server}/mcp`,
  };

  servers["gitnexus"] = {
    command: "npx",
    args: ["-y", "gitnexus", "--mcp"],
  };

  if (config.methodology !== undefined && config.methodology !== null) {
    const version = config.methodology.version;
    const versionSpec = version
      ? version.startsWith("^") ||
        version.startsWith("~") ||
        version.startsWith(">=") ||
        version.startsWith(">")
        ? version
        : `^${version}`
      : "latest";
    servers["bmad"] = {
      command: "npx",
      args: ["-y", `bmad-mcp-server@${versionSpec}`, "--mcp"],
    };
  }

  const output = { ...existing, mcpServers: servers };

  fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2) + "\n");
  fs.renameSync(tmpPath, configPath);
};
