import { ApiError, getClientIp, ok, parseBody, route } from "@/lib/api";
import { getDummyHash, setSessionCookie, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { AdminRow } from "@/lib/serializers";
import { signSession } from "@/lib/session";
import { loginSchema } from "@/lib/validations/auth";

const WINDOW = 15 * 60 * 1000;

export const POST = route(async (req) => {
  const ip = getClientIp(req);
  rateLimit(`login:ip:${ip}`, 30, WINDOW);

  const body = await parseBody(req, loginSchema);
  const email = body.email.toLowerCase();
  rateLimit(`login:${ip}:${email}`, 5, WINDOW);

  const [admin] = await query<AdminRow>("SELECT * FROM admins WHERE email = ? LIMIT 1", [email]);

  // Always run a bcrypt compare so timing doesn't reveal whether the email exists.
  const valid = await verifyPassword(body.password, admin?.password_hash ?? (await getDummyHash()));

  // Same generic message for unknown email, wrong password and inactive account.
  if (!admin || !admin.is_active || !valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const token = await signSession({ sub: String(admin.id), email: admin.email, role: admin.role });
  await setSessionCookie(token);
  return ok({ user: { id: String(admin.id), email: admin.email, role: admin.role } });
});
