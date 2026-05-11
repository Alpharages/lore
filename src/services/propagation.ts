import {
  findQualifyingLessons,
  findCandidateProjects,
  insertPropagation,
} from "../repositories/propagation.repository.js";
import { db } from "../db/client.js";
import { logger } from "../utils/logger.js";

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
