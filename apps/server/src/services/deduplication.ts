import { findSimilarLesson, type LessonsTx } from "../repositories/lessons.repository.js";
import { logger } from "../utils/logger.js";

const DEFAULT_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD ?? "0.85");

export const findDuplicate = async (
  db: LessonsTx,
  embedding: number[],
  projectId: string,
  threshold: number = DEFAULT_THRESHOLD
): Promise<{ lessonId: string; similarity: number } | null> => {
  const match = await findSimilarLesson(db, embedding, threshold, projectId);

  if (match) {
    logger.info({
      tool: "deduplication",
      action: "duplicate_found",
      lesson_id: match.id,
      similarity: match.similarity,
    });
    return { lessonId: match.id, similarity: match.similarity };
  }

  return null;
};
