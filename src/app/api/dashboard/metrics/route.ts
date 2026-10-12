import type { RowDataPacket } from "mysql2/promise";
import { ok, parseQuery, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { serializeTransaction, type TransactionRow } from "@/lib/serializers";
import { dashboardQuerySchema } from "@/lib/validations/inventory";

interface TypeAgg extends RowDataPacket {
  type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  count: number;
  units: number;
}

function byType(rows: TypeAgg[]) {
  const get = (t: TypeAgg["type"]) => {
    const r = rows.find((x) => x.type === t);
    return { count: Number(r?.count ?? 0), units: Number(r?.units ?? 0) };
  };
  return { stockIn: get("STOCK_IN"), stockOut: get("STOCK_OUT"), adjustments: get("ADJUSTMENT") };
}

const TYPE_AGG = "SELECT type, COUNT(*) AS count, COALESCE(SUM(quantity), 0) AS units FROM inventory_transactions";

export const GET = route(async (req) => {
  await requireAdmin();
  const q = parseQuery(req, dashboardQuerySchema);

  const days = q.range === "today" ? 1 : q.range === "7d" ? 7 : 30;
  let from: Date;
  if (q.from) {
    from = new Date(q.from);
  } else {
    from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
  }

  const [productStats, allTime, period, daily, recent] = await Promise.all([
    // CURRENT inventory snapshot (not date dependent)
    query<RowDataPacket & { active: number; units: number; low: number; out: number }>(
      `SELECT COUNT(*) AS active,
              COALESCE(SUM(stock_quantity), 0) AS units,
              COALESCE(SUM(stock_quantity = 0), 0) AS \`out\`,
              COALESCE(SUM(stock_quantity > 0 AND stock_quantity <= low_stock_threshold), 0) AS low
         FROM products WHERE is_archived = 0`,
    ),
    // ALL-TIME transaction totals
    query<TypeAgg>(`${TYPE_AGG} GROUP BY type`),
    // SELECTED PERIOD totals
    query<TypeAgg>(`${TYPE_AGG} WHERE created_at >= ? GROUP BY type`, [from]),
    query<RowDataPacket & { day: string; type: string; units: number }>(
      `SELECT DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', ?), '%Y-%m-%d') AS day, type, SUM(quantity) AS units
         FROM inventory_transactions WHERE created_at >= ? GROUP BY day, type`,
      [q.tz, from],
    ),
    query<TransactionRow>("SELECT * FROM inventory_transactions ORDER BY created_at DESC, id DESC LIMIT 8"),
  ]);

  const s = productStats[0];

  return ok({
    range: { key: q.range, days, from: from.toISOString() },
    current: {
      activeProducts: Number(s.active),
      unitsInStock: Number(s.units),
      lowStockProducts: Number(s.low),
      outOfStockProducts: Number(s.out),
    },
    allTime: byType(allTime),
    period: byType(period),
    daily: daily.map((d) => ({ day: d.day, type: d.type, units: Number(d.units) })),
    recent: recent.map(serializeTransaction),
  });
});
