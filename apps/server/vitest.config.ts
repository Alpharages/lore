import { defineConfig } from "vitest/config";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://postgres:12345678@localhost:5432/lore";

export default defineConfig({
  root: ".",
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
