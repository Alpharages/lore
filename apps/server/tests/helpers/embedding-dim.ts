// Mirror src/db/schema.ts: vector dimension depends on the embedding provider
// (1536 for openai, 768 for local Ollama). Tests must seed vectors with the
// dimension the DB schema actually has, otherwise pgvector rejects the insert.
export const EMBEDDING_DIMENSIONS = process.env.EMBEDDING_PROVIDER === "local" ? 768 : 1536;
