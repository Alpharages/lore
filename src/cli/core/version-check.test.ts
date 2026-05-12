import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkVersionCompatibility,
  getRunningVersion,
  getLatestSatisfyingTag,
  fetchChangelog,
  checkMigrationsCompatible,
  HealthResponse,
} from "./version-check.js";
import { LoreConfig } from "./config-parser.js";

describe("checkVersionCompatibility", () => {
  const baseConfig: LoreConfig = {
    lore: { version: ">=0.1.0 <1.0.0" },
    project: { name: "Test", slug: "test" },
    mcp: { server: "https://lore.test" },
    repos: [{ path: "." }],
  };

  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const mockResponse = (body: HealthResponse, status = 200) => {
    fetchSpy.mockResolvedValue({
      ok: status === 200,
      status,
      json: async () => body,
    } as Response);
  };

  it("reads lore.version range from config and uses it for compatibility check", async () => {
    mockResponse({ status: "healthy", version: "0.5.0" });
    await checkVersionCompatibility(baseConfig);
    expect(fetchSpy).toHaveBeenCalledWith("https://lore.test/health", {
      method: "GET",
      signal: expect.any(AbortSignal),
    });
  });

  it("calls GET /health and reads server version", async () => {
    mockResponse({ status: "healthy", version: "0.1.0" });
    await checkVersionCompatibility(baseConfig);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns server version when version is exactly at the lower boundary", async () => {
    mockResponse({ status: "healthy", version: "0.1.0" });
    const result = await checkVersionCompatibility(baseConfig);
    expect(result).toBe("0.1.0");
  });

  it("returns server version when version is inside the range", async () => {
    mockResponse({ status: "healthy", version: "0.5.0" });
    const result = await checkVersionCompatibility(baseConfig);
    expect(result).toBe("0.5.0");
  });

  it("aborts with clear error when version is outside declared range (newer)", async () => {
    mockResponse({ status: "healthy", version: "2.0.0" });
    await expect(checkVersionCompatibility(baseConfig)).rejects.toThrow(
      /Version incompatibility: server version 2\.0\.0 does not satisfy range ">=0\.1\.0 <1\.0\.0"\.\n.*Update `lore\.version` in lore\.yaml/
    );
  });

  it("suggests lore update when server is older than required", async () => {
    mockResponse({ status: "healthy", version: "0.0.9" });
    await expect(checkVersionCompatibility(baseConfig)).rejects.toThrow(
      /Run `lore update` to upgrade it/
    );
  });

  it("throws clear error when server is unreachable", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(checkVersionCompatibility(baseConfig)).rejects.toThrow(
      /Cannot reach Lore server at https:\/\/lore\.test\/health: ECONNREFUSED\n.*Ensure the server is running and mcp\.server in lore\.yaml is correct\./
    );
  });

  it("throws clear error when health response is non-200", async () => {
    mockResponse({ status: "degraded", version: "0.1.0" }, 503);
    await expect(checkVersionCompatibility(baseConfig)).rejects.toThrow(
      "Lore server health check failed with status 503."
    );
  });

  it("throws graceful error when version field is missing from health response", async () => {
    mockResponse({ status: "healthy", version: "" });
    await expect(checkVersionCompatibility(baseConfig)).rejects.toThrow(
      /did not return a version in \/health response\.\n.*Upgrade your server to a version that reports its version via GET \/health\./
    );
  });

  it("throws clear error when server returns invalid semver", async () => {
    mockResponse({ status: "healthy", version: "not-a-version" });
    await expect(checkVersionCompatibility(baseConfig)).rejects.toThrow(
      'Lore server returned an invalid semver version: "not-a-version".'
    );
  });

  it("uses AbortSignal.timeout with 30_000 ms", async () => {
    mockResponse({ status: "healthy", version: "0.1.0" });
    await checkVersionCompatibility(baseConfig);
    const call = fetchSpy.mock.calls[0];
    const signal = call[1].signal as AbortSignal;
    expect(signal).toBeDefined();
  });

  it("throws clear error when lore.version range is invalid", async () => {
    const badConfig = { ...baseConfig, lore: { version: "not-a-range" } };
    await expect(checkVersionCompatibility(badConfig)).rejects.toThrow(
      /Invalid semver range "not-a-range" in lore\.yaml lore\.version/
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws clear error when server returns non-JSON body", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);
    await expect(checkVersionCompatibility(baseConfig)).rejects.toThrow(
      /returned a non-JSON health response/
    );
  });
});

