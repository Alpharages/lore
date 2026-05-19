import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";
import { config } from "@/lib/config";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const token = req.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const loreUrl = new URL(
    `/api/admin/propagations/${encodeURIComponent(id)}/accept`,
    config.apiUrl
  );

  const res = await fetch(loreUrl.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.loreAdminSecret}` },
  });

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};
