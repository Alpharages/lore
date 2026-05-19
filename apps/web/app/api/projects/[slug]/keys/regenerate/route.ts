import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";
import { config } from "@/lib/config";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> => {
  const token = req.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const loreUrl = new URL(
    `/api/projects/${encodeURIComponent(slug)}/keys/regenerate`,
    config.apiUrl
  );

  const res = await fetch(loreUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.loreAdminSecret}`,
    },
  });

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};
