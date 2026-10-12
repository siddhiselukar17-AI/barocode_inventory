import { ApiError, assertId, ok, parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { execute, query } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { serializeProduct, type ProductRow } from "@/lib/serializers";
import { normalizeProductFields, productUpdateSchema } from "@/lib/validations/product";

type Params = { id: string };

async function loadProduct(id: string) {
  const [product] = await query<ProductRow>("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  return product;
}

export const GET = route<Params>(async (_req, { params }) => {
  await requireAdmin();
  assertId(params.id, "product id");
  return ok(serializeProduct(await loadProduct(params.id)));
});

export const PATCH = route<Params>(async (req, { params }) => {
  const admin = await requireAdmin();
  rateLimit(`mutation:${admin.id}`, 120, 60_000);
  assertId(params.id, "product id");

  // The schema is strict: a body containing stockQuantity (or any unknown field) is rejected.
  const input = await parseBody(req, productUpdateSchema);
  const cols = normalizeProductFields(input);
  if (Object.keys(cols).length === 0) throw new ApiError(400, "NO_CHANGES", "No fields to update");

  await loadProduct(params.id);
  await execute("UPDATE products SET ?, updated_at = ? WHERE id = ?", [cols, new Date(), params.id]);
  return ok(serializeProduct(await loadProduct(params.id)));
});

export const DELETE = route<Params>(async (_req, { params }) => {
  const admin = await requireAdmin();
  rateLimit(`mutation:${admin.id}`, 120, 60_000);
  assertId(params.id, "product id");

  const product = await loadProduct(params.id);

  // Products with history are archived (kept for traceability); never-used products are removed.
  const [{ n }] = await query<{ n: number } & import("mysql2/promise").RowDataPacket>(
    "SELECT COUNT(*) AS n FROM inventory_transactions WHERE product_id = ?",
    [product.id],
  );
  if (n > 0) {
    await execute("UPDATE products SET is_archived = 1, updated_at = ? WHERE id = ?", [new Date(), product.id]);
    return ok({ archived: true, deleted: false });
  }
  await execute("DELETE FROM products WHERE id = ?", [product.id]);
  return ok({ archived: false, deleted: true });
});
