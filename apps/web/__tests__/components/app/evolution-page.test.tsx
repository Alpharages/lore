import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import EvolutionPage, { dynamic as evolutionRouteDynamic } from "@/app/(dashboard)/evolution/page";
import type { EvolutionItem } from "@/lib/api-types";

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
  usePathname: () => "/evolution",
}));

const mockFetchCurrent = vi.fn();
const mockFetchProposals = vi.fn();
const mockFetchHistory = vi.fn();
const mockFetchItem = vi.fn();
const mockReviewItem = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchEvolutionCurrent: (...args: unknown[]) => mockFetchCurrent(...args),
  fetchEvolutionProposals: (...args: unknown[]) => mockFetchProposals(...args),
  fetchEvolutionHistory: (...args: unknown[]) => mockFetchHistory(...args),
  fetchEvolutionItem: (...args: unknown[]) => mockFetchItem(...args),
  reviewEvolutionItem: (...args: unknown[]) => mockReviewItem(...args),
}));

const item = (overrides: Partial<EvolutionItem> = {}): EvolutionItem => ({
  id: "item-1",
  type: "requirement",
  revision: 1,
  title: "Exports must be paginated",
  statement: "The export API must return at most 500 records per page.",
  rationale: null,
  status: "accepted",
  capture_mode: "manual",
  proposed_by: "dana",
  approved_by: "priya",
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
  ...overrides,
});

const setup = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EvolutionPage />
    </QueryClientProvider>
  );
};

describe("EvolutionPage", () => {
  beforeEach(() => {
    mockFetchCurrent.mockReset();
    mockFetchProposals.mockReset();
    mockFetchHistory.mockReset();
    mocks.projectSlug = "my-project";
    mocks.searchParams = new URLSearchParams();

    mockFetchProposals.mockResolvedValue({ items: [], total: 0 });
    mockFetchCurrent.mockResolvedValue({ items: [], total: 0, warnings: [] });
    mockFetchHistory.mockResolvedValue({
      events: [],
      items: [],
      total_items: 0,
      limit: 50,
      offset: 0,
    });
  });

  // Both the active tab and the open item live in the query string. On a
  // statically prerendered route, `router.replace()` with only search-param
  // changes silently no-ops after a fresh load that already carries a query
  // string, which leaves the tabs and item cards unresponsive in a production
  // build while working fine in dev. Losing this export reintroduces that bug
  // in a way no rendering assertion would catch.
  it("renders dynamically so search-param navigation takes effect", () => {
    expect(evolutionRouteDynamic).toBe("force-dynamic");
  });

  it("asks the user to pick a project when scoped to all projects", async () => {
    mocks.projectSlug = "all";
    setup();

    expect(await screen.findByText("Select a project")).toBeInTheDocument();
    expect(mockFetchCurrent).not.toHaveBeenCalled();
  });

  it("groups current context by item type (FR-PE-62)", async () => {
    mockFetchCurrent.mockResolvedValue({
      items: [
        item({ id: "r1", type: "requirement", title: "A requirement" }),
        item({ id: "c1", type: "constraint", title: "A constraint" }),
        item({ id: "d1", type: "decision", title: "A decision" }),
      ],
      total: 3,
      warnings: [],
    });

    setup();

    expect(await screen.findByText("A requirement")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Requirement/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Decision/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Constraint/ })).toBeInTheDocument();
  });

  it("surfaces unresolved contradiction warnings with the current state (FR-PE-22)", async () => {
    mockFetchCurrent.mockResolvedValue({
      items: [item()],
      total: 1,
      warnings: [
        {
          kind: "unresolved_contradiction",
          message: '"Retention is 90 days" contradicts "Retention is one year"',
          item_ids: ["a", "b"],
        },
      ],
    });

    setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("1 unresolved conflict");
    expect(alert).toHaveTextContent("Retention is 90 days");
  });

  it("shows an empty state when there is no accepted context yet", async () => {
    setup();
    expect(await screen.findByText("No accepted project context yet")).toBeInTheDocument();
  });

  it("badges the number of proposals awaiting review (FR-PE-60)", async () => {
    mockFetchProposals.mockResolvedValue({
      items: [item({ id: "p1", status: "proposed" })],
      total: 1,
    });

    setup();

    expect(await screen.findByText("1 pending review")).toBeInTheDocument();
  });

  it("lists proposals on the inbox tab", async () => {
    mocks.searchParams = new URLSearchParams("tab=inbox");
    mockFetchProposals.mockResolvedValue({
      items: [item({ id: "p1", status: "proposed", title: "Awaiting review" })],
      total: 1,
    });

    setup();

    expect(await screen.findByText("Awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    // The context view is not fetched while the inbox tab is active.
    await waitFor(() => expect(mockFetchCurrent).not.toHaveBeenCalled());
  });

  it("renders the chronological timeline (FR-PE-63)", async () => {
    mocks.searchParams = new URLSearchParams("tab=timeline");
    mockFetchHistory.mockResolvedValue({
      events: [
        {
          id: "e1",
          item_id: "item-1",
          event_type: "accepted",
          revision: 1,
          actor: "priya",
          note: "Confirmed with the platform team.",
          payload: {},
          created_at: "2026-08-02T00:00:00.000Z",
        },
        {
          id: "e2",
          item_id: "item-1",
          event_type: "proposed",
          revision: 1,
          actor: "dana",
          note: null,
          payload: {},
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      items: [{ ...item(), relations: [] }],
      total_items: 1,
      limit: 50,
      offset: 0,
    });

    setup();

    expect(await screen.findByText("accepted")).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
    expect(screen.getByText("Confirmed with the platform team.")).toBeInTheDocument();
    expect(screen.getAllByText("Exports must be paginated")).toHaveLength(2);
  });

  it("flags an item that has no evidence and so cannot be accepted (FR-PE-18)", async () => {
    mocks.searchParams = new URLSearchParams("tab=inbox");
    mockFetchProposals.mockResolvedValue({
      items: [item({ id: "p1", status: "proposed", evidence_count: 0 })],
      total: 1,
    });

    setup();

    expect(await screen.findByText("No evidence")).toBeInTheDocument();
  });

  it("shows redacted evidence as redacted, not as missing evidence (FR-PE-27)", async () => {
    mockFetchCurrent.mockResolvedValue({
      items: [item({ evidence_count: 0, redacted_evidence_count: 1 })],
      total: 1,
      warnings: [],
    });

    setup();

    expect(await screen.findByText("Evidence redacted")).toBeInTheDocument();
    expect(screen.queryByText("No evidence")).not.toBeInTheDocument();
  });

  it("shows the evidence count when evidence is present", async () => {
    mockFetchCurrent.mockResolvedValue({
      items: [item({ evidence_count: 3 })],
      total: 1,
      warnings: [],
    });

    setup();

    expect(await screen.findByText("3 evidence")).toBeInTheDocument();
  });
});
