import { Badge } from "@/components/ui/badge";
import { getStockStatus } from "@/lib/utils";
import type { TransactionType } from "@/types";

export function StockBadge({ quantity, threshold }: { quantity: number; threshold: number }) {
  const status = getStockStatus(quantity, threshold);
  if (status === "OUT") return <Badge tone="danger">Out of stock</Badge>;
  if (status === "LOW") return <Badge tone="warning">Low stock</Badge>;
  return <Badge tone="success">In stock</Badge>;
}

export function TransactionTypeBadge({ type }: { type: TransactionType }) {
  if (type === "STOCK_IN") return <Badge tone="success">Stock in</Badge>;
  if (type === "STOCK_OUT") return <Badge tone="danger">Stock out</Badge>;
  return <Badge tone="info">Adjustment</Badge>;
}
