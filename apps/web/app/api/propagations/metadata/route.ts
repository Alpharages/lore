import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";
import { config } from "@/lib/config";

export const GET = async (req: NextRequest): Promise<NextResponse> => {
  const token = req.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = req.nextUrl.searchParams.get("project");
  const loreUrl = new URL("/api/propagations/metadata", config.apiUrl);
  if (project) loreUrl.searchParams.set("project", project);

  const res = await fetch(loreUrl.toString(), {
    headers: { Authorization: `Bearer ${config.webUiSecret}` },
  });

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};
