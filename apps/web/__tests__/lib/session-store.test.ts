/**
 * F5 — JWT-based stateless sessions.
 *
 * The previous Map-based store was invisible across runtimes; these tests
 * lock in that the token round-trips through HMAC verification and that
 * tampering / expiry are rejected. Cross-module-context behaviour (the
 * actual bug F5 fixes) is verified by importing two fresh instances of the
 * session-store module and confirming the same token validates in both.
 */

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_LORE_API_URL ||= "http://localhost:3100";
  process.env.WEB_UI_SECRET ||= "test-secret-do-not-use-in-prod";
});

describe("session-store (F5)", () => {
  it("creates a token that validates", async () => {
    const { createSession, validateSession } = await import("@/lib/session-store");
    const token = createSession();
    expect(typeof token).toBe("string");
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(validateSession(token)).toBe(true);
  });

  it("rejects a token with a mutated payload", async () => {
    const { createSession, validateSession } = await import("@/lib/session-store");
    const token = createSession();
    const [payload, sig] = token.split(".");
    // Flip the last char of the payload to invalidate the HMAC.
    const tampered = `${payload.slice(0, -1)}${payload.at(-1) === "A" ? "B" : "A"}.${sig}`;
    expect(validateSession(tampered)).toBe(false);
  });

  it("rejects a token with a mutated signature", async () => {
    const { createSession, validateSession } = await import("@/lib/session-store");
    const token = createSession();
    const [payload, sig] = token.split(".");
    const tampered = `${payload}.${sig.slice(0, -1)}${sig.at(-1) === "A" ? "B" : "A"}`;
    expect(validateSession(tampered)).toBe(false);
  });

  it("rejects a malformed token", async () => {
    const { validateSession } = await import("@/lib/session-store");
    expect(validateSession("")).toBe(false);
    expect(validateSession("no-dot-here")).toBe(false);
    expect(validateSession(".")).toBe(false);
    expect(validateSession("a.")).toBe(false);
    expect(validateSession(".b")).toBe(false);
  });

  it("rejects an expired token", async () => {
    // Re-import with a poisoned Date.now so the token expires before validation.
    const realNow = Date.now;
    Date.now = () => 1_000_000;
    const stale = (await import("@/lib/session-store")).createSession();
    Date.now = () => 1_000_000 + 10 * 24 * 60 * 60 * 1000;
    try {
      const { validateSession } = await import("@/lib/session-store");
      expect(validateSession(stale)).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  it("validates a token across separate module contexts (the F5 bug)", async () => {
    // Simulate the next dev situation: middleware and route load distinct
    // module instances. Using vite's module-reset hook to force two imports.
    const { createSession } = await import("@/lib/session-store");
    const token = createSession();

    // Drop the cached module so the next import yields a fresh module record.
    // (vi.resetModules clears the module graph including transitive imports.)
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("@/lib/session-store");
    expect(fresh.validateSession(token)).toBe(true);
  });
});
