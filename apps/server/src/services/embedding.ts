import OpenAI from "openai";
import { logger } from "../utils/logger.js";

export const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER ?? "openai") as
  | "openai"
  | "local";
export const EMBEDDING_DIMENSIONS = EMBEDDING_PROVIDER === "local" ? 768 : 1536;

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://ollama:11434";

let openaiInstance: OpenAI | undefined;

const getOpenAI = (): OpenAI => {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiInstance;
};

export const generateEmbeddingText = (input: {
  title: string;
  problem: string;
  fix: string;
  preventionRule: string;
}): string => {
  return [input.title, input.problem, input.fix, input.preventionRule]
    .filter(Boolean)
    .join(" ")
    .slice(0, 8000);
};

const generateOpenAIEmbedding = async (text: string): Promise<number[]> => {
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  const embedding = res.data[0]?.embedding;
  if (!embedding) throw new Error("OpenAI returned no embedding");
  return embedding;
};

const generateOllamaEmbedding = async (text: string): Promise<number[]> => {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const json = (await res.json()) as { embedding: number[] };
  if (!json.embedding) throw new Error("Ollama returned no embedding");
  return json.embedding;
};

export const generateEmbedding = async (text: string): Promise<number[] | null> => {
  try {
    return EMBEDDING_PROVIDER === "local"
      ? await generateOllamaEmbedding(text)
      : await generateOpenAIEmbedding(text);
  } catch (err) {
    logger.error({
      tool: "generateEmbedding",
      provider: EMBEDDING_PROVIDER,
      success: false,
      error: String(err),
    });
    return null;
  }
};
