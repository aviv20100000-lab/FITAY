import crypto from "crypto";

// CRON_SECRET must be set in .env.local for every local cron request.
// There is deliberately no development bypass because local development uses the live database.

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
