import * as semver from "semver";
import type { LoreConfig } from "./config-parser.js";

export interface HealthResponse {
  status: string;
  version: string;
}

export const checkVersionCompatibility = async (config: LoreConfig): Promise<string> => {
  const range = config.lore.version;
  const serverUrl = config.mcp.server;

  if (!semver.validRange(range)) {
    throw new Error(
      `Invalid semver range "${range}" in lore.yaml lore.version. ` +
        `Use a valid range (e.g. ">=0.1.0 <1.0.0").`
    );
  }

  let response: Response;
  try {
    response = await fetch(`${serverUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach Lore server at ${serverUrl}/health: ${(err as Error).message}\n` +
        `Ensure the server is running and mcp.server in lore.yaml is correct.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Lore server health check failed with status ${response.status}.\n` +
        `Ensure the server is running correctly.`
    );
  }

  let body: HealthResponse;
  try {
    body = (await response.json()) as HealthResponse;
  } catch {
    throw new Error(
      `Lore server at ${serverUrl} returned a non-JSON health response. ` +
        `Ensure the server is running correctly and not behind a misconfigured proxy.`
    );
  }
  const serverVersion = body.version;

  if (!serverVersion) {
    throw new Error(
      `Lore server at ${serverUrl} did not return a version in /health response.\n` +
        `Upgrade your server to a version that reports its version via GET /health.`
    );
  }

  if (!semver.valid(serverVersion)) {
    throw new Error(`Lore server returned an invalid semver version: "${serverVersion}".`);
  }

  if (!semver.satisfies(serverVersion, range)) {
    const minVersion = semver.minVersion(range);
    const isOlder = minVersion ? semver.lt(serverVersion, minVersion) : false;

    const suggestion = isOlder
      ? `The server (${serverVersion}) is older than required. Run \`lore update\` to upgrade it.`
      : `The server (${serverVersion}) is newer than the declared range "${range}". Update \`lore.version\` in lore.yaml.`;

    throw new Error(
      `Version incompatibility: server version ${serverVersion} does not satisfy range "${range}".\n${suggestion}`
    );
  }

  return serverVersion;
};
