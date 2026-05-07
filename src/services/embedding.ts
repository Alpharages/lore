import OpenAI from "openai";
import { logger } from "../utils/logger.js";

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

export const generateEmbedding = async (text: string): Promise<number[] | null> => {
  try {
    const res = await getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    logger.error({
      tool: "generateEmbedding",
      success: false,
      error: String(err),
    });
    return null;
  }
};
