import type { ResultSetHeader } from "mysql2/promise";
import { ApiError, ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { applyInventoryChange } from "@/lib/inventory";
import { rateLimit } from "@/lib/rate-limit";
import { serializeProduct, type ProductRow } from "@/lib/serializers";
import { likeContains, Where } from "@/lib/sql";
import { normalizeProductFields, productCreateSchema, productListQuerySchema } from "@/lib/validations/product";

// Whitelisted ORDER BY fragments (never built from user input).
const SORTS = {
  name: "name ASC",
  "-name": "name DESC",
  stock: "stock_quantity ASC",
  "-stock": "stock_quantity DESC",
  updated: "updated_at ASC",
  "-updated": "updated_at DESC",
} as const;

export const GET = route(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, productListQuerySchema);

  const w = new Where();
  if (q.archived === "active") w.add("is_archived = 0");
  if (q.archived === "archived") w.add("is_archived = 1");
  if (q.category) w.add("category = ?", q.category);
  if (q.q) {
    const like = likeContains(q.q);
    w.add("(name LIKE ? OR sku LIKE ? OR barcode COLLATE utf8mb4_0900_ai_ci LIKE ?)", like, like, like);
  }
  if (q.status === "out") w.add("stock_quantity = 0");
  if (q.status === "low") w.add("stock_quantity > 0 AND stock_quantity <= low_stock_threshold");
  if (q.status === "in") w.add("stock_quantity > low_stock_threshold");

  const [items, [{ total }], categoryRows] = await Promise.all([
    query<ProductRow>(`SELECT * FROM products ${w.sql} ORDER BY ${SORTS[q.sort]}, id DESC LIMIT ? OFFSET ?`, [
      ...w.params,
      q.pageSize,
      (q.page - 1) * q.pageSize,
    ]),
    query<{ total: number } & import("mysql2/promise").RowDataPacket>(
      `SELECT COUNT(*) AS total FROM products ${w.sql}`,
      w.params,
    ),
    query<{ category: string } & import("mysql2/promise").RowDataPacket>(
      "SELECT DISTINCT category FROM products WHERE is_archived = 0 ORDER BY category",
    ),
  ]);

  return ok({
    items: items.map(serializeProduct),
    categories: categoryRows.map((r) => r.category).filter(Boolean),
    pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  });
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  rateLimit(`mutation:${admin.id}`, 120, 60_000);
  const input = await parseBody(req, productCreateSchema);
  const cols = normalizeProductFields(input);
  const now = new Date();

  // Product + its initial stock transaction commit together (or not at all).
  const id = await withTransaction(async (conn) => {
    const all = { ...cols, stock_quantity: 0, created_at: now, updated_at: now };
    const [res] = await conn.query<ResultSetHeader>("INSERT INTO products SET ?", [all]);
    if (input.initialStock > 0) {
      await applyInventoryChange(
        {
          productId: String(res.insertId),
          type: "STOCK_IN",
          quantity: input.initialStock,
          reason: "Initial stock",
          admin,
          idempotencyKey: `initial-${res.insertId}`,
        },
        conn,
      );
    }
    return res.insertId;
  });

  const [fresh] = await query<ProductRow>("SELECT * FROM products WHERE id = ?", [id]);
  if (!fresh) throw new ApiError(500, "INTERNAL_ERROR", "Product could not be loaded");
  return ok(serializeProduct(fresh), 201);
});
