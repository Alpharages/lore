import "server-only";

const apiUrl = process.env.NEXT_PUBLIC_LORE_API_URL;
if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_LORE_API_URL is required");
}

const webUiSecret = process.env.WEB_UI_SECRET;
if (!webUiSecret) {
  throw new Error("WEB_UI_SECRET is required");
}

// Default Secure on. Local HTTP development must opt out explicitly via
// COOKIE_SECURE=false — Next.js standalone forces NODE_ENV=production, so
// keying off NODE_ENV silently drops the session cookie on plain-HTTP
// localhost and breaks login (story 12.6 F4).
const cookieSecure = process.env.COOKIE_SECURE !== "false";

export const LORE_API_URL = apiUrl;

export const config = { apiUrl, webUiSecret, cookieSecure } as const;
