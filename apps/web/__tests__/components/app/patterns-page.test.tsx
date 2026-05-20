import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PatternsPage from "@/app/(dashboard)/patterns/page";

const mocks = vi.hoisted(() => ({
  projectSlug: "my-project",
  searchParams: new URLSearchParams(),
}));

vi.mock("@/hooks/use-project", () => ({
  useProject: () => ({ projectSlug: mocks.projectSlug }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/patterns",
}));

const mockFetchPatterns = vi.fn();
const mockDeletePattern = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchPatterns: (...args: unknown[]) => mockFetchPatterns(...args),
  deletePattern: (...args: unknown[]) => mockDeletePattern(...args),
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
      <PatternsPage />
    </QueryClientProvider>
  );
  return { queryClient };
};

describe("PatternsPage", () => {
  beforeEach(() => {
    mockFetchPatterns.mockReset();
    mocks.projectSlug = "my-project";
  });

  it("renders loading state then patterns", async () => {
    mockFetchPatterns.mockResolvedValue({
      patterns: [
        {
          id: "p1",
          title: "Fastify handler pattern",
          description: "Use arrow functions for handlers.",
          stackTags: ["fastify"],
          category: "architecture",
          usageCount: 3,
        },
      ],
      total: 1,
    });
    setup();

    expect(screen.getByText("Patterns")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Fastify handler pattern")).toBeInTheDocument();
    });

    expect(screen.getByText("Use arrow functions for handlers.")).toBeInTheDocument();
  });

  it("calls fetchPatterns with project slug when scoped", async () => {
    mocks.projectSlug = "my-project";
    mockFetchPatterns.mockResolvedValue({ patterns: [], total: 0 });
    setup();

    await waitFor(() => {
      expect(mockFetchPatterns).toHaveBeenCalledWith(
        expect.objectContaining({ project: "my-project" })
      );
    });
  });

  it("calls fetchPatterns with undefined when All Projects is selected", async () => {
    mocks.projectSlug = "all";
    mockFetchPatterns.mockResolvedValue({ patterns: [], total: 0 });
    setup();

    await waitFor(() => {
      expect(mockFetchPatterns).toHaveBeenCalledWith(
        expect.objectContaining({ project: undefined })
      );
    });
  });

  it("uses query key ['patterns', activeFilters, projectSlug]", async () => {
    mocks.projectSlug = "alpha";
    mockFetchPatterns.mockResolvedValue({ patterns: [], total: 0 });
    const { queryClient } = setup();

    await waitFor(() => {
      expect(mockFetchPatterns).toHaveBeenCalled();
    });

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    const match = keys.find((k) => Array.isArray(k) && k[0] === "patterns" && k[2] === "alpha");
    expect(match).toBeDefined();
  });

  it("renders empty state when no patterns exist", async () => {
    mockFetchPatterns.mockResolvedValue({ patterns: [], total: 0 });
    setup();

    await waitFor(() => {
      expect(
        screen.getByText(/No patterns yet\. Patterns are captured automatically/)
      ).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    mockFetchPatterns.mockRejectedValue(new Error("Network error"));
    setup();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load patterns/)).toBeInTheDocument();
    });
  });

  it("renders pattern count footer", async () => {
    mockFetchPatterns.mockResolvedValue({
      patterns: [
        { id: "p1", title: "A", description: "desc", stackTags: [], usageCount: 1 },
        { id: "p2", title: "B", description: "desc", stackTags: [], usageCount: 2 },
      ],
      total: 2,
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText("2 patterns")).toBeInTheDocument();
    });
  });
});
