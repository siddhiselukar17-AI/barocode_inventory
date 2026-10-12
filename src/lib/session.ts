// Edge-safe session helpers (used by middleware and server code). No DB access here.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/types";

export const SESSION_COOKIE = "inv_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface SessionPayload {
  sub: string;
  email: string;
  role: Role;
}

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getKey());
}

/** Validates signature + expiry. Returns null for anything invalid. */
export async function verifySessionToken(token?: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    if (payload.role !== "ADMIN" && payload.role !== "STAFF") return null;
    return { sub: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}
