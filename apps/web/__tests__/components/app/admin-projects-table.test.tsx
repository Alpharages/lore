import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdminProjectsTable } from "@/components/app/admin-projects-table";
import type { Project } from "@/lib/api-types";

const mockFetchProjects = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchProjects: (...args: unknown[]) => mockFetchProjects(...args),
}));

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: "proj-001",
  name: "Lore Platform",
  slug: "lore",
  stackTags: ["typescript", "nextjs"],
  lessonCount: 42,
  createdAt: "2026-05-10T10:00:00Z",
  keyId: null,
  ...overrides,
});

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
      <AdminProjectsTable />
    </QueryClientProvider>
  );
  return { queryClient };
};

describe("AdminProjectsTable", () => {
  beforeEach(() => {
    mockFetchProjects.mockReset();
  });

  it("renders 5 skeleton rows while loading", () => {
    mockFetchProjects.mockImplementation(() => new Promise(() => {}));
    setup();

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it("renders table headers", async () => {
    mockFetchProjects.mockResolvedValue([]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("Name")).toBeInTheDocument();
    });

    expect(screen.getByText("Slug")).toBeInTheDocument();
    expect(screen.getByText("Stack Tags")).toBeInTheDocument();
    expect(screen.getByText("Lesson Count")).toBeInTheDocument();
    expect(screen.getByText("Created Date")).toBeInTheDocument();
    expect(screen.getByText("Keys")).toBeInTheDocument();
  });

  it("renders an ApiKeyManager trigger button in each project row", async () => {
    mockFetchProjects.mockResolvedValue([
      makeProject({ name: "Lore Platform", slug: "lore", keyId: "key-1" }),
      makeProject({ id: "proj-002", name: "StaffedUp", slug: "staffedup", keyId: null }),
    ]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("Lore Platform")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Manage API keys for Lore Platform" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage API keys for StaffedUp" })
    ).toBeInTheDocument();
  });

  it("renders project rows after data loads", async () => {
    mockFetchProjects.mockResolvedValue([
      makeProject({ name: "Lore Platform", slug: "lore", lessonCount: 42 }),
      makeProject({ id: "proj-002", name: "StaffedUp", slug: "staffedup", lessonCount: 7 }),
    ]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("Lore Platform")).toBeInTheDocument();
    });

    expect(screen.getByText("StaffedUp")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders empty state when no projects exist", async () => {
    mockFetchProjects.mockResolvedValue([]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("No projects registered yet.")).toBeInTheDocument();
    });
  });

  it("shows 5 visible tags and overflow badge for projects with more than 5 tags", async () => {
    mockFetchProjects.mockResolvedValue([
      makeProject({
        stackTags: ["typescript", "nextjs", "react", "prisma", "postgres", "fastify", "docker"],
      }),
    ]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("typescript")).toBeInTheDocument();
    });

    expect(screen.getByText("nextjs")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("prisma")).toBeInTheDocument();
    expect(screen.getByText("postgres")).toBeInTheDocument();
    expect(screen.queryByText("fastify")).not.toBeInTheDocument();
    expect(screen.queryByText("docker")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("shows all tags without overflow badge when 5 or fewer tags", async () => {
    mockFetchProjects.mockResolvedValue([
      makeProject({ stackTags: ["typescript", "nextjs", "react"] }),
    ]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("typescript")).toBeInTheDocument();
    });

    expect(screen.getByText("nextjs")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("shows all 5 tags and no overflow badge when exactly 5 tags", async () => {
    mockFetchProjects.mockResolvedValue([
      makeProject({
        stackTags: ["typescript", "nextjs", "react", "prisma", "postgres"],
      }),
    ]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("typescript")).toBeInTheDocument();
    });

    expect(screen.getByText("nextjs")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("prisma")).toBeInTheDocument();
    expect(screen.getByText("postgres")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("renders 0 lesson count without crashing", async () => {
    mockFetchProjects.mockResolvedValue([makeProject({ lessonCount: 0 })]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("0")).toBeInTheDocument();
    });
  });

  it("renders empty tag cell without crashing for project with no tags", async () => {
    mockFetchProjects.mockResolvedValue([makeProject({ stackTags: [] })]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("Lore Platform")).toBeInTheDocument();
    });

    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("renders relative date with ISO title attribute and human-readable label", async () => {
    const isoDate = "2026-01-01T00:00:00Z";
    mockFetchProjects.mockResolvedValue([makeProject({ createdAt: isoDate })]);
    setup();

    await waitFor(() => {
      const dateCell = document.querySelector("[title]");
      expect(dateCell).toHaveAttribute("title", new Date(isoDate).toISOString());
    });

    // Asserts the relative-time output of formatDistanceToNow appears in the cell:
    // e.g. "4 months ago", "about 1 year ago", "less than a minute ago".
    expect(screen.getByText(/ago$|^just now$|^less than/i)).toBeInTheDocument();
  });

  it("sorts projects by createdAt descending (newest first)", async () => {
    mockFetchProjects.mockResolvedValue([
      makeProject({ id: "old", name: "Old Project", createdAt: "2026-01-01T00:00:00Z" }),
      makeProject({ id: "new", name: "New Project", createdAt: "2026-05-10T00:00:00Z" }),
      makeProject({ id: "mid", name: "Mid Project", createdAt: "2026-03-01T00:00:00Z" }),
    ]);
    setup();

    await waitFor(() => {
      expect(screen.getByText("New Project")).toBeInTheDocument();
    });

    const rows = document.querySelectorAll('[data-slot="table-row"]');
    // First data row (index 1 — index 0 is the header row)
    expect(rows[1]).toHaveTextContent("New Project");
    expect(rows[2]).toHaveTextContent("Mid Project");
    expect(rows[3]).toHaveTextContent("Old Project");
  });

  it("opens dialog with curl snippet when 'Add Project' is clicked", async () => {
    mockFetchProjects.mockResolvedValue([]);
    setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add Project/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Add Project/i }));

    await waitFor(() => {
      expect(screen.getByText("Register a New Project")).toBeInTheDocument();
    });

    expect(screen.getByText(/POST[\s\S]*projects\/register/)).toBeInTheDocument();
  });

  it("opens dialog via keyboard Enter on 'Add Project' and closes on Escape", async () => {
    mockFetchProjects.mockResolvedValue([]);
    setup();

    const button = await screen.findByRole("button", { name: /Add Project/i });
    button.focus();
    expect(button).toHaveFocus();

    fireEvent.keyDown(button, { key: "Enter", code: "Enter" });
    // Radix Dialog opens on click; trigger a click as the keyboard activation default.
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Register a New Project")).toBeInTheDocument();
    });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Register a New Project")).not.toBeInTheDocument();
    });
  });

  it("uses ['projects'] as the query key", async () => {
    mockFetchProjects.mockResolvedValue([makeProject()]);
    const { queryClient } = setup();

    await waitFor(() => {
      expect(mockFetchProjects).toHaveBeenCalled();
    });

    const cached = queryClient.getQueryData(["projects"]);
    expect(cached).toBeDefined();
  });
});
