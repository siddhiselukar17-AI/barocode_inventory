import type { z } from "zod";
import type { transactionQuerySchema } from "@/lib/validations/inventory";
import { likeContains, Where } from "@/lib/sql";

type TransactionQuery = z.infer<typeof transactionQuerySchema>;

/** Builds the WHERE clause shared by the transactions list and the CSV export. */
export function buildTransactionWhere(q: Pick<TransactionQuery, "q" | "type" | "from" | "to">) {
  const w = new Where();
  if (q.type) w.add("type = ?", q.type);
  if (q.q) {
    const like = likeContains(q.q);
    w.add(
      "(product_name_snapshot LIKE ? OR sku LIKE ? OR barcode COLLATE utf8mb4_0900_ai_ci LIKE ?)",
      like,
      like,
      like,
    );
  }
  if (q.from) w.add("created_at >= ?", new Date(q.from));
  if (q.to) w.add("created_at <= ?", new Date(q.to));
  return w;
}
