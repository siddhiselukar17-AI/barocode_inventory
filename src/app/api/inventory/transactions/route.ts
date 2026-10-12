import type { RowDataPacket } from "mysql2/promise";
import { ok, parseQuery, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { serializeTransaction, type TransactionRow } from "@/lib/serializers";
import { buildTransactionWhere } from "@/lib/transaction-query";
import { transactionQuerySchema } from "@/lib/validations/inventory";

export const GET = route(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, transactionQuerySchema);
  const w = buildTransactionWhere(q);
  const dir = q.sort === "asc" ? "ASC" : "DESC";

  const [items, [{ total }]] = await Promise.all([
    query<TransactionRow>(
      `SELECT * FROM inventory_transactions ${w.sql} ORDER BY created_at ${dir}, id ${dir} LIMIT ? OFFSET ?`,
      [...w.params, q.pageSize, (q.page - 1) * q.pageSize],
    ),
    query<{ total: number } & RowDataPacket>(`SELECT COUNT(*) AS total FROM inventory_transactions ${w.sql}`, w.params),
  ]);

  return ok({
    items: items.map(serializeTransaction),
    pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  });
});
