"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader, PaginationBar } from "@/components/ui/states";
import { StockBadge } from "@/components/products/badges";
import { ProductFilterBar } from "@/components/products/ProductFilterBar";
import { useProductList, type ProductFilters } from "@/components/products/useProductList";
import { formatCurrency } from "@/lib/utils";

export default function ProductsPage() {
  const [filters, setFilters] = useState<ProductFilters>({
    q: "",
    category: "",
    status: "all",
    archived: "active",
    sort: "-updated",
    page: 1,
  });
  const { data, loading, error, reload } = useProductList(filters);
  const patch = (p: Partial<ProductFilters>) => setFilters((f) => ({ ...f, ...p }));
  const hasFilters = !!(filters.q || filters.category || filters.status !== "all" || filters.archived !== "active");

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage your catalogue, barcodes and QR labels."
        actions={
          <Link href="/admin/products/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden /> Add product
            </Button>
          </Link>
        }
      />
      <Card className="overflow-hidden">
        <ProductFilterBar filters={filters} categories={data?.categories ?? []} onChange={patch} />
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={6} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No products match your filters" : "No products yet"}
            description={hasFilters ? "Try changing or clearing the filters." : "Add your first product to get started."}
            action={
              !hasFilters && (
                <Link href="/admin/products/new">
                  <Button size="sm">Add product</Button>
                </Link>
              )
            }
          />
        ) : (
          data && (
            <>
              <div className={loading ? "overflow-x-auto opacity-60" : "overflow-x-auto"}>
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">SKU</th>
                      <th className="px-4 py-2.5">Barcode</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                      <th className="px-4 py-2.5 text-right">Stock</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.items.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5">
                          <Link href={`/admin/products/${p.id}`} className="font-medium text-primary hover:underline">
                            {p.name}
                          </Link>
                          {p.isArchived && <Badge className="ml-2">Archived</Badge>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.barcode ?? "—"}</td>
                        <td className="px-4 py-2.5">{p.category}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(p.sellingPrice)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{p.stockQuantity}</td>
                        <td className="px-4 py-2.5">
                          <StockBadge quantity={p.stockQuantity} threshold={p.lowStockThreshold} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar pagination={data.pagination} onPage={(page) => patch({ page })} />
            </>
          )
        )}
      </Card>
    </div>
  );
}
