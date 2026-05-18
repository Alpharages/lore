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

  const serverVersion = await getRunningVersion(serverUrl);

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

export const getRunningVersion = async (serverUrl: string): Promise<string> => {
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

  return serverVersion;
};

export const getLatestSatisfyingTag = async (image: string, range: string): Promise<string> => {
  // image can be "ghcr.io/alpharages/lore-memory-mcp" or "alpharages/lore-memory-mcp"
  let registry = "registry-1.docker.io";
  let repository = image;

  if (image.includes("/")) {
    const parts = image.split("/");
    if (parts[0].includes(".") || parts[0].includes(":")) {
      registry = parts[0];
      repository = parts.slice(1).join("/");
    }
  }

  // Handle default docker.io repository (library/ for official, or user/repo)
  if (registry === "registry-1.docker.io" && !repository.includes("/")) {
    repository = `library/${repository}`;
  }

  // Get auth token
  const authUrl = `https://${registry === "registry-1.docker.io" ? "auth.docker.io" : registry}/token?service=${registry}&scope=repository:${repository}:pull`;
  const authRes = await fetch(authUrl, { signal: AbortSignal.timeout(30_000) });
  let token: string | undefined;
  if (authRes.ok) {
    const authBody = (await authRes.json()) as { token?: string; access_token?: string };
    token = authBody.token || authBody.access_token;
  }

  const tagsUrl = `https://${registry}/v2/${repository}/tags/list`;
  const tagsRes = await fetch(tagsUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(30_000),
  });

  if (!tagsRes.ok) {
    throw new Error(`Failed to fetch tags from registry ${registry}: ${tagsRes.statusText}`);
  }

  const tagsBody = (await tagsRes.json()) as { tags: string[] };
  const validTags = tagsBody.tags.filter((t) => semver.valid(t));
  const latest = semver.maxSatisfying(validTags, range);

  if (!latest) {
    throw new Error(`No tags in registry for ${image} satisfy range "${range}".`);
  }

  return semver.clean(latest) ?? latest;
};

export const fetchChangelog = async (image: string, tag: string): Promise<string | null> => {
  // Best-effort: GitHub Container Registry images map to GitHub releases
  if (image.startsWith("ghcr.io/")) {
    const repo = image.replace("ghcr.io/", "");
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const body = (await res.json()) as { body?: string; name?: string; published_at?: string };
        return body.body || null;
      }
    } catch {
      // Best-effort: silently ignore fetch failures
    }
  }
  return null;
};

export const checkMigrationsCompatible = async (
  serverUrl: string,
  targetVersion: string
): Promise<{ compatible: boolean; message: string }> => {
  try {
    const res = await fetch(`${serverUrl}/migrations?target=${encodeURIComponent(targetVersion)}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const body = (await res.json()) as { compatible?: boolean; message?: string };
      return {
        compatible: body.compatible ?? true,
        message: body.message || "",
      };
    }
    if (res.status === 404) {
      return {
        compatible: true,
        message: "Migration check endpoint not available (best-effort).",
      };
    }
    return {
      compatible: true,
      message: `Migration check returned ${res.status}. Proceeding with caution.`,
    };
  } catch (err) {
    return {
      compatible: true,
      message: `Could not verify migrations: ${(err as Error).message}. Proceeding with caution.`,
    };
  }
};
