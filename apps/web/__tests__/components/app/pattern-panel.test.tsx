import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PatternPanel } from "@/components/app/pattern-panel";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams("pattern=p1"),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ replace: mocks.replaceMock }),
  usePathname: () => "/patterns",
}));

const mockFetchPattern = vi.fn();
const mockDeletePattern = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchPattern: (...args: unknown[]) => mockFetchPattern(...args),
  deletePattern: (...args: unknown[]) => mockDeletePattern(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
  Toaster: () => null,
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const setup = () => {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <PatternPanel />
    </QueryClientProvider>
  );
  return { queryClient };
};

describe("PatternPanel", () => {
  beforeEach(() => {
    mockFetchPattern.mockReset();
    mockDeletePattern.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mocks.replaceMock.mockReset();
    mocks.searchParams = new URLSearchParams("pattern=p1");
  });

  it("opens confirmation dialog when delete is clicked", async () => {
    mockFetchPattern.mockResolvedValue({
      id: "p1",
      title: "Fastify pattern",
      description: "Use arrow functions.",
      stackTags: ["fastify"],
      usageCount: 3,
    });

    setup();

    await waitFor(() => {
      expect(screen.getByText("Fastify pattern")).toBeInTheDocument();
    });

    const deleteButton = screen.getByLabelText("Delete pattern Fastify pattern");
    fireEvent.click(deleteButton);

    const dialog = await screen.findByRole("dialog", { name: "Delete pattern" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    expect(within(dialog).getByText("Fastify pattern")).toBeInTheDocument();
  });

  it("fires delete mutation and removes pattern on confirm", async () => {
    mockFetchPattern.mockResolvedValue({
      id: "p1",
      title: "Fastify pattern",
      description: "Use arrow functions.",
      stackTags: ["fastify"],
      usageCount: 3,
    });
    mockDeletePattern.mockResolvedValue({ deleted_id: "p1" });

    const { queryClient } = setup();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() => {
      expect(screen.getByText("Fastify pattern")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete pattern Fastify pattern"));

    const dialog = await screen.findByRole("dialog", { name: "Delete pattern" });
    const confirmButton = within(dialog).getByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockDeletePattern).toHaveBeenCalledTimes(1);
    });
    expect(mockDeletePattern.mock.calls[0][0]).toBe("p1");

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Pattern deleted");
    });

    expect(mocks.replaceMock).toHaveBeenCalledWith("/patterns", { scroll: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["patterns"] });
  });

  it("shows error toast when delete fails", async () => {
    mockFetchPattern.mockResolvedValue({
      id: "p1",
      title: "Fastify pattern",
      description: "Use arrow functions.",
      stackTags: ["fastify"],
      usageCount: 3,
    });
    mockDeletePattern.mockRejectedValue(new Error("Network error"));

    setup();

    await waitFor(() => {
      expect(screen.getByText("Fastify pattern")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete pattern Fastify pattern"));

    const dialog = await screen.findByRole("dialog", { name: "Delete pattern" });
    const confirmButton = within(dialog).getByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to delete pattern");
    });
  });
});