describe("getRunningVersion", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns the version from a healthy server", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy", version: "1.2.3" }),
    } as Response);

    const version = await getRunningVersion("https://lore.test");
    expect(version).toBe("1.2.3");
  });

  it("throws when server is unreachable", async () => {
    fetchSpy.mockRejectedValue(new Error("timeout"));
    await expect(getRunningVersion("https://lore.test")).rejects.toThrow(
      /Cannot reach Lore server/
    );
  });

  it("throws when response is non-ok", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: "error" }),
    } as Response);
    await expect(getRunningVersion("https://lore.test")).rejects.toThrow(
      /health check failed with status 500/
    );
  });

  it("throws when version is missing", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy", version: "" }),
    } as Response);
    await expect(getRunningVersion("https://lore.test")).rejects.toThrow(
      /did not return a version/
    );
  });

  it("throws when version is invalid semver", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy", version: "not-a-version" }),
    } as Response);
    await expect(getRunningVersion("https://lore.test")).rejects.toThrow(/invalid semver version/);
  });
});

describe("getLatestSatisfyingTag", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns the latest tag satisfying the range", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/token?")) {
        return { ok: true, json: async () => ({ token: "tkn" }) } as Response;
      }
      if (urlStr.includes("/tags/list")) {
        return {
          ok: true,
          json: async () => ({ tags: ["0.9.0", "1.0.0", "1.1.0", "1.2.0", "2.0.0"] }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const tag = await getLatestSatisfyingTag("ghcr.io/alpharages/lore-memory-mcp", "^1.0.0");
    expect(tag).toBe("1.2.0");
  });

  it("throws when no tags satisfy the range", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/token?")) {
        return { ok: true, json: async () => ({ token: "tkn" }) } as Response;
      }
      if (urlStr.includes("/tags/list")) {
        return {
          ok: true,
          json: async () => ({ tags: ["0.1.0", "0.2.0"] }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    await expect(
      getLatestSatisfyingTag("ghcr.io/alpharages/lore-memory-mcp", "^1.0.0")
    ).rejects.toThrow(/No tags in registry/);
  });

  it("throws when registry returns non-ok for tags", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/token?")) {
        return { ok: true, json: async () => ({ token: "tkn" }) } as Response;
      }
      return { ok: false, status: 403, statusText: "Forbidden" } as Response;
    });

    await expect(
      getLatestSatisfyingTag("ghcr.io/alpharages/lore-memory-mcp", "^1.0.0")
    ).rejects.toThrow(/Failed to fetch tags/);
  });

  it("uses abort signal timeout on auth and tags requests", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/token?")) {
        expect(init?.signal).toBeDefined();
        return { ok: true, json: async () => ({ token: "tkn" }) } as Response;
      }
      if (urlStr.includes("/tags/list")) {
        expect(init?.signal).toBeDefined();
        return {
          ok: true,
          json: async () => ({ tags: ["1.0.0"] }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    await getLatestSatisfyingTag("ghcr.io/alpharages/lore-memory-mcp", "^1.0.0");
  });
});

describe("fetchChangelog", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns release body for ghcr images", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ body: "## Changes\n- Fixed bug" }),
    } as Response);

    const changelog = await fetchChangelog("ghcr.io/alpharages/lore-memory-mcp", "1.0.0");
    expect(changelog).toBe("## Changes\n- Fixed bug");
  });

  it("returns null for non-ghcr images", async () => {
    const changelog = await fetchChangelog("docker.io/library/nginx", "1.0.0");
    expect(changelog).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when GitHub API returns non-ok", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const changelog = await fetchChangelog("ghcr.io/alpharages/lore-memory-mcp", "1.0.0");
    expect(changelog).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchSpy.mockRejectedValue(new Error("network error"));

    const changelog = await fetchChangelog("ghcr.io/alpharages/lore-memory-mcp", "1.0.0");
    expect(changelog).toBeNull();
  });

  it("uses abort signal timeout", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ body: "" }),
    } as Response);

    await fetchChangelog("ghcr.io/alpharages/lore-memory-mcp", "1.0.0");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/alpharages/lore-memory-mcp/releases/tags/1.0.0",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});

describe("checkMigrationsCompatible", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns compatible true when endpoint says compatible", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ compatible: true, message: "All good" }),
    } as Response);

    const result = await checkMigrationsCompatible("https://lore.test", "1.1.0");
    expect(result.compatible).toBe(true);
    expect(result.message).toBe("All good");
  });

  it("returns compatible true with warning when endpoint returns 404", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await checkMigrationsCompatible("https://lore.test", "1.1.0");
    expect(result.compatible).toBe(true);
    expect(result.message).toContain("not available");
  });

  it("returns compatible true with warning when endpoint returns other error", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await checkMigrationsCompatible("https://lore.test", "1.1.0");
    expect(result.compatible).toBe(true);
    expect(result.message).toContain("500");
  });

  it("returns compatible true with warning when fetch throws", async () => {
    fetchSpy.mockRejectedValue(new Error("timeout"));

    const result = await checkMigrationsCompatible("https://lore.test", "1.1.0");
    expect(result.compatible).toBe(true);
    expect(result.message).toContain("Could not verify migrations");
  });

  it("defaults compatible to true when body lacks compatible field", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await checkMigrationsCompatible("https://lore.test", "1.1.0");
    expect(result.compatible).toBe(true);
  });
});
