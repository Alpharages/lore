import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkHealth, registerProject } from "../../../src/cli/api/register.js";

describe("checkHealth", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns true when server responds with ok", async () => {
    fetchSpy.mockResolvedValue({ ok: true } as Response);
    const result = await checkHealth("http://localhost:3100");
    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3100/health", {
      method: "GET",
      signal: expect.any(AbortSignal),
    });
  });

  it("returns false when server responds with non-ok", async () => {
    fetchSpy.mockResolvedValue({ ok: false } as Response);
    const result = await checkHealth("http://localhost:3100");
    expect(result).toBe(false);
  });

  it("returns false when fetch throws", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    const result = await checkHealth("http://localhost:3100");
    expect(result).toBe(false);
  });
});

describe("registerProject", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns result on success", async () => {
    const mockResult = {
      project_id: "uuid-123",
      api_key: "lore_test_xxxxxxxxxxxxxxxx",
      message: "Project registered.",
    };
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as Response);

    const result = await registerProject("http://localhost:3100", "secret", {
      name: "Test",
      slug: "test",
      stack_tags: ["ts"],
      repos: [{ slug: "api", stack_tags: ["ts"] }],
    });

    expect(result).toEqual(mockResult);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3100/api/projects/register", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
  });

  it("throws on non-ok response", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 409,
      text: () => Promise.resolve("Duplicate slug"),
    } as Response);

    await expect(
      registerProject("http://localhost:3100", "secret", {
        name: "Test",
        slug: "test",
        stack_tags: [],
        repos: [],
      })
    ).rejects.toThrow("Registration failed 409: Duplicate slug");
  });
});
