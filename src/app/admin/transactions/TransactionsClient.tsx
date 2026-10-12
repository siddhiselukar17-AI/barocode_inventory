"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader, PaginationBar } from "@/components/ui/states";
import { TransactionTypeBadge } from "@/components/products/badges";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { useDebounce } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";
import type { Pagination, TransactionDTO } from "@/types";

interface ListResponse {
  items: TransactionDTO[];
  pagination: Pagination;
}

export function TransactionsClient({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState("");
  const [from, setFrom] = useState(""); // yyyy-mm-dd (local)
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local calendar days -> ISO instants (start of "from" day, end of "to" day).
  const params = useMemo(() => {
    const p = new URLSearchParams({ sort });
    if (dq) p.set("q", dq);
    if (type) p.set("type", type);
    if (from) p.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) p.set("to", new Date(`${to}T23:59:59.999`).toISOString());
    return p;
  }, [dq, type, from, to, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams(params);
    qs.set("page", String(page));
    qs.set("pageSize", "20");
    try {
      setData(await apiFetch<ListResponse>(`/api/inventory/transactions?${qs}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [params, page]);

  useEffect(() => {
    load();
  }, [load]);

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const hasFilters = !!(q || type || from || to);

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Immutable history of every stock movement. Corrections are made with new adjustment records."
        actions={
          <a href={`/api/inventory/export?${params}`} download>
            <Button variant="outline">
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
          </a>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Search transactions"
              placeholder="Search product, SKU or barcode…"
              className="pl-9"
              value={q}
              onChange={(e) => resetPage(setQ)(e.target.value)}
            />
          </div>
          <Select aria-label="Filter by type" value={type} onChange={(e) => resetPage(setType)(e.target.value)} className="md:w-40">
            <option value="">All types</option>
            <option value="STOCK_IN">Stock in</option>
            <option value="STOCK_OUT">Stock out</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </Select>
          <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} className="md:w-40" />
          <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} className="md:w-40" />
          <Button variant="outline" onClick={() => resetPage(setSort)(sort === "desc" ? "asc" : "desc")} aria-label="Toggle sort order">
            <ArrowDownUp className="h-4 w-4" aria-hidden /> {sort === "desc" ? "Newest first" : "Oldest first"}
          </Button>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading && !data ? (
          <TableSkeleton cols={7} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No transactions match your filters" : "No transactions yet"}
            description={hasFilters ? "Try widening the search or date range." : "Stock movements will be listed here."}
          />
        ) : (
          data && (
            <>
              <div className={loading ? "overflow-x-auto opacity-60" : "overflow-x-auto"}>
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Date &amp; time</th>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">Barcode</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5 text-right">Before</th>
                      <th className="px-4 py-2.5 text-right">After</th>
                      <th className="px-4 py-2.5">Admin</th>
                      <th className="px-4 py-2.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.items.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/50">
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{t.productName}</p>
                          <p className="font-mono text-xs text-muted-foreground">{t.sku}</p>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{t.barcode ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <TransactionTypeBadge type={t.type} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{t.quantity}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{t.stockBefore}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{t.stockAfter}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{t.performedBy.email}</td>
                        <td className="max-w-[16rem] truncate px-4 py-2.5 text-muted-foreground" title={t.reason ?? undefined}>
                          {t.reason ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar pagination={data.pagination} onPage={setPage} />
            </>
          )
        )}
      </Card>
    </div>
  );
}
