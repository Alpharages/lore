// Architectural note: Patterns intentionally do NOT perform semantic dedup.
// Lessons dedup (FR-26) because two captures of the same bug are noise;
// patterns are constructive — two different `code_example` snippets for the
// same problem are independently valuable. Skip `acquireSaveLessonLock`.

import {
  insertPattern,
  getPatternsFiltered,
  bumpPatternUsage,
  type PatternsTx,
} from "../repositories/patterns.repository.js";
import { generateEmbedding } from "./embedding.js";

export interface SavePatternInput {
  title: string;
  description: string;
  codeExample?: string | null;
  stackTags: string[];
  category?: string | null;
  projectId: string;
  externalTaskId?: string | null;
  externalTaskRef?: string | null;
  externalTrackerType?: "clickup" | "jira" | "asana" | null;
}

export interface SavePatternOutput {
  patternId: string;
  embeddingStatus: "complete" | "pending";
}

export interface GetPatternsInput {
  stackTags?: string[];
  category?: string | null;
  projectId: string;
  limit?: number;
}

export interface PatternOutput {
  id: string;
  title: string;
  description: string;
  code_example: string | null;
  stack_tags: string[];
  category: string | null;
  usage_count: number;
  last_used_at: string | null;
}

export interface GetPatternsOutput {
  patterns: PatternOutput[];
}

export const savePattern = async (
  db: PatternsTx,
  input: SavePatternInput
): Promise<SavePatternOutput> => {
  // Single trim boundary: callers (REST controller, JSON-RPC handler) pass raw
  // values; normalisation happens here so it is applied consistently and once.
  const title = input.title.trim();
  const description = input.description.trim();
  const codeExample = input.codeExample ? input.codeExample.trim() : null;

  const embedText = [title, description, codeExample ?? ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);

  const embedding = await generateEmbedding(embedText);

  const { id: patternId } = await insertPattern(db, {
    projectId: input.projectId,
    title,
    description,
    codeExample,
    stackTags: input.stackTags,
    category: input.category ?? null,
    embedding: embedding,
    externalTaskId: input.externalTaskId ?? null,
    externalTaskRef: input.externalTaskRef ?? null,
    externalTrackerType: input.externalTrackerType ?? null,
  });

  return {
    patternId,
    embeddingStatus: embedding ? "complete" : "pending",
  };
};

export const getPatterns = async (
  db: PatternsTx,
  input: GetPatternsInput
): Promise<GetPatternsOutput> => {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);

  const rows = await getPatternsFiltered(db, {
    stackTags: input.stackTags,
    category: input.category ?? null,
    projectId: input.projectId,
    limit,
  });

  const ids = rows.map((r) => r.id);
  const bumpedRows = await bumpPatternUsage(db, ids);

  const bumpedMap = new Map(bumpedRows.map((r) => [r.id, r]));

  const patterns: PatternOutput[] = rows.map((row) => {
    const bumped = bumpedMap.get(row.id);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      code_example: row.codeExample,
      stack_tags: row.stackTags ?? [],
      category: row.category,
      usage_count: bumped?.usageCount ?? row.usageCount ?? 1,
      last_used_at: bumped?.lastUsedAt?.toISOString() ?? row.lastUsedAt?.toISOString() ?? null,
    };
  });

  return { patterns };
};
