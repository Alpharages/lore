// Architectural note: Patterns intentionally do NOT perform semantic dedup.
// Lessons dedup (FR-26) because two captures of the same bug are noise;
// patterns are constructive — two different `code_example` snippets for the
// same problem are independently valuable. Skip `acquireSaveLessonLock`.

import {
  insertPattern,
  getPatternsFiltered,
  bumpPatternUsage,
  findPatternsForUi,
  countPatternsForUi,
  findPatternById,
  deletePattern,
  type PatternsTx,
} from "../repositories/patterns.repository.js";
import { generateEmbedding } from "./embedding.js";
import { findProjectBySlug } from "./projects.service.js";

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

export interface SearchPatternsForUiInput {
  projectSlug?: string;
  tags?: string[];
  category?: string | null;
  limit?: number;
}

export interface SearchPatternsForUiResult {
  id: string;
  title: string;
  description: string;
  codeExample: string | null;
  codeLanguage: string | null;
  stackTags: string[];
  category: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  externalTaskRef: string | null;
  externalTrackerType: string | null;
}

export const searchPatternsForUi = async (
  db: PatternsTx,
  input: SearchPatternsForUiInput
): Promise<{ patterns: SearchPatternsForUiResult[]; total: number }> => {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  let projectId: string | undefined;
  if (input.projectSlug && input.projectSlug !== "all") {
    const project = await findProjectBySlug(db, input.projectSlug);
    if (!project) {
      return { patterns: [], total: 0 };
    }
    projectId = project.id;
  }

  const filterParams = {
    stackTags: input.tags,
    category: input.category ?? null,
    projectId: projectId ?? null,
  };

  const [rows, total] = await Promise.all([
    findPatternsForUi(db, { ...filterParams, limit }),
    countPatternsForUi(db, filterParams),
  ]);

  const patterns: SearchPatternsForUiResult[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    codeExample: row.codeExample,
    codeLanguage: null,
    stackTags: row.stackTags ?? [],
    category: row.category,
    usageCount: row.usageCount ?? 1,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    externalTaskRef: row.externalTaskRef,
    externalTrackerType: row.externalTrackerType,
  }));

  return { patterns, total };
};

export const findPatternByIdForUi = async (
  db: PatternsTx,
  id: string
): Promise<SearchPatternsForUiResult | undefined> => {
  const row = await findPatternById(db, id);
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    codeExample: row.codeExample,
    codeLanguage: null,
    stackTags: row.stackTags ?? [],
    category: row.category,
    usageCount: row.usageCount ?? 1,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    externalTaskRef: row.externalTaskRef,
    externalTrackerType: row.externalTrackerType,
  };
};

export const deletePatternForUi = async (db: PatternsTx, id: string): Promise<string | null> => {
  const result = await deletePattern(db, id);
  return result?.id ?? null;
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
