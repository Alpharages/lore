import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/session-store";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const token = request.cookies.get("session")?.value;
  if (token) deleteSession(token);

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set("session", "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
};
