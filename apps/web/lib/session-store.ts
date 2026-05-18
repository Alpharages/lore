import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "./config";

/**
 * Stateless session tokens (story 12.6 F5).
 *
 * The previous module-scoped Map was invisible across runtimes — `next dev`
 * loads the middleware and API route runtimes as separate module contexts,
 * so a session created by POST /api/auth/login was unknown to
 * validateSession() in middleware.ts. We replaced it with a signed token
 * carried entirely in the cookie, so there is no server state to share.
 *
 * Format: `<base64url(payload)>.<base64url(HMAC-SHA256(payload, secret))>`
 * The HMAC is keyed off `WEB_UI_SECRET` (already required by /api/auth/login).
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const b64urlEncode = (buf: Buffer): string =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlDecode = (s: string): Buffer => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
};

const sign = (payload: string): string =>
  b64urlEncode(createHmac("sha256", config.webUiSecret).update(payload).digest());

export const createSession = (): string => {
  const payloadJson = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const payload = b64urlEncode(Buffer.from(payloadJson, "utf8"));
  return `${payload}.${sign(payload)}`;
};

export const validateSession = (token: string): boolean => {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const payload = token.slice(0, dot);
  const presented = token.slice(dot + 1);
  const expected = sign(payload);

  // Constant-time comparison to avoid leaking the HMAC byte-by-byte.
  const presentedBuf = b64urlDecode(presented);
  const expectedBuf = b64urlDecode(expected);
  if (presentedBuf.length !== expectedBuf.length) return false;
  if (!timingSafeEqual(presentedBuf, expectedBuf)) return false;

  try {
    const parsed = JSON.parse(b64urlDecode(payload).toString("utf8")) as { exp?: unknown };
    if (typeof parsed.exp !== "number") return false;
    return Date.now() < parsed.exp;
  } catch {
    return false;
  }
};

// No server state to clean up; the route handler still clears the cookie.
export const deleteSession = (_token: string): void => {};
