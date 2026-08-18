import { NextRequest, NextResponse } from "next/server";
import { proxyEvolutionRequest } from "@/lib/evolution-proxy";

export const POST = async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyEvolutionRequest(
    req,
    `/api/project-evolution/items/${encodeURIComponent(id)}/review`,
    { method: "POST", body }
  );
};
