import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/api";
import { query } from "@/lib/db";
import type { AdminRow } from "@/lib/serializers";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";
import type { SessionUser } from "@/types";

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

// A real hash compared against when the email is unknown, so response timing doesn't reveal accounts.
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  return (dummyHash ??= bcrypt.hash("not-a-real-password", BCRYPT_ROUNDS));
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Cryptographic check only (signature + expiry). No DB access. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * For every protected API route: verifies the signed cookie AND re-checks the admin
 * in the database, so deactivated accounts lose access immediately.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");

  const [admin] = await query<AdminRow>("SELECT id, email, role, is_active FROM admins WHERE id = ? LIMIT 1", [session.sub]);
  if (!admin || !admin.is_active) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");

  return { id: String(admin.id), email: admin.email, role: admin.role };
}
