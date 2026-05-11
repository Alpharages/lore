import {
  findQualifyingLessons,
  findCandidateProjects,
  insertPropagation,
  getPendingPropagations,
  getPropagationById,
  updatePropagationStatus,
  PendingPropagation,
  PropagationTx,
} from "../repositories/propagation.repository.js";
import { db } from "../db/client.js";
import { logger } from "../utils/logger.js";
import {
  findFullLessonById,
  insertLesson,
  updateLessonEmbedding,
  markLessonEmbeddingFailed,
} from "../repositories/lessons.repository.js";
import { generateEmbeddingText, generateEmbedding } from "./embedding.js";
import { validationError, unauthorized, notFoundError } from "../utils/errors.js";

export const startPropagationEngine = (): void => {
  const enabled = process.env.PROPAGATION_ENABLED === "true";
  if (!enabled) {
    logger.info({
      tool: "propagation_engine",
      message: "Propagation engine disabled via PROPAGATION_ENABLED",
    });
    return;
  }

  const parsed = parseInt(process.env.PROPAGATION_INTERVAL_MS || "3600000", 10);
  const intervalMs = isNaN(parsed) ? 3600000 : parsed;

  logger.info({
    tool: "propagation_engine",
    message: `Starting propagation engine with interval ${intervalMs}ms`,
  });

  setInterval(async () => {
    try {
      logger.info({
        tool: "propagation_engine",
        message: "Running propagation evaluation",
      });

      // Background jobs use the raw db client which connects as the table
      // owner. PostgreSQL table owners bypass RLS by default, granting full
      // read/write access across all projects — required since this engine
      // has no authenticated project context.
      const qualifyingLessons = await findQualifyingLessons(db);

      let evaluatedCount = 0;
      let suggestionsCreated = 0;

      for (const lesson of qualifyingLessons) {
        if (!lesson.projectId || !lesson.stackTags || lesson.stackTags.length === 0) continue;
        evaluatedCount++;

        const candidateProjects = await findCandidateProjects(
          db,
          lesson.projectId,
          lesson.stackTags
        );

        for (const project of candidateProjects) {
          const inserted = await insertPropagation(db, lesson.id, project.id);
          suggestionsCreated += inserted.length;
        }
      }

      logger.info({
        tool: "propagation_engine",
        message: "Propagation evaluation completed",
        lessons_evaluated: evaluatedCount,
        suggestions_created: suggestionsCreated,
      });
    } catch (error) {
      logger.error({
        tool: "propagation_engine",
        message: "Error during propagation evaluation",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, intervalMs);
};

export const getPendingPropagationsService = async (
  dbClient: PropagationTx,
  projectId: string
): Promise<PendingPropagation[]> => {
  return getPendingPropagations(dbClient, projectId);
};

export const acceptPropagation = async (
  dbClient: PropagationTx,
  propagationId: string,
  projectId: string
): Promise<{ newLessonId: string }> => {
  const propagation = await getPropagationById(dbClient, propagationId);
  if (!propagation) {
    throw notFoundError(`Propagation ${propagationId} not found`);
  }

  if (propagation.targetProjectId !== projectId) {
    throw unauthorized();
  }

  if (propagation.status !== "suggested") {
    throw validationError(`Propagation is already ${propagation.status}`);
  }

  const sourceLesson = await findFullLessonById(dbClient, propagation.sourceLessonId);
  if (!sourceLesson) {
    throw notFoundError(`Source lesson ${propagation.sourceLessonId} not found`);
  }

  const { id: newLessonId } = await insertLesson(dbClient, {
    projectId,
    title: sourceLesson.title,
    problem: sourceLesson.problem,
    rootCause: sourceLesson.rootCause,
    fix: sourceLesson.fix,
    preventionRule: sourceLesson.preventionRule,
    stackTags: sourceLesson.stackTags ?? [],
    category: sourceLesson.category,
    severity: (sourceLesson.severity as any) ?? "medium",
    provenance: {
      source: "propagation",
      propagated_from: sourceLesson.id,
      original_provenance: sourceLesson.provenance,
    },
    propagatedFrom: sourceLesson.id,
    occurrenceCount: 1,
    embeddingStatus: "pending",
  });

  // Async embedding trigger
  const embedText = generateEmbeddingText({
    title: sourceLesson.title,
    problem: sourceLesson.problem,
    fix: sourceLesson.fix,
    preventionRule: sourceLesson.preventionRule,
  });

  // Fire and forget — uses global db pool, not the request transaction
  generateEmbedding(embedText)
    .then(async (embedding) => {
      if (embedding) {
        await updateLessonEmbedding(db, newLessonId, projectId, embedding);
      }
    })
    .catch(async (err) => {
      logger.error({
        tool: "acceptPropagation:asyncEmbedding",
        lesson_id: newLessonId,
        error: String(err),
      });
      await markLessonEmbeddingFailed(db, newLessonId, projectId).catch(() => undefined);
    });

  await updatePropagationStatus(dbClient, propagationId, "accepted", new Date());

  return { newLessonId };
};

export const rejectPropagation = async (
  dbClient: PropagationTx,
  propagationId: string,
  projectId: string
): Promise<{ action: "rejected" }> => {
  const propagation = await getPropagationById(dbClient, propagationId);
  if (!propagation) {
    throw notFoundError(`Propagation ${propagationId} not found`);
  }

  if (propagation.targetProjectId !== projectId) {
    throw unauthorized();
  }

  if (propagation.status !== "suggested") {
    throw validationError(`Propagation is already ${propagation.status}`);
  }

  await updatePropagationStatus(dbClient, propagationId, "rejected", new Date());

  return { action: "rejected" };
};
