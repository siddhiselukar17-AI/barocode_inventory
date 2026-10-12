import { ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const GET = route(async () => {
  const user = await requireAdmin();
  return ok({ user });
});
