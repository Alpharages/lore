import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";
import { config } from "@/lib/config";

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; keyId: string }> }
): Promise<NextResponse> => {
  const token = req.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, keyId } = await params;
  const loreUrl = new URL(
    `/api/projects/${encodeURIComponent(slug)}/keys/${encodeURIComponent(keyId)}`,
    config.apiUrl
  );

  const res = await fetch(loreUrl.toString(), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.webUiSecret}`,
    },
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};
