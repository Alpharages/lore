import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EvolutionItemPanel } from "@/components/app/evolution-item-panel";
import type { EvolutionItemDetail } from "@/lib/api-types";

const mocks = vi.hoisted(() => ({
  projectSlug: "my-project",
  searchParams: new URLSearchParams("item=item-1"),
  replace: vi.fn(),
}));

vi.mock("@/hooks/use-project", () => ({
  useProject: () => ({ projectSlug: mocks.projectSlug }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/evolution",
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockFetchItem = vi.fn();
const mockReviewItem = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchEvolutionItem: (...args: unknown[]) => mockFetchItem(...args),
  reviewEvolutionItem: (...args: unknown[]) => mockReviewItem(...args),
}));

const detail = (overrides: Partial<EvolutionItemDetail> = {}): EvolutionItemDetail => ({
  item: {
    id: "item-1",
    type: "requirement",
    revision: 1,
    title: "Exports must be paginated",
    statement: "The export API must return at most 500 records per page.",
    rationale: "Full exports timed out for the largest tenant.",
    status: "proposed",
    capture_mode: "manual",
    proposed_by: "dana",
    approved_by: null,
    superseded_by_item_id: null,
    proposed_supersedes_item_id: null,
    ai_confidence: null,
    ai_model: null,
    embedding_status: "complete",
    occurred_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    reviewed_at: null,
    evidence_count: 1,
    redacted_evidence_count: 0,
  },
  versions: [
    {
      revision: 1,
      title: "Exports must be paginated",
      statement: "The export API must return at most 500 records per page.",
      rationale: null,
      authored_by: "dana",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  evidence: [
    {
      id: "ev-1",
      source_kind: "meeting",
      source_reference: "https://meet.example/kickoff",
      external_source_id: null,
      source_author: "priya",
      excerpt_provided_by: "human",
      captured_by: "dana",
      occurred_at: null,
      created_at: "2026-08-01T00:00:00.000Z",
      has_excerpt: true,
      redacted: false,
      redaction_reason: null,
      superseded_by_evidence_id: null,
      excerpt: "We agreed exports need paging before the enterprise launch.",
    },
  ],
  events: [
    {
      id: "e1",
      item_id: "item-1",
      event_type: "proposed",
      revision: 1,
      actor: "dana",
      note: null,
      payload: {},
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  relations: [],
  links: [],
  ...overrides,
});

const setup = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EvolutionItemPanel />
    </QueryClientProvider>
  );
};

describe("EvolutionItemPanel", () => {
  beforeEach(() => {
    mockFetchItem.mockReset();
    mockReviewItem.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mocks.searchParams = new URLSearchParams("item=item-1");
    mocks.projectSlug = "my-project";
  });

  it("shows the full evidence excerpt so a reviewer can inspect it (FR-PE-61)", async () => {
    mockFetchItem.mockResolvedValue(detail());
    setup();

    expect(
      await screen.findByText("We agreed exports need paging before the enterprise launch.")
    ).toBeInTheDocument();
    expect(screen.getByText("meeting")).toBeInTheDocument();
    expect(screen.getByText("by priya")).toBeInTheDocument();
  });

  it("shows status, rationale and review history (FR-PE-64)", async () => {
    mockFetchItem.mockResolvedValue(detail());
    setup();

    expect(
      await screen.findByText("Full exports timed out for the largest tenant.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Status: Proposed")).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
  });

  it("marks redacted evidence as a tombstone rather than hiding it (FR-PE-27)", async () => {
    mockFetchItem.mockResolvedValue(
      detail({
        evidence: [
          {
            ...detail().evidence[0],
            excerpt: null,
            has_excerpt: false,
            redacted: true,
            redaction_reason: "Contained personal data",
          },
        ],
      })
    );
    setup();

    expect(await screen.findByText(/Excerpt redacted/)).toBeInTheDocument();
    expect(screen.getByText(/Contained personal data/)).toBeInTheDocument();
    // The source reference survives the erasure.
    expect(screen.getByText("https://meet.example/kickoff")).toBeInTheDocument();
  });

  it("accepts a proposal and reports success", async () => {
    mockFetchItem.mockResolvedValue(detail());
    mockReviewItem.mockResolvedValue({ item_id: "item-1", status: "accepted", revision: 1 });
    setup();

    const accept = await screen.findByRole("button", { name: /Accept/ });
    fireEvent.click(accept);

    await waitFor(() =>
      expect(mockReviewItem).toHaveBeenCalledWith({
        project: "my-project",
        id: "item-1",
        action: "accept",
      })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Item accepted");
  });

  it("rejects a proposal", async () => {
    mockFetchItem.mockResolvedValue(detail());
    mockReviewItem.mockResolvedValue({ item_id: "item-1", status: "rejected", revision: 1 });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: /Reject/ }));

    await waitFor(() =>
      expect(mockReviewItem).toHaveBeenCalledWith(expect.objectContaining({ action: "reject" }))
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Item rejected");
  });

  it("surfaces the server's reason when acceptance is refused (FR-PE-18)", async () => {
    mockFetchItem.mockResolvedValue(detail({ ...detail(), evidence: [] }));
    mockReviewItem.mockRejectedValue({
      response: {
        data: { message: "An accepted item must have at least one evidence record (FR-PE-18)." },
      },
    });
    setup();

    fireEvent.click(await screen.findByRole("button", { name: /Accept/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "An accepted item must have at least one evidence record (FR-PE-18)."
      )
    );
  });

  it("offers no review actions for an already-accepted item", async () => {
    const accepted = detail();
    accepted.item.status = "accepted";
    mockFetchItem.mockResolvedValue(accepted);
    setup();

    await screen.findByLabelText("Status: Accepted");
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reject/ })).not.toBeInTheDocument();
  });

  it("warns when a proposal carries no evidence", async () => {
    mockFetchItem.mockResolvedValue(detail({ evidence: [] }));
    setup();

    expect(
      await screen.findByText(/An item cannot be accepted without at least one evidence record/)
    ).toBeInTheDocument();
  });

  it("lists every revision once a proposal has been corrected (FR-PE-12)", async () => {
    const revised = detail();
    revised.item.revision = 2;
    revised.versions = [
      ...revised.versions,
      {
        revision: 2,
        title: "Exports must be paginated",
        statement: "The export API must return at most 250 records per page.",
        rationale: null,
        authored_by: "priya",
        created_at: "2026-08-02T00:00:00.000Z",
      },
    ];
    mockFetchItem.mockResolvedValue(revised);
    setup();

    expect(await screen.findByText(/Revisions \(2\)/)).toBeInTheDocument();
    expect(
      screen.getByText("The export API must return at most 250 records per page.")
    ).toBeInTheDocument();
  });

  it("does not fetch when no item is selected", async () => {
    mocks.searchParams = new URLSearchParams();
    setup();
    await waitFor(() => expect(mockFetchItem).not.toHaveBeenCalled());
  });
});
