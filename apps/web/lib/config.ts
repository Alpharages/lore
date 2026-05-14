import "server-only";

const apiUrl = process.env.NEXT_PUBLIC_LORE_API_URL;
if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_LORE_API_URL is required");
}

const webUiSecret = process.env.WEB_UI_SECRET;
if (!webUiSecret) {
  throw new Error("WEB_UI_SECRET is required");
}

export const LORE_API_URL = apiUrl;

export const config = { apiUrl, webUiSecret } as const;
