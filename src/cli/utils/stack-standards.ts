export interface AgentStandards {
  styleRule: string;
  commitChecks: string;
}

const PYTHON_TAGS = ["python", "py", "fastapi", "django", "flask", "starlette", "tornado"];
const PHP_TAGS = ["php", "laravel", "symfony", "wordpress", "craft", "yii", "codeigniter"];
const RUBY_TAGS = ["ruby", "rails", "rb", "sinatra", "hanami"];
const GO_TAGS = ["go", "golang"];
const RUST_TAGS = ["rust", "rs"];
const JAVA_TAGS = [
  "java",
  "kotlin",
  "spring",
  "springboot",
  "quarkus",
  "micronaut",
  "gradle",
  "maven",
];
const TS_TAGS = [
  "typescript",
  "javascript",
  "ts",
  "js",
  "node",
  "nextjs",
  "nuxt",
  "fastify",
  "express",
  "koa",
  "hono",
  "react",
  "vue",
  "angular",
  "svelte",
  "solid",
];

const hasAny = (tags: Set<string>, candidates: string[]): boolean =>
  candidates.some((c) => tags.has(c));

export const detectStackStandards = (allStackTags: string[]): AgentStandards => {
  const tags = new Set(allStackTags.map((t) => t.toLowerCase()));

  if (hasAny(tags, PYTHON_TAGS)) {
    return {
      styleRule: "Type-hint all public functions and classes.",
      commitChecks: "`ruff check .`, `ruff format --check .`, `pytest`",
    };
  }

  if (hasAny(tags, PHP_TAGS)) {
    return {
      styleRule: "Declare `strict_types=1` in every file.",
      commitChecks:
        "`./vendor/bin/phpstan analyse`, `./vendor/bin/pint --test`, `./vendor/bin/pest`",
    };
  }

  if (hasAny(tags, RUBY_TAGS)) {
    return {
      styleRule: "Prefer frozen string literals; follow the Ruby style guide.",
      commitChecks: "`bundle exec rubocop`, `bundle exec rspec`",
    };
  }

  if (hasAny(tags, GO_TAGS)) {
    return {
      styleRule: "Use `gofmt`-compliant formatting; export only what is necessary.",
      commitChecks: "`golangci-lint run`, `go test ./...`",
    };
  }

  if (hasAny(tags, RUST_TAGS)) {
    return {
      styleRule: "No `unwrap()` in library code; handle errors with `?`.",
      commitChecks: "`cargo clippy -- -D warnings`, `cargo fmt --check`, `cargo test`",
    };
  }

  if (hasAny(tags, JAVA_TAGS)) {
    return {
      styleRule: "Use constructor injection; prefer immutable value objects.",
      commitChecks: "`./mvnw checkstyle:check`, `./mvnw test`",
    };
  }

  // Default: TypeScript / JavaScript
  if (hasAny(tags, TS_TAGS) || tags.size === 0) {
    return {
      styleRule: "Arrow functions only (`const fn = () => {}`).",
      commitChecks: "`pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`",
    };
  }

  // Unknown stack — generic fallback
  return {
    styleRule: "Follow the project's established code style.",
    commitChecks: "lint, format, and test commands for this stack",
  };
};
