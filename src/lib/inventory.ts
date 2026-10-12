import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { ApiError } from "@/lib/api";
import { isDuplicateEntry, query, withTransaction } from "@/lib/db";
import { serializeTransaction, type ProductRow, type TransactionRow } from "@/lib/serializers";
import type { InventoryChangeResult, TransactionType } from "@/types";

/**
 * Single entry point for EVERY stock change (stock in/out, adjustments, initial stock, seeding).
 *
 * Consistency
 * -----------
 * Each change runs in one InnoDB transaction:
 *   1. `SELECT ... FOR UPDATE` locks the product row, so concurrent requests for the same product
 *      are serialised and always see the latest quantity (no overselling, no lost updates).
 *   2. The new quantity, before/after values and the admin are computed on the server.
 *   3. The product update and the history INSERT commit together or roll back together.
 * Database CHECK constraints (stock >= 0) and triggers (history is append-only) are a second line
 * of defence behind these application checks.
 *
 * Retry safety: an optional idempotencyKey (unique per admin via a UNIQUE index) makes a retried
 * request return the original result instead of creating a second movement.
 */

export interface ChangeRequest {
  productId: string;
  type: TransactionType;
  /** STOCK_IN / STOCK_OUT quantity (positive integer). */
  quantity?: number;
  /** ADJUSTMENT only. SET = verified new stock level, DELTA = signed change. */
  adjustment?: { mode: "SET" | "DELTA"; value: number };
  reason?: string;
  admin: { id: string; email: string };
  idempotencyKey?: string;
}

async function applyOnConnection(conn: PoolConnection, req: ChangeRequest): Promise<InventoryChangeResult> {
  const [rows] = await conn.query<ProductRow[]>("SELECT * FROM products WHERE id = ? FOR UPDATE", [req.productId]);
  const product = rows[0];
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  if (product.is_archived) throw new ApiError(409, "PRODUCT_ARCHIVED", "This product is archived. Restore it first.");

  const current = product.stock_quantity;
  let delta: number;

  if (req.type === "STOCK_IN") {
    delta = req.quantity!;
  } else if (req.type === "STOCK_OUT") {
    const qty = req.quantity!;
    if (current < qty) {
      throw new ApiError(409, "INSUFFICIENT_STOCK", `Insufficient stock: ${current} available, ${qty} requested.`, {
        available: current,
      });
    }
    delta = -qty;
  } else {
    const adj = req.adjustment!;
    delta = adj.mode === "SET" ? adj.value - current : adj.value;
    if (delta === 0) throw new ApiError(400, "NO_CHANGE", "Adjustment does not change the stock quantity.");
    if (current + delta < 0) {
      throw new ApiError(409, "NEGATIVE_STOCK", `Adjustment would make stock negative (current: ${current}).`);
    }
  }

  const after = current + delta;
  const now = new Date();

  await conn.query("UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?", [after, now, product.id]);
  const [ins] = await conn.query<ResultSetHeader>(
    `INSERT INTO inventory_transactions
       (product_id, product_name_snapshot, barcode, sku, type, quantity, stock_before, stock_after,
        reason, performed_by, performed_by_email, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      product.id,
      product.name,
      product.barcode,
      product.sku,
      req.type,
      Math.abs(delta),
      current,
      after,
      req.reason?.trim() || null,
      req.admin.id,
      req.admin.email,
      req.idempotencyKey ?? null,
      now,
    ],
  );

  const tx = {
    id: ins.insertId,
    product_id: product.id,
    product_name_snapshot: product.name,
    barcode: product.barcode,
    sku: product.sku,
    type: req.type,
    quantity: Math.abs(delta),
    stock_before: current,
    stock_after: after,
    reason: req.reason?.trim() || null,
    performed_by: Number(req.admin.id),
    performed_by_email: req.admin.email,
    idempotency_key: req.idempotencyKey ?? null,
    created_at: now,
  } as TransactionRow;

  return {
    transaction: serializeTransaction(tx),
    product: {
      id: String(product.id),
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      stockQuantity: after,
    },
    replayed: false,
  };
}

async function findReplay(req: ChangeRequest): Promise<InventoryChangeResult | null> {
  if (!req.idempotencyKey) return null;
  const [existing] = await query<TransactionRow>(
    "SELECT * FROM inventory_transactions WHERE performed_by = ? AND idempotency_key = ? LIMIT 1",
    [req.admin.id, req.idempotencyKey],
  );
  if (!existing) return null;
  if (String(existing.product_id) !== String(req.productId) || existing.type !== req.type) {
    throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different request.");
  }
  const [product] = await query<ProductRow>("SELECT * FROM products WHERE id = ? LIMIT 1", [existing.product_id]);
  return {
    transaction: serializeTransaction(existing),
    product: {
      id: String(existing.product_id),
      name: product?.name ?? existing.product_name_snapshot,
      sku: product?.sku ?? existing.sku,
      barcode: product?.barcode ?? existing.barcode,
      stockQuantity: product?.stock_quantity ?? existing.stock_after,
    },
    replayed: true,
  };
}

/**
 * Applies a stock change. Pass `conn` only when the caller already owns an open transaction
 * (e.g. creating a product together with its initial stock).
 */
export async function applyInventoryChange(req: ChangeRequest, conn?: PoolConnection): Promise<InventoryChangeResult> {
  if (conn) return applyOnConnection(conn, req);

  const replay = await findReplay(req);
  if (replay) return replay;

  try {
    return await withTransaction((c) => applyOnConnection(c, req));
  } catch (e) {
    // Two concurrent requests with the same key: the loser's transaction rolled back (stock untouched)
    // and it returns the winner's result.
    if (isDuplicateEntry(e) && req.idempotencyKey) {
      const replayed = await findReplay(req);
      if (replayed) return replayed;
    }
    throw e;
  }
}
