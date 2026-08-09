import { NextResponse, type NextRequest } from "next/server";
import {
  renewSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  SESSION_RENEW_AFTER_SEC,
  verifySessionToken,
} from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return response;

  try {
    const { payload } = await verifySessionToken(token);
    const now = Math.floor(Date.now() / 1000);
    if (payload.iat != null && now - payload.iat <= SESSION_RENEW_AFTER_SEC) {
      return response;
    }

    response.cookies.set(SESSION_COOKIE_NAME, await renewSessionToken(payload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SEC,
      path: "/",
    });
  } catch {
    // Invalid and expired sessions remain untouched; getSessionUser rejects them.
  }
  return response;
}

export const config = {
  matcher: ["/client/:path*", "/coach/:path*", "/spots/:path*", "/method/:path*", "/api/:path*"],
};
