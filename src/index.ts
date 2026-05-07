import "dotenv/config";
import { pool, db } from "./db/client.js";
import { buildApp } from "./api/app.js";
import { logger } from "./utils/logger.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const PORT = Number(process.env.MCP_SERVER_PORT || "3100");

if (!DATABASE_URL || DATABASE_URL.trim().length === 0) {
  logger.fatal("DATABASE_URL environment variable is required");
  process.exit(1);
}

if (!ADMIN_SECRET || ADMIN_SECRET.trim().length === 0) {
  logger.fatal("ADMIN_SECRET environment variable is required");
  process.exit(1);
}

const app = buildApp({ pool, db });

app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    logger.fatal(err, "Server failed to start");
    process.exit(1);
  }
  logger.info(`Server listening on http://0.0.0.0:${PORT}`);
});
