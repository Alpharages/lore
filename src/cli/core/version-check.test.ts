import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkVersionCompatibility, HealthResponse } from "./version-check.js";
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

  it("passes when version is exactly at the lower boundary", async () => {
    mockResponse({ status: "healthy", version: "0.1.0" });
    await expect(checkVersionCompatibility(baseConfig)).resolves.toBeUndefined();
  });

  it("passes when version is inside the range", async () => {
    mockResponse({ status: "healthy", version: "0.5.0" });
    await expect(checkVersionCompatibility(baseConfig)).resolves.toBeUndefined();
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
