import { Writable } from "stream";
import type { Logger } from "pino";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { buildApp } from "../../src/api/app.js";
import { createLogger } from "../../src/utils/logger.js";
import * as schema from "../../src/db/schema.js";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL || "postgres://lore:lore@localhost:5432/lore_memory";

export interface CapturedApp {
  app: ReturnType<typeof buildApp>;
  lines: () => Array<Record<string, unknown>>;
  rawLines: () => string[];
  logger: Logger;
}

export function createCapturedApp(opts?: { logLevel?: string }): CapturedApp {
  const rawLines: string[] = [];

  const destination = new Writable({
    write(chunk, _encoding, callback) {
      const str = chunk.toString().trim();
      if (str) rawLines.push(str);
      callback();
    },
  });

  const originalLevel = process.env.LOG_LEVEL;
  if (opts?.logLevel) {
    process.env.LOG_LEVEL = opts.logLevel;
  }

  const logger = createLogger(destination as any);

  if (opts?.logLevel) {
    if (originalLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLevel;
    }
  }

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const app = buildApp({ pool, db: db as any, logger });

  return {
    app,
    logger,
    lines: () =>
      rawLines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { _raw: line };
        }
      }),
    rawLines: () => [...rawLines],
  };
}
