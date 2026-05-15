import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/app/empty-state";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="All caught up" description="No pending suggestions." />);

    expect(screen.getByText("All caught up")).toBeInTheDocument();
    expect(screen.getByText("No pending suggestions.")).toBeInTheDocument();
  });

  it("applies fade-in animation classes", () => {
    const { container } = render(<EmptyState title="Title" description="Desc" />);

    expect(container.firstChild).toHaveClass("animate-in", "fade-in-0", "duration-100");
  });

  it("centers content vertically and horizontally", () => {
    const { container } = render(<EmptyState title="Title" description="Desc" />);

    expect(container.firstChild).toHaveClass("flex", "flex-col", "items-center", "justify-center");
  });
});
