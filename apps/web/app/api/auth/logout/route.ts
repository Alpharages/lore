import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/session-store";
import { config } from "@/lib/config";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const token = request.cookies.get("session")?.value;
  if (token) deleteSession(token);

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set("session", "", {
    httpOnly: true,
    sameSite: "strict",
    secure: config.cookieSecure,
    maxAge: 0,
    path: "/",
  });
  return response;
};
