import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";
import { config } from "@/lib/config";

const assertSession = (req: NextRequest): NextResponse | null => {
  const token = req.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
};

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const authError = assertSession(req);
  if (authError) return authError;

  const { id } = await params;
  const loreUrl = new URL(`/api/lessons/${id}`, config.apiUrl);

  const res = await fetch(loreUrl.toString(), {
    headers: {
      Authorization: `Bearer ${config.loreAdminSecret}`,
    },
  });

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const authError = assertSession(req);
  if (authError) return authError;

  const { id } = await params;
  const loreUrl = new URL(`/api/lessons/${id}`, config.apiUrl);

  const res = await fetch(loreUrl.toString(), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.loreAdminSecret}`,
    },
  });

  const body = await res.json().catch(() => ({ error: "unknown" }));
  return NextResponse.json(body, { status: res.status });
};
