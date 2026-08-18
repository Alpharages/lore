import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";
import { config } from "@/lib/config";

/**
 * Shared proxy for the Lore server's Project Evolution routes.
 *
 * Every route under /api/evolution forwards the browser's request to the Lore
 * server with the admin secret, which never leaves the Next.js server process.
 * `project` is required by the upstream routes and is passed straight through,
 * so the server — not this proxy — decides scope and enforces RLS.
 */
export const proxyEvolutionRequest = async (
  req: NextRequest,
  upstreamPath: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" }
): Promise<NextResponse> => {
  const token = req.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const loreUrl = new URL(upstreamPath, config.apiUrl);
  searchParams.forEach((value, key) => {
    loreUrl.searchParams.set(key, value);
  });

  const res = await fetch(loreUrl.toString(), {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.loreAdminSecret}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};
