import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { Writable } from "stream";
import { createLogger } from "../../src/utils/logger.js";

describe("LOG_LEVEL boot validation", () => {
  it("exits non-zero for invalid LOG_LEVEL", () => {
    const result = spawnSync("npx", ["tsx", "src/index.ts"], {
      env: {
        ...process.env,
        LOG_LEVEL: "verbose",
        ADMIN_SECRET: "test",
        DATABASE_URL: "postgres://x:x@localhost:1/x",
      },
      cwd: process.cwd(),
      timeout: 10000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toContain("LOG_LEVEL");
  });

  it("defaults to info when LOG_LEVEL is unset", () => {
    const rawLines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        const str = chunk.toString().trim();
        if (str) rawLines.push(str);
        callback();
      },
    });

    const prev = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    const logger = createLogger(destination as any);
    if (prev === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prev;

    logger.info({ test: true }, "info message");
    logger.debug({ test: true }, "debug message");

    const lines = rawLines.map((l) => JSON.parse(l));
    expect(lines.some((l) => l.level === "info")).toBe(true);
    expect(lines.some((l) => l.level === "debug")).toBe(false);
  });

  it("accepts uppercase LOG_LEVEL values", () => {
    const rawLines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        const str = chunk.toString().trim();
        if (str) rawLines.push(str);
        callback();
      },
    });

    const prev = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "WARN";
    const logger = createLogger(destination as any);
    process.env.LOG_LEVEL = prev;

    logger.warn({ test: true }, "warn message");
    logger.info({ test: true }, "info message");

    const lines = rawLines.map((l) => JSON.parse(l));
    expect(lines.some((l) => l.level === "warn")).toBe(true);
    expect(lines.some((l) => l.level === "info")).toBe(false);
  });
});
