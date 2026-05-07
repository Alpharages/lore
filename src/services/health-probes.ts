let cachedStatus: "reachable" | "unreachable" | "unknown" = "unknown";
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export const getOpenAIStatus = async (): Promise<"reachable" | "unreachable" | "unknown"> => {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "HEAD",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    cachedStatus = response.ok ? "reachable" : "unreachable";
  } catch {
    cachedStatus = "unreachable";
  } finally {
    clearTimeout(timeout);
  }

  cachedAt = now;
  return cachedStatus;
};

// For testing: allow resetting cache state
export const _resetOpenAIStatusCache = () => {
  cachedStatus = "unknown";
  cachedAt = 0;
};
