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

const makeRequest = (id: string, sessionCookie?: string): NextRequest => {
  const headers = new Headers();
  if (sessionCookie) headers.set("cookie", `session=${sessionCookie}`);
  return new NextRequest(`http://localhost/api/patterns/${id}`, { headers });
};

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("DELETE /api/patterns/[id] (web proxy)", () => {
  beforeEach(() => {
    mockValidateSession.mockReset();
    mockFetch.mockReset();
  });

  it("returns 401 when no session cookie is present", async () => {
    mockValidateSession.mockReturnValue(false);
    const { DELETE } = await import("@/app/api/patterns/[id]/route");
    const res = await DELETE(makeRequest("some-id"), makeParams("some-id"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session cookie is invalid", async () => {
    mockValidateSession.mockReturnValue(false);
    const { DELETE } = await import("@/app/api/patterns/[id]/route");
    const res = await DELETE(makeRequest("some-id", "bad-token"), makeParams("some-id"));
    expect(res.status).toBe(401);
  });

  it("proxies DELETE to lore server with admin secret when session is valid", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ deleted_id: "p1" }),
    });
    const { DELETE } = await import("@/app/api/patterns/[id]/route");
    const res = await DELETE(makeRequest("p1", "valid-token"), makeParams("p1"));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/patterns/p1"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer test-admin-secret",
        }),
      })
    );
    const body = await res.json();
    expect(body.deleted_id).toBe("p1");
  });

  it("forwards the upstream status on delete", async () => {
    mockValidateSession.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      status: 404,
      json: async () => ({ error: "not_found" }),
    });
    const { DELETE } = await import("@/app/api/patterns/[id]/route");
    const res = await DELETE(makeRequest("unknown-id", "valid-token"), makeParams("unknown-id"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
