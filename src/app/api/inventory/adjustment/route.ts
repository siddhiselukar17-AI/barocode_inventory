import { assertId, ok, parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { applyInventoryChange } from "@/lib/inventory";
import { rateLimit } from "@/lib/rate-limit";
import { adjustmentSchema } from "@/lib/validations/inventory";

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  rateLimit(`inventory:${admin.id}`, 120, 60_000);
  const body = await parseBody(req, adjustmentSchema);
  assertId(body.productId, "product id");
  const result = await applyInventoryChange({
    productId: body.productId,
    type: "ADJUSTMENT",
    adjustment: { mode: body.mode, value: body.value },
    reason: body.reason,
    idempotencyKey: body.idempotencyKey,
    admin,
  });
  return ok(result, result.replayed ? 200 : 201);
});
