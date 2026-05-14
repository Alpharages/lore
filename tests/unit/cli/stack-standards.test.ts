import { describe, it, expect } from "vitest";
import { detectStackStandards } from "../../../src/cli/utils/stack-standards.js";

describe("detectStackStandards", () => {
  describe("TypeScript / JavaScript", () => {
    it("detects typescript", () => {
      const s = detectStackStandards(["typescript", "node"]);
      expect(s.styleRule).toContain("Arrow functions");
      expect(s.commitChecks).toContain("pnpm lint");
      expect(s.commitChecks).toContain("pnpm test");
    });

    it("detects nextjs", () => {
      const s = detectStackStandards(["nextjs", "react"]);
      expect(s.commitChecks).toContain("pnpm");
    });

    it("uses TS defaults when no tags are provided", () => {
      const s = detectStackStandards([]);
      expect(s.commitChecks).toContain("pnpm lint");
    });
  });

  describe("Python", () => {
    it("detects python tag", () => {
      const s = detectStackStandards(["python", "fastapi", "postgres"]);
      expect(s.styleRule).toContain("Type-hint");
      expect(s.commitChecks).toContain("ruff check");
      expect(s.commitChecks).toContain("pytest");
    });

    it("detects django", () => {
      const s = detectStackStandards(["django", "postgres"]);
      expect(s.commitChecks).toContain("pytest");
    });

    it("detects flask", () => {
      const s = detectStackStandards(["flask"]);
      expect(s.commitChecks).toContain("ruff");
    });
  });

  describe("PHP / Laravel", () => {
    it("detects laravel", () => {
      const s = detectStackStandards(["php", "laravel", "mysql"]);
      expect(s.styleRule).toContain("strict_types");
      expect(s.commitChecks).toContain("phpstan");
      expect(s.commitChecks).toContain("pest");
    });

    it("detects symfony", () => {
      const s = detectStackStandards(["symfony"]);
      expect(s.commitChecks).toContain("pint");
    });
  });

  describe("Ruby / Rails", () => {
    it("detects rails", () => {
      const s = detectStackStandards(["ruby", "rails", "postgres"]);
      expect(s.styleRule).toContain("frozen string");
      expect(s.commitChecks).toContain("rubocop");
      expect(s.commitChecks).toContain("rspec");
    });
  });

  describe("Go", () => {
    it("detects go", () => {
      const s = detectStackStandards(["go", "postgres"]);
      expect(s.styleRule).toContain("gofmt");
      expect(s.commitChecks).toContain("golangci-lint");
      expect(s.commitChecks).toContain("go test");
    });

    it("detects golang alias", () => {
      const s = detectStackStandards(["golang"]);
      expect(s.commitChecks).toContain("go test");
    });
  });

  describe("Rust", () => {
    it("detects rust", () => {
      const s = detectStackStandards(["rust"]);
      expect(s.styleRule).toContain("unwrap");
      expect(s.commitChecks).toContain("cargo clippy");
      expect(s.commitChecks).toContain("cargo test");
    });
  });

  describe("Java / Kotlin", () => {
    it("detects spring", () => {
      const s = detectStackStandards(["java", "spring", "postgres"]);
      expect(s.styleRule).toContain("constructor injection");
      expect(s.commitChecks).toContain("mvnw");
    });

    it("detects kotlin", () => {
      const s = detectStackStandards(["kotlin", "springboot"]);
      expect(s.commitChecks).toContain("mvnw");
    });
  });

  describe("stack tag casing", () => {
    it("is case-insensitive", () => {
      const s = detectStackStandards(["Python", "FastAPI"]);
      expect(s.commitChecks).toContain("pytest");
    });
  });

  describe("precedence", () => {
    it("python wins over typescript in a mixed stack", () => {
      const s = detectStackStandards(["python", "typescript"]);
      expect(s.commitChecks).toContain("pytest");
    });

    it("php wins over typescript in a mixed stack", () => {
      const s = detectStackStandards(["php", "node"]);
      expect(s.commitChecks).toContain("phpstan");
    });
  });
});
