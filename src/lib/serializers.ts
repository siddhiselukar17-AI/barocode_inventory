import type { RowDataPacket } from "mysql2/promise";
import type { ProductDTO, Role, TransactionDTO, TransactionType } from "@/types";

export interface AdminRow extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  qr_code_value: string | null;
  category: string;
  description: string | null;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  is_archived: number;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow extends RowDataPacket {
  id: number;
  product_id: number;
  product_name_snapshot: string;
  barcode: string | null;
  sku: string;
  type: TransactionType;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reason: string | null;
  performed_by: number;
  performed_by_email: string;
  idempotency_key: string | null;
  created_at: Date;
}

export function serializeProduct(p: ProductRow): ProductDTO {
  return {
    id: String(p.id),
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    qrCodeValue: p.qr_code_value,
    category: p.category,
    description: p.description ?? "",
    sellingPrice: Number(p.selling_price),
    costPrice: Number(p.cost_price),
    stockQuantity: p.stock_quantity,
    lowStockThreshold: p.low_stock_threshold,
    imageUrl: p.image_url,
    isArchived: !!p.is_archived,
    createdAt: new Date(p.created_at).toISOString(),
    updatedAt: new Date(p.updated_at).toISOString(),
  };
}

export function serializeTransaction(t: TransactionRow): TransactionDTO {
  return {
    id: String(t.id),
    productId: String(t.product_id),
    productName: t.product_name_snapshot,
    barcode: t.barcode,
    sku: t.sku,
    type: t.type,
    quantity: t.quantity,
    stockBefore: t.stock_before,
    stockAfter: t.stock_after,
    reason: t.reason,
    performedBy: { id: String(t.performed_by), email: t.performed_by_email },
    createdAt: new Date(t.created_at).toISOString(),
  };
}
