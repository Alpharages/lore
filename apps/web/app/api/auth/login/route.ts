import { timingSafeEqual } from "crypto";
import { serialize } from "cookie";
import { createSession } from "@/lib/session-store";
import { config } from "@/lib/config";

export const POST = async (req: Request): Promise<Response> => {
  let password: string;
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body.password !== "string") {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    password = body.password;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const secret = config.webUiSecret;

  const inputBuf = Buffer.from(password);
  const secretBuf = Buffer.from(secret);
  const maxLen = Math.max(inputBuf.length, secretBuf.length, 1);
  const paddedInput = Buffer.concat([inputBuf, Buffer.alloc(maxLen)]).slice(0, maxLen);
  const paddedSecret = Buffer.concat([secretBuf, Buffer.alloc(maxLen)]).slice(0, maxLen);
  const lengthMatch = inputBuf.length === secretBuf.length;
  const contentMatch = timingSafeEqual(paddedInput, paddedSecret);
  const valid = lengthMatch && contentMatch;

  if (!valid) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = createSession();
  const response = Response.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    serialize("session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    })
  );
  return response;
};
