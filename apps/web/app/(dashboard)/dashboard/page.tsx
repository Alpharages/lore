"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/lib/api";
import { useProject } from "@/hooks/use-project";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { MemoryGrowthChart } from "@/components/app/memory-growth-chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { Stats } from "@/lib/api-types";

const STAT_CARD_HEIGHT_CLASS = "h-[112px]";

const buildSecondary = (
  key: keyof NonNullable<Stats["delta"]>,
  stats: Stats | undefined
): string | undefined => {
  const val = stats?.delta?.[key];
  return val ? `+${val} this month` : undefined;
};

const DashboardSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <Skeleton key={i} className={STAT_CARD_HEIGHT_CLASS} />
    ))}
  </div>
);

const DashboardPage = () => {
  const { projectSlug } = useProject();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats", projectSlug],
    queryFn: () => fetchStats(projectSlug === "all" ? undefined : projectSlug),
  });

  const trendData = stats?.weeklyLessonCounts;
  const hasTrendData = trendData !== undefined && trendData.length >= 2;

  return (
    <section>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Lessons"
              value={stats?.totalLessons ?? 0}
              secondary={buildSecondary("totalLessons", stats)}
            />
            <StatCard
              label="Sessions Run"
              value={stats?.sessionsRun ?? 0}
              secondary={buildSecondary("sessionsRun", stats)}
            />
            <StatCard
              label="Propagations Sent"
              value={stats?.propagationsSent ?? 0}
              secondary={buildSecondary("propagationsSent", stats)}
            />
            <StatCard
              label="Propagations Accepted"
              value={stats?.propagationsAccepted ?? 0}
              secondary={buildSecondary("propagationsAccepted", stats)}
            />
          </div>

          {hasTrendData ? (
            <MemoryGrowthChart data={trendData} />
          ) : (
            <div className="mt-8">
              <EmptyState
                title="Memory starts here"
                description="Sessions will appear once developers run `lore install`."
              />
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default DashboardPage;
