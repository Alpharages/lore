import pino from "pino";
import type { DestinationStream } from "pino";

function buildTimestamp() {
  const iso = new Date().toISOString();
  const truncated = iso.replace(/\.\d{3}Z$/, "Z");
  return `,"timestamp":"${truncated}"`;
}

function sanitizeLevel(level: string | undefined): string {
  if (!level) return "info";
  const lower = level.toLowerCase();
  if (["debug", "info", "warn", "error"].includes(lower)) return lower;
  return "info";
}

export function createLogger(destination?: DestinationStream): pino.Logger {
  // When a custom destination is provided (e.g. tests), disable pretty-print
  // so output is captured as parseable JSON.
  const usePretty =
    !destination && process.env.NODE_ENV !== "production";

  return pino(
    {
      level: sanitizeLevel(process.env.LOG_LEVEL),
      timestamp: buildTimestamp,
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      base: undefined,
      redact: {
        paths: [
          "*.api_key",
          "*.api_key_hash",
          "*.password",
          "*.token",
          "*.authorization",
          "headers.authorization",
        ],
        censor: "[Redacted]",
      },
      ...(usePretty
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true },
            },
          }
        : {}),
    },
    destination
  );
}

export const logger = createLogger();

export function maskProjectId(uuid: string): string {
  if (!uuid || uuid === "-") return "-";
  return `${uuid.slice(0, 8)}-…-${uuid.slice(-4)}`;
}

export function maskIp(ip: string): string {
  if (!ip) return "-";
  // IPv4: zero last octet
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    return ip;
  }
  // IPv6: keep first 3 groups, append ::
  if (ip.includes(":")) {
    const groups = ip.split(":").filter((g) => g.length > 0);
    const firstThree = groups.slice(0, 3);
    return firstThree.length > 0 ? `${firstThree.join(":")}::` : ip;
  }
  return ip;
}
