"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { apiFetch, ClientApiError, errorMessage } from "@/lib/client-api";
import {
  productBaseSchema,
  productCreateSchema,
  type ProductCreateInput,
} from "@/lib/validations/product";
import type { ProductDTO } from "@/types";

interface Props {
  mode: "create" | "edit";
  product?: ProductDTO;
  defaultBarcode?: string;
  onSaved?: (p: ProductDTO) => void;
}

export function ProductForm({ mode, product, defaultBarcode, onSaved }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductCreateInput>({
    resolver: zodResolver(mode === "create" ? productCreateSchema : productBaseSchema) as never,
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      barcode: product?.barcode ?? defaultBarcode ?? "",
      qrCodeValue: product?.qrCodeValue ?? "",
      category: product?.category ?? "",
      description: product?.description ?? "",
      sellingPrice: product?.sellingPrice ?? 0,
      costPrice: product?.costPrice ?? 0,
      lowStockThreshold: product?.lowStockThreshold ?? 5,
      imageUrl: product?.imageUrl ?? "",
      initialStock: 0,
    },
  });

  async function onSubmit(values: ProductCreateInput) {
    try {
      if (mode === "create") {
        const created = await apiFetch<ProductDTO>("/api/products", { method: "POST", body: JSON.stringify(values) });
        toast.success("Product created");
        router.push(`/admin/products/${created.id}`);
      } else {
        // Stock can never be edited here; the API rejects stockQuantity outright.
        const { initialStock: _ignored, ...rest } = values;
        void _ignored;
        const updated = await apiFetch<ProductDTO>(`/api/products/${product!.id}`, {
          method: "PATCH",
          body: JSON.stringify(rest),
        });
        toast.success("Product updated");
        onSaved?.(updated);
      }
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "DUPLICATE") {
        const field = /sku/i.test(e.message) ? "sku" : /barcode/i.test(e.message) ? "barcode" : null;
        if (field) setError(field, { message: e.message });
      }
      toast.error(errorMessage(e));
    }
  }

  const num = { valueAsNumber: true } as const;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
            <FieldError message={errors.name?.message} />
          </div>
          <div>
            <Label htmlFor="sku">SKU *</Label>
            <Input id="sku" className="font-mono uppercase" aria-invalid={!!errors.sku} {...register("sku")} />
            <FieldError message={errors.sku?.message} />
          </div>
          <div>
            <Label htmlFor="barcode">Barcode</Label>
            <Input id="barcode" className="font-mono" placeholder="EAN-13, UPC, Code 128…" aria-invalid={!!errors.barcode} {...register("barcode")} />
            <FieldError message={errors.barcode?.message} />
          </div>
          <div>
            <Label htmlFor="qrCodeValue">QR code value</Label>
            <Input id="qrCodeValue" className="font-mono" placeholder="Optional. Defaults to barcode / SKU on labels" {...register("qrCodeValue")} />
            <FieldError message={errors.qrCodeValue?.message} />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" placeholder="Uncategorized" {...register("category")} />
            <FieldError message={errors.category?.message} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} />
            <FieldError message={errors.description?.message} />
          </div>
          <div>
            <Label htmlFor="sellingPrice">Selling price</Label>
            <Input id="sellingPrice" type="number" step="0.01" min="0" aria-invalid={!!errors.sellingPrice} {...register("sellingPrice", num)} />
            <FieldError message={errors.sellingPrice?.message} />
          </div>
          <div>
            <Label htmlFor="costPrice">Cost price</Label>
            <Input id="costPrice" type="number" step="0.01" min="0" aria-invalid={!!errors.costPrice} {...register("costPrice", num)} />
            <FieldError message={errors.costPrice?.message} />
          </div>
          {mode === "create" ? (
            <div>
              <Label htmlFor="initialStock">Initial stock quantity</Label>
              <Input id="initialStock" type="number" step="1" min="0" aria-invalid={!!errors.initialStock} {...register("initialStock", num)} />
              <p className="mt-1 text-xs text-muted-foreground">Recorded as a Stock In transaction.</p>
              <FieldError message={errors.initialStock?.message} />
            </div>
          ) : (
            <div>
              <Label>Current stock</Label>
              <Input value={product?.stockQuantity ?? 0} disabled readOnly />
              <p className="mt-1 text-xs text-muted-foreground">Change stock via Scanner, Stock In/Out or an Adjustment.</p>
            </div>
          )}
          <div>
            <Label htmlFor="lowStockThreshold">Low-stock threshold</Label>
            <Input id="lowStockThreshold" type="number" step="1" min="0" aria-invalid={!!errors.lowStockThreshold} {...register("lowStockThreshold", num)} />
            <FieldError message={errors.lowStockThreshold?.message} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="imageUrl">Product image URL</Label>
            <Input id="imageUrl" type="url" placeholder="https://…" aria-invalid={!!errors.imageUrl} {...register("imageUrl")} />
            <FieldError message={errors.imageUrl?.message} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            {mode === "create" && (
              <Button variant="outline" onClick={() => router.push("/admin/products")} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button type="submit" loading={isSubmitting}>
              {mode === "create" ? "Create product" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
