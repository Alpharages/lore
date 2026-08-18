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

const makeRequest = (path: string, sessionCookie?: string, search = ""): NextRequest => {
  const headers = new Headers();
  if (sessionCookie) headers.set("cookie", `session=${sessionCookie}`);
  return new NextRequest(`http://localhost${path}${search}`, { headers });
};

const makePostRequest = (path: string, sessionCookie: string, body: unknown): NextRequest => {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("cookie", `session=${sessionCookie}`);
  return new NextRequest(`http://localhost${path}?project=acme`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

beforeEach(() => {
  mockValidateSession.mockReset();
  mockFetch.mockReset();
});

describe("GET /api/evolution/current (web proxy)", () => {
  it("returns 401 without a valid session", async () => {
    mockValidateSession.mockReturnValue(false);
    const { GET } = await import("@/app/api/evolution/current/route");
    const res = await GET(makeRequest("/api/evolution/current"));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("forwards the admin secret and the project scope upstream", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ items: [], total: 0, warnings: [] }),
    });

    const { GET } = await import("@/app/api/evolution/current/route");
    const res = await GET(makeRequest("/api/evolution/current", "valid", "?project=acme"));

    expect(res.status).toBe(200);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/project-evolution/current");
    expect(url).toContain("project=acme");
    expect((init as any).headers.Authorization).toBe("Bearer test-admin-secret");
  });

  it("passes the upstream status through on failure", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 404,
      json: async () => ({ error: "not_found" }),
    });

    const { GET } = await import("@/app/api/evolution/current/route");
    const res = await GET(makeRequest("/api/evolution/current", "valid", "?project=nope"));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});

describe("GET /api/evolution/proposals (web proxy)", () => {
  it("returns 401 without a valid session", async () => {
    mockValidateSession.mockReturnValue(false);
    const { GET } = await import("@/app/api/evolution/proposals/route");
    expect((await GET(makeRequest("/api/evolution/proposals"))).status).toBe(401);
  });

  it("returns the upstream proposal list", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ items: [{ id: "i1", title: "Pending" }], total: 1 }),
    });

    const { GET } = await import("@/app/api/evolution/proposals/route");
    const res = await GET(makeRequest("/api/evolution/proposals", "valid", "?project=acme"));

    expect((await res.json()).total).toBe(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/api/project-evolution/proposals");
  });
});

describe("GET /api/evolution/history (web proxy)", () => {
  it("proxies to the upstream history route", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ events: [], items: [], total_items: 0, limit: 50, offset: 0 }),
    });

    const { GET } = await import("@/app/api/evolution/history/route");
    const res = await GET(makeRequest("/api/evolution/history", "valid", "?project=acme"));

    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0][0]).toContain("/api/project-evolution/history");
  });
});

describe("GET /api/evolution/items/[id] (web proxy)", () => {
  it("returns 401 without a valid session", async () => {
    mockValidateSession.mockReturnValue(false);
    const { GET } = await import("@/app/api/evolution/items/[id]/route");
    const res = await GET(makeRequest("/api/evolution/items/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("encodes the id into the upstream path", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ item: { id: "abc" }, versions: [], evidence: [] }),
    });

    const { GET } = await import("@/app/api/evolution/items/[id]/route");
    await GET(makeRequest("/api/evolution/items/abc", "valid", "?project=acme"), {
      params: Promise.resolve({ id: "a b/c" }),
    });

    expect(mockFetch.mock.calls[0][0]).toContain(
      `/api/project-evolution/items/${encodeURIComponent("a b/c")}`
    );
  });
});

describe("POST /api/evolution/items/[id]/review (web proxy)", () => {
  it("returns 401 without a valid session", async () => {
    mockValidateSession.mockReturnValue(false);
    const { POST } = await import("@/app/api/evolution/items/[id]/review/route");
    const res = await POST(
      makePostRequest("/api/evolution/items/abc/review", "bad", { action: "accept" }),
      { params: Promise.resolve({ id: "abc" }) }
    );
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("forwards the review action as a JSON body", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ item_id: "abc", status: "accepted", revision: 1 }),
    });

    const { POST } = await import("@/app/api/evolution/items/[id]/review/route");
    const res = await POST(
      makePostRequest("/api/evolution/items/abc/review", "valid", {
        action: "accept",
        reviewer: "priya",
      }),
      { params: Promise.resolve({ id: "abc" }) }
    );

    expect(res.status).toBe(200);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/project-evolution/items/abc/review");
    expect((init as any).method).toBe("POST");
    expect(JSON.parse((init as any).body)).toEqual({ action: "accept", reviewer: "priya" });
  });

  it("surfaces the upstream refusal when acceptance is rejected", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 409,
      json: async () => ({
        error: "conflict",
        message: "An accepted item must have at least one evidence record (FR-PE-18).",
      }),
    });

    const { POST } = await import("@/app/api/evolution/items/[id]/review/route");
    const res = await POST(
      makePostRequest("/api/evolution/items/abc/review", "valid", { action: "accept" }),
      { params: Promise.resolve({ id: "abc" }) }
    );

    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("at least one evidence record");
  });
});
