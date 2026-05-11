import { describe, it, expect } from "vitest";
import { toKebabCase } from "../../../src/cli/utils/init-prompts.js";

describe("toKebabCase", () => {
  it("converts simple name to kebab-case", () => {
    expect(toKebabCase("My Project")).toBe("my-project");
  });

  it("handles multiple spaces", () => {
    expect(toKebabCase("My   Awesome   Project")).toBe("my-awesome-project");
  });

  it("strips special characters", () => {
    expect(toKebabCase("My @#$%^&*() Project")).toBe("my-project");
  });

  it("handles mixed case", () => {
    expect(toKebabCase("MyAwEsOmE PrOjEcT")).toBe("myawesome-project");
  });

  it("collapses consecutive hyphens", () => {
    expect(toKebabCase("My---Project")).toBe("my-project");
  });

  it("trims leading and trailing hyphens", () => {
    expect(toKebabCase("---My Project---")).toBe("my-project");
  });

  it("handles empty string", () => {
    expect(toKebabCase("")).toBe("");
  });

  it("handles single word", () => {
    expect(toKebabCase("Project")).toBe("project");
  });
});
