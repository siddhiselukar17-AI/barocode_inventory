"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowLeft, ArchiveRestore, History, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, PageHeader } from "@/components/ui/states";
import { StockBadge } from "@/components/products/badges";
import { ProductForm } from "@/components/products/ProductForm";
import { ProductLabel } from "@/components/products/ProductLabel";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";
import type { ProductDTO } from "@/types";

export function ProductDetail({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProduct(await apiFetch<ProductDTO>(`/api/products/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    setBusy(true);
    try {
      const res = await apiFetch<{ archived: boolean; deleted: boolean }>(`/api/products/${id}`, { method: "DELETE" });
      toast.success(res.archived ? "Product archived (history kept)" : "Product deleted");
      setConfirmOpen(false);
      if (res.deleted) router.push("/admin/products");
      else await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      setProduct(await apiFetch<ProductDTO>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify({ isArchived: false }) }));
      toast.success("Product restored");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !product) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (error || !product) {
    return (
      <Card>
        <ErrorState message={error ?? "Product not found"} onRetry={load} />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to products
        </Link>
        <PageHeader
          title={product.name}
          description={`SKU ${product.sku}`}
          actions={
            <>
              <Link href={`/admin/transactions?q=${encodeURIComponent(product.sku)}`}>
                <Button variant="outline"><History className="h-4 w-4" aria-hidden /> History</Button>
              </Link>
              {!product.isArchived && (
                <Link href="/admin/scanner">
                  <Button variant="outline"><ScanBarcode className="h-4 w-4" aria-hidden /> Scanner</Button>
                </Link>
              )}
              {product.isArchived ? (
                <Button variant="outline" onClick={restore} loading={busy}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden /> Restore
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <Archive className="h-4 w-4" aria-hidden /> Archive / delete
                </Button>
              )}
            </>
          }
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <div>
            <p className="text-xs text-muted-foreground">Current stock</p>
            <p className="text-3xl font-semibold tabular-nums">{product.stockQuantity}</p>
          </div>
          <StockBadge quantity={product.stockQuantity} threshold={product.lowStockThreshold} />
          {product.isArchived && <Badge>Archived</Badge>}
          <p className="text-xs text-muted-foreground">Last updated {formatDateTime(product.updatedAt)}</p>
        </CardContent>
      </Card>

      <ProductForm mode="edit" product={product} onSaved={setProduct} />

      <Card>
        <CardHeader>
          <CardTitle>Barcode &amp; QR labels</CardTitle>
          <CardDescription>Scan these with the Scanner page or any USB scanner to test.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductLabel product={product} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        loading={busy}
        destructive
        confirmLabel="Continue"
        title="Archive or delete this product?"
        description="Products that have stock history are archived (kept for traceability, hidden from scanning). Products with no history are deleted permanently."
      />
    </div>
  );
}
