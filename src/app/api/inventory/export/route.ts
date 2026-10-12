import type { NextRequest } from "next/server";
import { handleError, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { query } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { TransactionRow } from "@/lib/serializers";
import { buildTransactionWhere } from "@/lib/transaction-query";
import { transactionQuerySchema } from "@/lib/validations/inventory";

const MAX_ROWS = 20_000;

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    rateLimit(`export:${admin.id}`, 10, 60_000);
    const q = parseQuery(req, transactionQuerySchema);
    const w = buildTransactionWhere(q);
    const dir = q.sort === "asc" ? "ASC" : "DESC";

    const rows = await query<TransactionRow>(
      `SELECT * FROM inventory_transactions ${w.sql} ORDER BY created_at ${dir}, id ${dir} LIMIT ?`,
      [...w.params, MAX_ROWS],
    );

    const csv = toCsv(
      ["Date (UTC)", "Product", "SKU", "Barcode", "Type", "Quantity", "Stock Before", "Stock After", "Performed By", "Reason"],
      rows.map((t) => [
        new Date(t.created_at).toISOString(),
        t.product_name_snapshot,
        t.sku,
        t.barcode ?? "",
        t.type,
        t.quantity,
        t.stock_before,
        t.stock_after,
        t.performed_by_email,
        t.reason ?? "",
      ]),
    );

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
