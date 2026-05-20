import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

beforeEach(() => {
  process.env.NEXT_PUBLIC_LORE_API_URL ||= "http://localhost:3100";
  process.env.LORE_ADMIN_SECRET ||= "test-admin-secret";
  process.env.WEB_UI_SECRET ||= "test-web-secret";
});

const mockValidateSession = vi.fn();
vi.mock("@/lib/session-store", () => ({
  validateSession: (...args: unknown[]) => mockValidateSession(...args),
}));

vi.mock("@/lib/config", () => ({
  config: {
    apiUrl: "http://lore-server:3100",
    loreAdminSecret: "test-admin-secret",
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const makeRequest = (sessionCookie?: string, search = ""): NextRequest => {
  const headers = new Headers();
  if (sessionCookie) headers.set("cookie", `session=${sessionCookie}`);
  return new NextRequest(`http://localhost/api/patterns${search}`, { headers });
};

describe("GET /api/patterns (web proxy)", () => {
  beforeEach(() => {
    mockValidateSession.mockReset();
    mockFetch.mockReset();
  });

  it("returns 401 when no session cookie is present", async () => {
    mockValidateSession.mockReturnValue(false);
    const { GET } = await import("@/app/api/patterns/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session cookie is invalid", async () => {
    mockValidateSession.mockReturnValue(false);
    const { GET } = await import("@/app/api/patterns/route");
    const res = await GET(makeRequest("bad-token"));
    expect(res.status).toBe(401);
  });

  it("proxies to lore server with admin secret when session is valid", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ patterns: [], total: 0 }),
    });
    const { GET } = await import("@/app/api/patterns/route");
    const res = await GET(makeRequest("valid-token"));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/patterns"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-admin-secret",
        }),
      })
    );
  });

  it("forwards querystring params to the upstream URL", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ patterns: [], total: 0 }),
    });
    const { GET } = await import("@/app/api/patterns/route");
    await GET(makeRequest("valid-token", "?tags=fastify&category=architecture"));
    const upstreamUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(upstreamUrl).toContain("tags=fastify");
    expect(upstreamUrl).toContain("category=architecture");
  });

  it("returns the upstream response body and status code", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ patterns: [{ id: "p1", title: "Test pattern" }], total: 1 }),
    });
    const { GET } = await import("@/app/api/patterns/route");
    const res = await GET(makeRequest("valid-token"));
    const body = await res.json();
    expect(body.patterns).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});
