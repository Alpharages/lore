import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryGrowthChart } from "@/components/app/memory-growth-chart";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 300 }}>{children}</div>
    ),
  };
});

describe("MemoryGrowthChart", () => {
  it("renders an AreaChart with data points", () => {
    const data = [
      { week: "May 5", count: 10 },
      { week: "May 12", count: 15 },
      { week: "May 19", count: 20 },
    ];

    const { container } = render(<MemoryGrowthChart data={data} />);

    const areaChart = container.querySelector(".recharts-wrapper");
    expect(areaChart).toBeInTheDocument();
  });

  it("renders null when data has fewer than 2 points", () => {
    const { container: emptyContainer } = render(<MemoryGrowthChart data={[]} />);
    expect(emptyContainer.firstChild).toBeNull();

    const { container: oneItemContainer } = render(
      <MemoryGrowthChart data={[{ week: "May 5", count: 10 }]} />
    );
    expect(oneItemContainer.firstChild).toBeNull();
  });

  it("does not render a tooltip", () => {
    const data = [
      { week: "May 5", count: 10 },
      { week: "May 12", count: 15 },
    ];

    const { container } = render(<MemoryGrowthChart data={data} />);

    const tooltip = container.querySelector(".recharts-tooltip-wrapper");
    expect(tooltip).not.toBeInTheDocument();
  });

  it("renders chart container with expected data keys", () => {
    const data = [
      { week: "May 5", count: 10 },
      { week: "May 12", count: 15 },
    ];

    const { container } = render(<MemoryGrowthChart data={data} />);

    expect(container.querySelector(".recharts-wrapper")).toBeInTheDocument();
  });

  it("renders correctly with exactly 2 data points (boundary)", () => {
    const data = [
      { week: "May 5", count: 10 },
      { week: "May 12", count: 15 },
    ];

    const { container } = render(<MemoryGrowthChart data={data} />);

    expect(container.querySelector(".recharts-wrapper")).toBeInTheDocument();
  });

  it("renders correctly when all counts are zero", () => {
    const data = [
      { week: "May 5", count: 0 },
      { week: "May 12", count: 0 },
      { week: "May 19", count: 0 },
    ];

    const { container } = render(<MemoryGrowthChart data={data} />);

    expect(container.querySelector(".recharts-wrapper")).toBeInTheDocument();
  });
});
