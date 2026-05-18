import {
  getAggregateCounts,
  getWeeklyLessonCounts,
  getPropagationMetadata,
  getAdminPendingPropagations,
  type StatsTx,
  type AdminPendingPropagation,
} from "../repositories/stats.repository.js";

export interface StatsResponse {
  totalLessons: number;
  sessionsRun: number;
  propagationsSent: number;
  propagationsAccepted: number;
  weeklyLessonCounts: Array<{ week: string; count: number }>;
}

export const getStatsService = async (
  db: StatsTx,
  projectSlug?: string
): Promise<StatsResponse> => {
  const [counts, weekly] = await Promise.all([
    getAggregateCounts(db, projectSlug),
    getWeeklyLessonCounts(db, projectSlug),
  ]);
  return { ...counts, weeklyLessonCounts: weekly };
};

export const getPropagationMetadataService = async (
  db: StatsTx,
  projectSlug?: string
): Promise<{ lastRunAt: string | null }> => {
  return getPropagationMetadata(db, projectSlug);
};

export const getAdminPendingPropagationsService = async (
  db: StatsTx,
  projectSlug?: string
): Promise<AdminPendingPropagation[]> => {
  return getAdminPendingPropagations(db, projectSlug);
};
