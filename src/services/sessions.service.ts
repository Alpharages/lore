import {
  insertSession,
  updateSessionEnd,
  findSessionById,
  countLessonsByIds,
  type SessionsTx,
} from "../repositories/sessions.repository.js";
import { findRepositoryBySlug } from "../repositories/projects.repository.js";
import { repositoryNotFound, validationError } from "../utils/errors.js";

const durationMinutesBetween = (start: Date | null, end: Date | null): number => {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
};

export interface StartSessionInput {
  projectId: string;
  repoSlug: string;
  branch: string;
  taskSummary?: string | null;
  userHandle?: string | null;
}

export interface StartSessionOutput {
  sessionId: string;
  startedAt: string;
}

export const startSession = async (
  db: SessionsTx,
  input: StartSessionInput
): Promise<StartSessionOutput> => {
  const repo = await findRepositoryBySlug(db, input.repoSlug);
  if (!repo) {
    throw repositoryNotFound(input.repoSlug);
  }

  const inserted = await insertSession(db, {
    projectId: input.projectId,
    repoId: repo.id,
    branch: input.branch,
    taskSummary: input.taskSummary ?? null,
    userHandle: input.userHandle ?? null,
  });

  return {
    sessionId: inserted.id,
    startedAt: (inserted.startedAt ?? new Date()).toISOString(),
  };
};

export interface EndSessionInput {
  projectId: string;
  sessionId: string;
  decisions?: Array<{ what: string; why: string }>;
  lessonsApplied?: string[];
  filesTouched?: string[];
}

export interface EndSessionOutput {
  sessionId: string;
  ended: boolean;
  durationMinutes: number;
}

export const endSession = async (
  db: SessionsTx,
  input: EndSessionInput
): Promise<EndSessionOutput> => {
  const session = await findSessionById(db, input.sessionId, input.projectId);

  if (!session) {
    throw validationError(`Session "${input.sessionId}" not found or not owned by this project`);
  }

  if (session.endedAt) {
    return {
      sessionId: input.sessionId,
      ended: true,
      durationMinutes: durationMinutesBetween(session.startedAt, session.endedAt),
    };
  }

  const lessonIdsRaw = input.lessonsApplied ?? [];
  const uniqueLessonIds = [...new Set(lessonIdsRaw)];

  if (uniqueLessonIds.length > 0) {
    const foundCount = await countLessonsByIds(db, uniqueLessonIds);
    if (foundCount !== uniqueLessonIds.length) {
      throw validationError(
        `One or more lesson UUIDs in lessons_applied do not exist in this project`
      );
    }
  }

  const endedAt = new Date();
  const durationSuccess = durationMinutesBetween(session.startedAt, endedAt);

  const updated = await updateSessionEnd(db, input.sessionId, input.projectId, {
    decisions: input.decisions ?? [],
    lessonsApplied: uniqueLessonIds,
    filesTouched: input.filesTouched ?? [],
    endedAt,
  });

  if (!updated) {
    const closed = await findSessionById(db, input.sessionId, input.projectId);
    if (closed?.endedAt) {
      return {
        sessionId: input.sessionId,
        ended: true,
        durationMinutes: durationMinutesBetween(closed.startedAt, closed.endedAt),
      };
    }
    return {
      sessionId: input.sessionId,
      ended: true,
      durationMinutes: 0,
    };
  }

  return {
    sessionId: input.sessionId,
    ended: true,
    durationMinutes: durationSuccess,
  };
};
