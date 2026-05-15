import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InboxItem } from "@/components/app/inbox-item";
import type { Propagation } from "@/lib/api-types";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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

const setup = (overrides?: Partial<Propagation>, props?: { showProject?: boolean }) => {
  const onAccept = vi.fn();
  const onReject = vi.fn();

  const propagation = { ...mockPropagation, ...overrides };

  render(
    <InboxItem propagation={propagation} onAccept={onAccept} onReject={onReject} {...props} />
  );

  return { onAccept, onReject, propagation, container: document.body };
};

describe("InboxItem", () => {
  it("renders severity badge", () => {
    setup();
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("renders lesson title as a clickable link", () => {
    setup();
    const link = screen.getByRole("link", {
      name: /Open lesson: React useEffect cleanup missing on async operations/,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/lessons?lesson=lesson-abc-123");
  });

  it("renders problem summary", () => {
    setup();
    expect(
      screen.getByText(/Async operations inside useEffect without cleanup cause memory leaks\./)
    ).toBeInTheDocument();
  });

  it("renders 'Why suggested' with shared tags, source project, occurrence count and trust tier", () => {
    const { container } = setup();
    expect(screen.getByText(/Why suggested:/)).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText(/alpharages\/staffedup/)).toBeInTheDocument();
    expect(screen.getByText(/5 occurrences/)).toBeInTheDocument();
    expect(container.textContent).toMatch(/trust:\s*high/);
  });

  it("renders Accept and Reject buttons", () => {
    setup();
    expect(screen.getByRole("button", { name: /Accept/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeInTheDocument();
  });

  it("calls onAccept with propagation id when Accept is clicked", () => {
    const { onAccept } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith("prop-001");
  });

  it("calls onReject with propagation id when Reject is clicked", () => {
    const { onReject } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith("prop-001");
  });

  it("Accept button has default (primary) variant styling", () => {
    setup();
    const acceptBtn = screen.getByTestId("accept-button");
    expect(acceptBtn).toBeInTheDocument();
  });

  it("Reject button has outline variant styling", () => {
    setup();
    const rejectBtn = screen.getByTestId("reject-button");
    expect(rejectBtn).toBeInTheDocument();
  });

  it("has correct aria-label on Accept button including lesson title", () => {
    setup();
    const acceptBtn = screen.getByRole("button", {
      name: "Accept: React useEffect cleanup missing on async operations",
    });
    expect(acceptBtn).toBeInTheDocument();
  });

  it("has correct aria-label on Reject button including lesson title", () => {
    setup();
    const rejectBtn = screen.getByRole("button", {
      name: "Reject: React useEffect cleanup missing on async operations",
    });
    expect(rejectBtn).toBeInTheDocument();
  });

  it("renders singular 'occurrence' when count is 1", () => {
    setup({ occurrenceCount: 1 });
    expect(screen.getByText(/1 occurrence/)).toBeInTheDocument();
    expect(screen.queryByText(/1 occurrences/)).not.toBeInTheDocument();
  });

  it("renders plural 'occurrences' when count is not 1", () => {
    setup({ occurrenceCount: 5 });
    expect(screen.getByText(/5 occurrences/)).toBeInTheDocument();
  });

  it("handles empty sharedStackTags gracefully", () => {
    setup({ sharedStackTags: [] });
    expect(screen.getByText(/Why suggested:/)).toBeInTheDocument();
    expect(screen.getByText(/with alpharages\/staffedup/)).toBeInTheDocument();
  });

  it("shows targetProject text when showProject is true and targetProject is set", () => {
    setup({ targetProject: "alpharages/other-project" }, { showProject: true });
    expect(screen.getByText("alpharages/other-project")).toBeInTheDocument();
  });

  it("does not show targetProject text when showProject is false", () => {
    setup({ targetProject: "alpharages/other-project" }, { showProject: false });
    expect(screen.queryByText("alpharages/other-project")).not.toBeInTheDocument();
  });

  it("does not call callbacks on render", () => {
    const { onAccept, onReject } = setup();
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });
});
