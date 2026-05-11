import * as fs from "fs";
import { parse as parseYaml } from "yaml";

export interface LoreRepo {
  path: string;
  stack_tags?: string[];
}

export interface LoreTracker {
  type: "clickup" | "jira" | "asana";
  [key: string]: unknown;
}

export interface LoreMethodology {
  type: string;
  version?: string;
  tracker: LoreTracker;
}

export interface LoreConfig {
  lore: { version: string };
  project: { name: string; slug: string };
  mcp: { server: string };
  repos: LoreRepo[];
  methodology?: LoreMethodology;
}

export const parseLoreConfig = (filePath: string): LoreConfig => {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = parseYaml(content) as Record<string, unknown>;

  const requiredFields = ["lore.version", "project.name", "project.slug", "mcp.server", "repos"];

  for (const field of requiredFields) {
    const keys = field.split(".");
    let current: unknown = raw;
    for (const key of keys) {
      if (current === null || typeof current !== "object" || !(key in current)) {
        throw new Error(`Missing required field "${field}" in ${filePath}`);
      }
      current = (current as Record<string, unknown>)[key];
    }
  }

  const repos = (raw["repos"] as unknown[]) ?? [];
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error(`Missing required field "repos" in ${filePath}`);
  }

  if (raw["methodology"] !== undefined && raw["methodology"] !== null) {
    const methodology = raw["methodology"] as Record<string, unknown>;
    const tracker = methodology["tracker"];
    if (
      tracker === undefined ||
      tracker === null ||
      typeof tracker !== "object" ||
      Array.isArray(tracker) ||
      Object.keys(tracker).length === 0
    ) {
      throw new Error(`Field "tracker" is required when "methodology" is present in ${filePath}`);
    }
  }

  return raw as unknown as LoreConfig;
};
