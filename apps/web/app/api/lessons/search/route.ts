import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";
import { config } from "@/lib/config";

export const GET = async (req: NextRequest): Promise<NextResponse> => {
  const token = req.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const loreUrl = new URL("/api/lessons/search", config.apiUrl);
  searchParams.forEach((value, key) => {
    loreUrl.searchParams.set(key, value);
  });

  const res = await fetch(loreUrl.toString(), {
    headers: {
      Authorization: `Bearer ${config.loreAdminSecret}`,
    },
  });

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};
