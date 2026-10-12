"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, PackageCheck, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/states";
import { TransactionTypeBadge } from "@/components/products/badges";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn, formatDateTime } from "@/lib/utils";
import type { TransactionDTO } from "@/types";

type RangeKey = "today" | "7d" | "30d";
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
];

interface Totals {
  count: number;
  units: number;
}
interface Metrics {
  range: { key: RangeKey; days: number; from: string };
  current: { activeProducts: number; unitsInStock: number; lowStockProducts: number; outOfStockProducts: number };
  allTime: { stockIn: Totals; stockOut: Totals; adjustments: Totals };
  period: { stockIn: Totals; stockOut: Totals; adjustments: Totals };
  daily: { day: string; type: string; units: number }[];
  recent: TransactionDTO[];
}

function localDayKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function tzOffsetString() {
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  icon: typeof Boxes;
  tone: string;
  href?: string;
}) {
  const body = (
    <Card className={cn("h-full", href && "transition-shadow hover:shadow-md")}>
      <CardContent className="flex items-center gap-4 p-5">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const days = RANGES.find((r) => r.key === range)!.days;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    const qs = new URLSearchParams({ range, from: from.toISOString(), tz: tzOffsetString() });
    try {
      setData(await apiFetch<Metrics>(`/api/dashboard/metrics?${qs}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const series = useMemo(() => {
    if (!data) return [];
    const start = new Date(data.range.from);
    return Array.from({ length: data.range.days }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = localDayKey(d);
      const units = (type: string) => data.daily.find((x) => x.day === key && x.type === type)?.units ?? 0;
      return {
        key,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        in: units("STOCK_IN"),
        out: units("STOCK_OUT"),
      };
    });
  }, [data]);

  const maxUnits = Math.max(1, ...series.flatMap((s) => [s.in, s.out]));
  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();

  return (
    <div>
      <PageHeader title="Dashboard" description="Live inventory metrics from your database." />

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Current snapshot */}
          <section aria-labelledby="current-h">
            <h2 id="current-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Current inventory <span className="font-normal normal-case">(right now, not date-filtered)</span>
            </h2>
            {loading || !data ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Active products" value={data.current.activeProducts} icon={Boxes} tone="bg-indigo-100 text-indigo-700" href="/admin/products" />
                <Kpi label="Units in stock" value={data.current.unitsInStock} icon={PackageCheck} tone="bg-green-100 text-green-700" href="/admin/inventory" />
                <Kpi label="Low stock products" value={data.current.lowStockProducts} icon={AlertTriangle} tone="bg-amber-100 text-amber-700" href="/admin/inventory?status=low" />
                <Kpi label="Out of stock products" value={data.current.outOfStockProducts} icon={PackageX} tone="bg-red-100 text-red-700" href="/admin/inventory?status=out" />
              </div>
            )}
          </section>

          {/* Period */}
          <section aria-labelledby="period-h">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="period-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Activity in selected period
              </h2>
              <div role="group" aria-label="Date range" className="inline-flex rounded-md border bg-card p-0.5">
                {RANGES.map((r) => (
                  <Button
                    key={r.key}
                    size="sm"
                    variant={range === r.key ? "default" : "ghost"}
                    aria-pressed={range === r.key}
                    onClick={() => setRange(r.key)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>

            {loading || !data ? (
              <Skeleton className="h-72" />
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Stock movement (units per day)</CardTitle>
                    <CardDescription>
                      {rangeLabel}: <span className="font-medium text-green-700">+{data.period.stockIn.units.toLocaleString()} in</span>{" "}
                      · <span className="font-medium text-red-700">−{data.period.stockOut.units.toLocaleString()} out</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.period.stockIn.count + data.period.stockOut.count + data.period.adjustments.count === 0 ? (
                      <EmptyState title="No movements in this period" description="Stock in/out transactions will appear here." />
                    ) : (
                      <div>
                        <div
                          role="img"
                          aria-label={`Bar chart of stock in and stock out units per day, ${rangeLabel}`}
                          className="flex h-52 items-end gap-1 overflow-x-auto pb-1"
                        >
                          {series.map((s) => (
                            <div key={s.key} className="flex h-full min-w-[1.25rem] flex-1 flex-col items-center justify-end gap-1">
                              <div className="flex h-full w-full items-end justify-center gap-0.5">
                                <div
                                  title={`${s.label}: ${s.in} in`}
                                  className="w-full max-w-3 rounded-t bg-green-500"
                                  style={{ height: `${(s.in / maxUnits) * 100}%`, minHeight: s.in ? 2 : 0 }}
                                />
                                <div
                                  title={`${s.label}: ${s.out} out`}
                                  className="w-full max-w-3 rounded-t bg-red-500"
                                  style={{ height: `${(s.out / maxUnits) * 100}%`, minHeight: s.out ? 2 : 0 }}
                                />
                              </div>
                              {series.length <= 8 && <span className="text-[10px] text-muted-foreground">{s.label}</span>}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" /> Stock in</span>
                          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Stock out</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Transactions</CardTitle>
                    <CardDescription>Selected period vs. all time</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Row icon={ArrowDownToLine} label="Stock in" period={data.period.stockIn} total={data.allTime.stockIn} />
                    <Row icon={ArrowUpFromLine} label="Stock out" period={data.period.stockOut} total={data.allTime.stockOut} />
                    <p className="text-xs text-muted-foreground">
                      Adjustments: {data.period.adjustments.count} in period · {data.allTime.adjustments.count} all time
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>

          {/* Recent */}
          <section aria-labelledby="recent-h">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="recent-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Recent transactions
              </h2>
              <Link href="/admin/transactions" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            <Card className="overflow-hidden">
              {loading || !data ? (
                <Skeleton className="h-48 rounded-none" />
              ) : data.recent.length === 0 ? (
                <EmptyState
                  title="No transactions yet"
                  description="Add a product and record stock movements to see activity here."
                  action={
                    <Link href="/admin/products/new">
                      <Button size="sm">Add product</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Product</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5 text-right">Qty</th>
                        <th className="px-4 py-2.5 text-right">Stock</th>
                        <th className="px-4 py-2.5">By</th>
                        <th className="px-4 py-2.5">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.recent.map((t) => (
                        <tr key={t.id}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{t.productName}</p>
                            <p className="text-xs text-muted-foreground">{t.sku}</p>
                          </td>
                          <td className="px-4 py-2.5"><TransactionTypeBadge type={t.type} /></td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{t.quantity}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{t.stockBefore} → {t.stockAfter}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{t.performedBy.email}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, period, total }: { icon: typeof Boxes; label: string; period: Totals; total: Totals }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{total.count.toLocaleString()} all time · {total.units.toLocaleString()} units</p>
      </div>
      <Badge tone="info">{period.count.toLocaleString()} in period</Badge>
    </div>
  );
}
