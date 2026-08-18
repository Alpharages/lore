import { NextRequest, NextResponse } from "next/server";
import { proxyEvolutionRequest } from "@/lib/evolution-proxy";

export const GET = async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await ctx.params;
  return proxyEvolutionRequest(req, `/api/project-evolution/items/${encodeURIComponent(id)}`);
};
