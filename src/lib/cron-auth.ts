import crypto from "crypto";

function timingSafeCompare(left: string, right: string) {
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

export function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authorization = request.headers.get("authorization");
  return authorization
    ? timingSafeCompare(authorization, `Bearer ${secret}`)
    : false;
}
