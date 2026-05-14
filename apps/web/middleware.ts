import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session-store";

export const runtime = "nodejs";

export const middleware = (request: NextRequest): NextResponse => {
  const token = request.cookies.get("session")?.value;
  if (!token || !validateSession(token)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/((?!login|api/auth|_next|favicon).*)"],
};
