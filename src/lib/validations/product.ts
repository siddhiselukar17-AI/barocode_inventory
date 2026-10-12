import { z } from "zod";
import { normalizeCode, normalizeSku } from "@/lib/utils";

const isHttpUrlOrEmpty = (v: string) => v === "" || /^https?:\/\/\S+$/i.test(v);

export const productBaseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(64)
    .regex(/^[A-Za-z0-9._\-/]+$/, "SKU may only contain letters, numbers and . _ - /"),
  barcode: z.string().trim().max(128), // empty string = no barcode
  qrCodeValue: z.string().trim().max(512),
  category: z.string().trim().max(100),
  description: z.string().trim().max(2000),
  sellingPrice: z.number({ error: "Selling price is required" }).min(0).max(1_000_000_000),
  costPrice: z.number({ error: "Cost price is required" }).min(0).max(1_000_000_000),
  lowStockThreshold: z.number({ error: "Threshold is required" }).int().min(0).max(1_000_000),
  imageUrl: z.string().trim().max(2048).refine(isHttpUrlOrEmpty, "Image URL must start with http:// or https://"),
});

// Note: stockQuantity is deliberately NOT accepted on update (strict() rejects it).
export const productCreateSchema = productBaseSchema
  .extend({
    initialStock: z.number({ error: "Initial stock is required" }).int().min(0).max(1_000_000),
  })
  .strict();

export const productUpdateSchema = productBaseSchema
  .partial()
  .extend({ isArchived: z.boolean().optional() })
  .strict();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/**
 * Converts validated input to DB column values. Only fields present in `input` are returned;
 * optional text fields that are empty become NULL.
 */
export function normalizeProductFields(input: Partial<z.infer<typeof productBaseSchema>> & { isArchived?: boolean }) {
  const cols: Record<string, unknown> = {};
  if (input.name !== undefined) cols.name = input.name;
  if (input.sku !== undefined) cols.sku = normalizeSku(input.sku);
  if (input.sellingPrice !== undefined) cols.selling_price = input.sellingPrice;
  if (input.costPrice !== undefined) cols.cost_price = input.costPrice;
  if (input.lowStockThreshold !== undefined) cols.low_stock_threshold = input.lowStockThreshold;
  if (input.description !== undefined) cols.description = input.description;
  if (input.isArchived !== undefined) cols.is_archived = input.isArchived ? 1 : 0;
  if (input.category !== undefined) cols.category = input.category.trim() || "Uncategorized";
  if (input.barcode !== undefined) cols.barcode = normalizeCode(input.barcode) ?? null;
  if (input.qrCodeValue !== undefined) cols.qr_code_value = normalizeCode(input.qrCodeValue) ?? null;
  if (input.imageUrl !== undefined) cols.image_url = normalizeCode(input.imageUrl) ?? null;
  return cols;
}

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  status: z.enum(["all", "in", "low", "out"]).default("all"),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  sort: z
    .enum(["name", "-name", "stock", "-stock", "updated", "-updated"])
    .default("-updated"),
});
