import { EMBEDDING_PROVIDER } from "./embedding.js";

let cachedStatus: "reachable" | "unreachable" | "unknown" = "unknown";
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

const probeOpenAI = async (signal: AbortSignal): Promise<"reachable" | "unreachable"> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) return "unreachable";
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "HEAD",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  return response.ok ? "reachable" : "unreachable";
};

const probeOllama = async (signal: AbortSignal): Promise<"reachable" | "unreachable"> => {
  const base = process.env.OLLAMA_BASE_URL ?? "http://ollama:11434";
  const response = await fetch(`${base}/api/tags`, { signal });
  return response.ok ? "reachable" : "unreachable";
};

export const getEmbeddingProviderStatus = async (): Promise<
  "reachable" | "unreachable" | "unknown"
> => {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) return cachedStatus;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    cachedStatus =
      EMBEDDING_PROVIDER === "local"
        ? await probeOllama(controller.signal)
        : await probeOpenAI(controller.signal);
  } catch {
    cachedStatus = "unreachable";
  } finally {
    clearTimeout(timeout);
  }

  cachedAt = now;
  return cachedStatus;
};

// Keep legacy export for backward compatibility
export const getOpenAIStatus = getEmbeddingProviderStatus;

export const _resetEmbeddingProviderStatusCache = () => {
  cachedStatus = "unknown";
  cachedAt = 0;
};

// For testing: allow resetting cache state
export const _resetOpenAIStatusCache = _resetEmbeddingProviderStatusCache;
