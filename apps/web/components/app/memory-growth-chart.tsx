"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { LessonTrendPoint } from "@/lib/api-types";

interface MemoryGrowthChartProps {
  data: LessonTrendPoint[];
}

const chartConfig = {
  count: {
    label: "Lessons",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export const MemoryGrowthChart = ({ data }: MemoryGrowthChartProps) => {
  if (data.length < 2) {
    return null;
  }

  return (
    <div className="mt-8">
      <ChartContainer config={chartConfig} className="aspect-[3/1] min-h-[240px]">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            allowDecimals={false}
          />
          <Area
            dataKey="count"
            type="monotone"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.1}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};
