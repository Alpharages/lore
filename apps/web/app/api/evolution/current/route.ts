import { NextRequest, NextResponse } from "next/server";
import { proxyEvolutionRequest } from "@/lib/evolution-proxy";

export const GET = async (req: NextRequest): Promise<NextResponse> =>
  proxyEvolutionRequest(req, "/api/project-evolution/current");
