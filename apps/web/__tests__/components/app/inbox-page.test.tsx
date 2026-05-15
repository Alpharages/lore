import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InboxPage, { formatLastRun } from "@/app/(dashboard)/inbox/page";

const mocks = vi.hoisted(() => ({
  projectSlug: "project-slug",
}));

vi.mock("@/hooks/use-project", () => ({
  useProject: () => ({ projectSlug: mocks.projectSlug }),
}));

vi.mock("@/lib/api", () => ({
  fetchPropagations: vi.fn().mockResolvedValue([]),
  fetchPropagationMetadata: vi.fn().mockResolvedValue({ lastRunAt: null }),
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
      <InboxPage />
    </QueryClientProvider>
  );
  return { queryClient };
};

describe("formatLastRun", () => {
  it('returns "recently" for null', () => {
    expect(formatLastRun(null)).toBe("recently");
  });

  it('returns "recently" for undefined', () => {
    expect(formatLastRun(undefined)).toBe("recently");
  });

  it('returns "just now" for timestamps less than 2 minutes ago', () => {
    const now = new Date();
    const oneMinAgo = new Date(now.getTime() - 60_000).toISOString();
    expect(formatLastRun(oneMinAgo)).toBe("just now");
  });

  it('returns "5 minutes ago" for 5 minutes ago', () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatLastRun(fiveMinsAgo)).toBe("5 minutes ago");
  });

  it('returns "1 hour ago" for 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    expect(formatLastRun(oneHourAgo)).toBe("1 hour ago");
  });

  it('returns "23 hours ago" for 23 hours ago', () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60_000).toISOString();
    expect(formatLastRun(twentyThreeHoursAgo)).toBe("23 hours ago");
  });

  it('returns "1 day ago" for 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    expect(formatLastRun(oneDayAgo)).toBe("1 day ago");
  });

  it('returns "3 days ago" for 3 days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    expect(formatLastRun(threeDaysAgo)).toBe("3 days ago");
  });

  it("guards against clock skew (future timestamps)", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatLastRun(future)).toBe("just now");
  });
});

describe("InboxPage empty state", () => {
  it("renders EmptyState when no propagations exist", async () => {
    setup();

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    expect(
      await screen.findByText(/No pending suggestions\. Propagation engine last ran/)
    ).toBeInTheDocument();
  });

  it("does not show badge when count is 0", async () => {
    setup();

    await screen.findByText("All caught up");
    expect(screen.queryByText(/^\d+ pending$/)).not.toBeInTheDocument();
  });

  it("does not show skeleton when data is empty", async () => {
    setup();

    await screen.findByText("All caught up");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
