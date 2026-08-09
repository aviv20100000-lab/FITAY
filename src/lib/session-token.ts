import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role, User } from "./types";

export const SESSION_COOKIE_NAME = "fitay-session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 60;
export const SESSION_RENEW_AFTER_SEC = 60 * 60 * 24 * 7;

function sessionSecret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET חסר בהגדרות הפרויקט");
  return new TextEncoder().encode(value);
}

export async function createSessionToken(
  user: Pick<User, "id" | "role">,
  version: number
) {
  return new SignJWT({ sub: user.id, role: user.role, ver: version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60d")
    .sign(sessionSecret());
}

export function verifySessionToken(token: string) {
  return jwtVerify(token, sessionSecret());
}

export async function renewSessionToken(payload: JWTPayload) {
  const role = payload.role;
  const version = Number(payload.ver);
  if (!payload.sub || (role !== "coach" && role !== "trainee") || !Number.isFinite(version)) {
    throw new Error("Invalid session payload");
  }
  return createSessionToken({ id: payload.sub, role: role as Role }, version);
}
