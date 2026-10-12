"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader, PaginationBar } from "@/components/ui/states";
import { StockBadge } from "@/components/products/badges";
import { ProductFilterBar } from "@/components/products/ProductFilterBar";
import { useProductList, type ProductFilters } from "@/components/products/useProductList";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";
import type { InventoryChangeResult, ProductDTO } from "@/types";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InventoryClient({ initialStatus }: { initialStatus: ProductFilters["status"] }) {
  const [filters, setFilters] = useState<ProductFilters>({
    q: "",
    category: "",
    status: initialStatus,
    archived: "active",
    sort: "name",
    page: 1,
  });
  const { data, loading, error, reload } = useProductList(filters);
  const patch = (p: Partial<ProductFilters>) => setFilters((f) => ({ ...f, ...p }));
  const [adjusting, setAdjusting] = useState<ProductDTO | null>(null);

  return (
    <div>
      <PageHeader title="Inventory" description="Current stock levels. Use Adjust to correct counts with an audited reason." />
      <Card className="overflow-hidden">
        <ProductFilterBar filters={filters} categories={data?.categories ?? []} onChange={patch} showArchived={false} />
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={7} />
        ) : data && data.items.length === 0 ? (
          <EmptyState title="No inventory to show" description="No products match the current filters." />
        ) : (
          data && (
            <>
              <div className={loading ? "overflow-x-auto opacity-60" : "overflow-x-auto"}>
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">SKU</th>
                      <th className="px-4 py-2.5">Barcode</th>
                      <th className="px-4 py-2.5 text-right">Quantity</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Low-stock at</th>
                      <th className="px-4 py-2.5">Last updated</th>
                      <th className="px-4 py-2.5 text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.items.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5">
                          <Link href={`/admin/products/${p.id}`} className="font-medium text-primary hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.barcode ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{p.stockQuantity}</td>
                        <td className="px-4 py-2.5">
                          <StockBadge quantity={p.stockQuantity} threshold={p.lowStockThreshold} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.lowStockThreshold}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(p.updatedAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button size="sm" variant="outline" onClick={() => setAdjusting(p)}>
                            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Adjust
                          </Button>
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

      <AdjustDialog
        product={adjusting}
        onClose={() => setAdjusting(null)}
        onDone={() => {
          setAdjusting(null);
          reload();
        }}
      />
    </div>
  );
}

function AdjustDialog({ product, onClose, onDone }: { product: ProductDTO | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"SET" | "DELTA">("SET");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(newKey());
  const lastProduct = useRef<string | null>(null);

  // Fresh form + fresh idempotency key each time a different product is opened.
  if (product && lastProduct.current !== product.id) {
    lastProduct.current = product.id;
    keyRef.current = newKey();
    setMode("SET");
    setValue(String(product.stockQuantity));
    setReason("");
  }
  if (!product && lastProduct.current) lastProduct.current = null;

  const n = Number(value);
  const validInt = value.trim() !== "" && /^-?\d+$/.test(value.trim());
  let error: string | undefined;
  let after: number | null = null;
  if (product) {
    if (!validInt) error = "Enter a whole number";
    else if (mode === "SET" && n < 0) error = "Stock cannot be negative";
    else {
      after = mode === "SET" ? n : product.stockQuantity + n;
      if (after < 0) error = `Would make stock negative (${after})`;
      else if (after === product.stockQuantity) error = "This does not change the stock";
    }
  }
  const reasonError = reason.trim().length < 3 ? "A reason (min 3 characters) is required" : undefined;

  async function submit() {
    if (!product || error || reasonError) return;
    setBusy(true);
    try {
      const res = await apiFetch<InventoryChangeResult>("/api/inventory/adjustment", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, mode, value: n, reason: reason.trim(), idempotencyKey: keyRef.current }),
      });
      toast.success(`Adjusted. New stock: ${res.product.stockQuantity}`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!product}
      onClose={() => !busy && onClose()}
      title="Adjust stock"
      description={product ? `${product.name} (${product.sku}) · current stock ${product.stockQuantity}` : undefined}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <Label htmlFor="adj-mode">Adjustment type</Label>
          <Select
            id="adj-mode"
            value={mode}
            onChange={(e) => {
              const m = e.target.value as "SET" | "DELTA";
              setMode(m);
              setValue(m === "SET" ? String(product?.stockQuantity ?? 0) : "");
            }}
          >
            <option value="SET">Set verified stock count</option>
            <option value="DELTA">Add / remove a quantity (+/−)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="adj-value">{mode === "SET" ? "New verified quantity" : "Change (e.g. -3 or 5)"}</Label>
          <Input id="adj-value" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
          <FieldError message={error} />
        </div>
        <div>
          <Label htmlFor="adj-reason">Reason (required)</Label>
          <Input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Cycle count correction" />
          {reason.length > 0 && <FieldError message={reasonError} />}
        </div>
        {after !== null && !error && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {product?.stockQuantity} → <strong>{after}</strong>
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!!error || !!reasonError}>
            Record adjustment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
