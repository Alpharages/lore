let cachedStatus: "reachable" | "unreachable" | "unknown" = "unknown";
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getOpenAIStatus(): Promise<"reachable" | "unreachable" | "unknown"> {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    cachedStatus = "unknown";
    cachedAt = now;
    return cachedStatus;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "HEAD",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    cachedStatus = response.ok ? "reachable" : "unreachable";
  } catch {
    cachedStatus = "unreachable";
  }

  cachedAt = now;
  return cachedStatus;
}

// For testing: allow resetting cache state
export function _resetOpenAIStatusCache() {
  cachedStatus = "unknown";
  cachedAt = 0;
}
