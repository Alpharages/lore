import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { LoreConfig } from "./config-parser.js";

export interface IdeProfile {
  readonly id: string;
  readonly name: string;
  readonly configPath: (homeDir: string) => string;
  readonly serialize?: (
    loreServers: Record<string, unknown>,
    existing: Record<string, unknown>
  ) => Record<string, unknown>;
}

const loreMcpServers = (config: LoreConfig): Record<string, unknown> => {
  const servers: Record<string, unknown> = {
    "lore-memory": {
      url: `${config.mcp.server}/mcp`,
    },
    gitnexus: {
      command: "npx",
      args: ["-y", "gitnexus", "--mcp"],
    },
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

  return servers;
};

const defaultObjectSerialize = (
  loreServers: Record<string, unknown>,
  existing: Record<string, unknown>
): Record<string, unknown> => {
  const mcpServers = (existing.mcpServers as Record<string, unknown>) ?? {};
  const servers = { ...mcpServers, ...loreServers };
  return { ...existing, mcpServers: servers };
};

const continueSerialize = (
  loreServers: Record<string, unknown>,
  existing: Record<string, unknown>
): Record<string, unknown> => {
  const experimental = (existing.experimental as Record<string, unknown>) ?? {};
  const existingServers =
    (experimental.modelContextProtocolServers as Array<Record<string, unknown>>) ?? [];

  const loreServerEntries = Object.entries(loreServers).map(
    ([name, server]): Record<string, unknown> => {
      const serverRecord = server as Record<string, unknown>;
      if (serverRecord.url !== undefined) {
        return {
          name,
          transport: {
            type: "http",
            url: serverRecord.url,
          },
        };
      }
      return {
        name,
        transport: {
          type: "stdio",
          command: serverRecord.command,
          args: serverRecord.args,
        },
      };
    }
  );

  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];

  // Lore entries take precedence (updated URLs/commands)
  for (const entry of loreServerEntries) {
    const entryName = entry.name as string;
    if (entryName === undefined || seen.has(entryName)) continue;
    seen.add(entryName);
    merged.push(entry);
  }

  // Add existing entries not overridden by lore
  for (const entry of existingServers) {
    const entryName = entry.name as string;
    if (entryName === undefined || seen.has(entryName)) continue;
    seen.add(entryName);
    merged.push(entry);
  }

  const { mcpServers: _unused, ...existingRest } = existing;
  return {
    ...existingRest,
    experimental: {
      ...experimental,
      modelContextProtocolServers: merged,
    },
  };
};

export const IDE_PROFILES: IdeProfile[] = [
  {
    id: "cursor",
    name: "Cursor",
    configPath: (homeDir: string) => path.join(homeDir, ".cursor", "mcp.json"),
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    configPath: (homeDir: string) => {
      const platform = process.platform;
      if (platform === "darwin") {
        return path.join(
          homeDir,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json"
        );
      }
      if (platform === "win32") {
        return path.join(
          process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
          "Claude",
          "claude_desktop_config.json"
        );
      }
      return path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
    },
  },
  {
    id: "claude-code",
    name: "Claude Code",
    configPath: (homeDir: string) => path.join(homeDir, ".claude.json"),
  },
  {
    id: "antigravity",
    name: "Google Antigravity",
    configPath: (homeDir: string) => {
      const platform = process.platform;
      if (platform === "win32") {
        return path.join(
          process.env.USERPROFILE || homeDir,
          ".gemini",
          "antigravity",
          "mcp_config.json"
        );
      }
      return path.join(homeDir, ".gemini", "antigravity", "mcp_config.json");
    },
  },
  {
    id: "windsurf",
    name: "Windsurf",
    configPath: (homeDir: string) => {
      const platform = process.platform;
      if (platform === "win32") {
        return path.join(
          process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
          ".codeium",
          "windsurf",
          "mcp_config.json"
        );
      }
      return path.join(homeDir, ".codeium", "windsurf", "mcp_config.json");
    },
  },
  {
    id: "cline",
    name: "Cline",
    configPath: (homeDir: string) => {
      const platform = process.platform;
      if (platform === "darwin") {
        return path.join(
          homeDir,
          "Library",
          "Application Support",
          "Code",
          "User",
          "globalStorage",
          "saoudrizwan.claude-dev",
          "settings",
          "cline_mcp_settings.json"
        );
      }
      if (platform === "win32") {
        return path.join(
          process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
          "Code",
          "User",
          "globalStorage",
          "saoudrizwan.claude-dev",
          "settings",
          "cline_mcp_settings.json"
        );
      }
      return path.join(
        homeDir,
        ".config",
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json"
      );
    },
  },
  {
    id: "continue",
    name: "Continue",
    configPath: (homeDir: string) => path.join(homeDir, ".continue", "config.json"),
    serialize: continueSerialize,
  },
];

export const detectInstalledIdes = (homeDir = os.homedir()): string[] =>
  IDE_PROFILES.filter((profile) => fs.existsSync(profile.configPath(homeDir))).map(
    (profile) => profile.id
  );

export const readIdeConfig = (
  profile: IdeProfile,
  homeDir = os.homedir()
): Record<string, unknown> => {
  const configPath = profile.configPath(homeDir);
  if (!fs.existsSync(configPath)) {
    return { mcpServers: {} };
  }
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(`Malformed JSON in ${configPath}`);
  }
};

export const writeIdeConfig = (
  profile: IdeProfile,
  config: Record<string, unknown>,
  homeDir = os.homedir()
): void => {
  const configPath = profile.configPath(homeDir);
  const configDir = path.dirname(configPath);
  const tmpPath = `${configPath}.tmp`;

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, configPath);
};

export const configureIdeMcp = (
  profile: IdeProfile,
  loreConfig: LoreConfig,
  homeDir = os.homedir()
): boolean => {
  const existing = readIdeConfig(profile, homeDir);
  const servers = loreMcpServers(loreConfig);
  const output = profile.serialize
    ? profile.serialize(servers, existing)
    : defaultObjectSerialize(servers, existing);

  if (JSON.stringify(output) === JSON.stringify(existing)) return false;
  writeIdeConfig(profile, output, homeDir);
  return true;
};

export const getProfileById = (id: string): IdeProfile | undefined =>
  IDE_PROFILES.find((p) => p.id === id);
