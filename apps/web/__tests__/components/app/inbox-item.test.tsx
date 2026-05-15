import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptPropagation, rejectPropagation } from "@/lib/api";
import { InboxItem } from "@/components/app/inbox-item";
import type { Propagation } from "@/lib/api-types";

const mocks = vi.hoisted(() => ({
  projectSlug: "project-slug",
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-project", () => ({
  useProject: () => ({ projectSlug: mocks.projectSlug }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/api", () => ({
  acceptPropagation: vi.fn(),
  rejectPropagation: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const queryKey = ["propagations", "project-slug"] as const;

const mockPropagation: Propagation = {
  id: "prop-001",
  lessonId: "lesson-abc-123",
  lessonTitle: "React useEffect cleanup missing on async operations",
  severity: "critical",
  problem: "Async operations inside useEffect without cleanup cause memory leaks.",
  stackTags: ["typescript", "react"],
  occurrenceCount: 5,
  sharedStackTags: ["typescript", "react"],
  sourceProject: "alpharages/staffedup",
  trustTier: "high",
  createdAt: "2026-05-16T00:00:00Z",
};

const secondPropagation: Propagation = {
  ...mockPropagation,
  id: "prop-002",
  lessonId: "lesson-def-456",
  lessonTitle: "Validate route params before repository calls",
  severity: "high",
};

const acceptPropagationMock = vi.mocked(acceptPropagation);
const rejectPropagationMock = vi.mocked(rejectPropagation);

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const setup = (overrides?: Partial<Propagation>, props?: { showProject?: boolean }) => {
  const queryClient = createQueryClient();
  const propagation = { ...mockPropagation, ...overrides };

  queryClient.setQueryData<Propagation[]>(queryKey, [secondPropagation, propagation]);

  render(
    <QueryClientProvider client={queryClient}>
      <InboxItem propagation={propagation} {...props} />
    </QueryClientProvider>
  );

  return { propagation, queryClient };
};

const flushDismissAnimation = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 170);
  });
};

describe("InboxItem", () => {
  beforeEach(() => {
    acceptPropagationMock.mockResolvedValue();
    rejectPropagationMock.mockResolvedValue();
    mocks.toast.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the propagation content and actions", () => {
    setup();

    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /Open lesson: React useEffect cleanup missing on async operations/,
      })
    ).toHaveAttribute("href", "/lessons?lesson=lesson-abc-123");
    expect(
      screen.getByText(/Async operations inside useEffect without cleanup/)
    ).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText(/5 occurrences/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accept:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject:/ })).toBeInTheDocument();
  });

  it("optimistically fades and removes an accepted propagation, then shows undo toast", async () => {
    const { queryClient } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Accept:/ }));

    await waitFor(() => {
      expect(screen.getByTestId("inbox-item")).toHaveClass("opacity-0", "max-h-0");
    });
    expect(queryClient.getQueryData<Propagation[]>(queryKey)).toHaveLength(2);

    await flushDismissAnimation();

    await waitFor(() => {
      expect(acceptPropagationMock).toHaveBeenCalledWith("prop-001");
    });
    expect(queryClient.getQueryData<Propagation[]>(queryKey)).toEqual([secondPropagation]);
    expect(mocks.toast).toHaveBeenCalledWith(
      "Added to your project's memory.",
      expect.objectContaining({
        duration: 5000,
        action: expect.objectContaining({ label: "Undo" }),
      })
    );
  });

  it("shows the reject toast after rejecting a propagation", async () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: /Reject:/ }));
    await flushDismissAnimation();

    await waitFor(() => {
      expect(rejectPropagationMock).toHaveBeenCalledWith("prop-001");
    });
    expect(mocks.toast).toHaveBeenCalledWith(
      "Dismissed.",
      expect.objectContaining({
        duration: 5000,
        action: expect.objectContaining({ label: "Undo" }),
      })
    );
  });

  it("undo restores the propagation at its original index and calls the reverse API once", async () => {
    const { queryClient } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Accept:/ }));
    await flushDismissAnimation();

    await waitFor(() => {
      expect(acceptPropagationMock).toHaveBeenCalledWith("prop-001");
    });

    const toastOptions = mocks.toast.mock.calls.at(-1)?.[1];
    toastOptions.action.onClick();

    expect(queryClient.getQueryData<Propagation[]>(queryKey)?.map((item) => item.id)).toEqual([
      "prop-002",
      "prop-001",
    ]);
    await waitFor(() => {
      expect(rejectPropagationMock).toHaveBeenCalledWith("prop-001");
    });
    expect(screen.getByTestId("inbox-item")).toHaveClass("opacity-100");
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("rolls back the cache and shows a failure toast when the accept mutation fails", async () => {
    acceptPropagationMock.mockRejectedValueOnce(new Error("network"));
    const { queryClient } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Accept:/ }));
    await flushDismissAnimation();

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith("Action failed.", { duration: 8000 });
    });
    expect(queryClient.getQueryData<Propagation[]>(queryKey)?.map((item) => item.id)).toEqual([
      "prop-002",
      "prop-001",
    ]);
    expect(screen.getByTestId("inbox-item")).toHaveClass("opacity-100");
  });

  it("renders singular occurrence and target project when requested", () => {
    setup(
      {
        occurrenceCount: 1,
        targetProject: "alpharages/other-project",
      },
      { showProject: true }
    );

    expect(screen.getByText(/1 occurrence/)).toBeInTheDocument();
    expect(screen.queryByText(/1 occurrences/)).not.toBeInTheDocument();
    expect(screen.getByText("alpharages/other-project")).toBeInTheDocument();
  });
});
