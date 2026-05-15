import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "@/components/app/stat-card";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Total Lessons" value={247} />);

    expect(screen.getByText("Total Lessons")).toBeInTheDocument();
    expect(screen.getByText("247")).toBeInTheDocument();
  });

  it("formats large values with toLocaleString", () => {
    render(<StatCard label="Total Lessons" value={10000} />);

    expect(screen.getByText("10,000")).toBeInTheDocument();
  });

  it("renders secondary text when provided", () => {
    render(<StatCard label="Total Lessons" value={247} secondary="+18 this month" />);

    expect(screen.getByText("+18 this month")).toBeInTheDocument();
  });

  it("does not render secondary text when omitted", () => {
    render(<StatCard label="Total Lessons" value={247} />);

    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
  });

  it("renders zero as 0, not blank", () => {
    render(<StatCard label="Sessions Run" value={0} />);

    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("applies primary color to the value", () => {
    const { container } = render(<StatCard label="Total Lessons" value={247} />);

    const valueEl = container.querySelector(".text-primary");
    expect(valueEl).toBeInTheDocument();
    expect(valueEl).toHaveTextContent("247");
  });

  it("applies large font size to the value", () => {
    const { container } = render(<StatCard label="Total Lessons" value={247} />);

    const valueEl = container.querySelector(".text-4xl");
    expect(valueEl).toBeInTheDocument();
  });
});
