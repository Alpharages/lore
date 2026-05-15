import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(dashboard)/dashboard/page";

const mocks = vi.hoisted(() => ({
  projectSlug: "my-project",
}));

vi.mock("@/hooks/use-project", () => ({
  useProject: () => ({ projectSlug: mocks.projectSlug }),
}));

const mockFetchStats = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchStats: (...args: unknown[]) => mockFetchStats(...args),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const setup = () => {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>
  );
  return { queryClient };
};

describe("DashboardPage", () => {
  beforeEach(() => {
    mockFetchStats.mockReset();
    mocks.projectSlug = "my-project";
  });

  it("renders four skeleton cards while loading", () => {
    mockFetchStats.mockImplementation(() => new Promise(() => {}));
    setup();

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons).toHaveLength(4);
  });

  it("renders four stat cards with data", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 247,
      sessionsRun: 84,
      propagationsSent: 12,
      propagationsAccepted: 5,
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("247")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Lessons")).toBeInTheDocument();
    expect(screen.getByText("Sessions Run")).toBeInTheDocument();
    expect(screen.getByText("Propagations Sent")).toBeInTheDocument();
    expect(screen.getByText("Propagations Accepted")).toBeInTheDocument();

    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("calls fetchStats with project slug when scoped", async () => {
    mocks.projectSlug = "my-project";
    mockFetchStats.mockResolvedValue({
      totalLessons: 10,
      sessionsRun: 2,
      propagationsSent: 0,
      propagationsAccepted: 0,
    });
    setup();

    await waitFor(() => {
      expect(mockFetchStats).toHaveBeenCalledWith("my-project");
    });
  });

  it("calls fetchStats with undefined when All Projects is selected", async () => {
    mocks.projectSlug = "all";
    mockFetchStats.mockResolvedValue({
      totalLessons: 500,
      sessionsRun: 100,
      propagationsSent: 20,
      propagationsAccepted: 10,
    });
    setup();

    await waitFor(() => {
      expect(mockFetchStats).toHaveBeenCalledWith(undefined);
    });
  });

  it("uses query key ['stats', projectSlug]", async () => {
    mocks.projectSlug = "alpha";
    mockFetchStats.mockResolvedValue({
      totalLessons: 1,
      sessionsRun: 1,
      propagationsSent: 0,
      propagationsAccepted: 0,
    });
    const { queryClient } = setup();

    await waitFor(() => {
      expect(mockFetchStats).toHaveBeenCalled();
    });

    const cached = queryClient.getQueryData(["stats", "alpha"]);
    expect(cached).toBeDefined();
  });

  it("shows delta secondary text when available", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 247,
      sessionsRun: 84,
      propagationsSent: 12,
      propagationsAccepted: 5,
      delta: { totalLessons: 18 },
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("+18 this month")).toBeInTheDocument();
    });
  });

  it("shows delta secondary text for sessionsRun when available", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 84,
      sessionsRun: 84,
      propagationsSent: 12,
      propagationsAccepted: 5,
      delta: { sessionsRun: 7 },
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("+7 this month")).toBeInTheDocument();
    });
  });

  it("shows delta secondary text for propagationsSent when available", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 10,
      sessionsRun: 5,
      propagationsSent: 12,
      propagationsAccepted: 5,
      delta: { propagationsSent: 3 },
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("+3 this month")).toBeInTheDocument();
    });
  });

  it("shows delta secondary text for propagationsAccepted when available", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 10,
      sessionsRun: 5,
      propagationsSent: 12,
      propagationsAccepted: 5,
      delta: { propagationsAccepted: 2 },
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("+2 this month")).toBeInTheDocument();
    });
  });

  it("does not show secondary text when delta is absent", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 247,
      sessionsRun: 84,
      propagationsSent: 12,
      propagationsAccepted: 5,
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("247")).toBeInTheDocument();
    });

    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
  });

  it("renders empty state when sessionsRun is 0", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 0,
      sessionsRun: 0,
      propagationsSent: 0,
      propagationsAccepted: 0,
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("Memory starts here")).toBeInTheDocument();
    });

    expect(screen.getByText(/lore install/)).toBeInTheDocument();
  });

  it("shows 0 in all cards when stats are zero", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 0,
      sessionsRun: 0,
      propagationsSent: 0,
      propagationsAccepted: 0,
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("Memory starts here")).toBeInTheDocument();
    });

    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(4);
  });

  it("does not show empty state when sessionsRun > 0", async () => {
    mockFetchStats.mockResolvedValue({
      totalLessons: 10,
      sessionsRun: 1,
      propagationsSent: 0,
      propagationsAccepted: 0,
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument();
    });

    expect(screen.queryByText("Memory starts here")).not.toBeInTheDocument();
  });

  it("does not crash on API error", async () => {
    mockFetchStats.mockRejectedValue(new Error("Network error"));
    setup();

    await waitFor(() => {
      expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
    });

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
