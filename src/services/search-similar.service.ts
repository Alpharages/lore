import {
  searchSimilarLessons,
  type LessonsTx,
  type SimilarLessonResult,
} from "../repositories/lessons.repository.js";
import { generateEmbedding } from "./embedding.js";

export interface SearchSimilarInput {
  text: string;
  threshold: number;
  limit: number;
  projectId: string;
}

export interface SearchSimilarResult {
  id: string;
  similarity: number;
  title: string;
  problem: string;
  fix: string;
  prevention_rule: string;
  stack_tags: string[];
  category: string | null;
  severity: string | null;
  occurrence_count: number;
}

export interface SearchSimilarOutput {
  results: SearchSimilarResult[];
  count: number;
}

export const searchSimilar = async (
  db: LessonsTx,
  input: SearchSimilarInput
): Promise<SearchSimilarOutput> => {
  const embedding = await generateEmbedding(input.text);

  if (!embedding) {
    return { results: [], count: 0 };
  }

  const lessons = await searchSimilarLessons(
    db,
    embedding,
    input.threshold,
    input.limit,
    input.projectId
  );

  return {
    results: lessons.map((lesson: SimilarLessonResult) => ({
      id: lesson.id,
      similarity: Math.round(lesson.similarity * 1000) / 1000,
      title: lesson.title,
      problem: lesson.problem,
      fix: lesson.fix,
      prevention_rule: lesson.preventionRule,
      stack_tags: lesson.stackTags ?? [],
      category: lesson.category,
      severity: lesson.severity,
      occurrence_count: lesson.occurrenceCount ?? 0,
    })),
    count: lessons.length,
  };
};
