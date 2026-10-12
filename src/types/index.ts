export type Role = "ADMIN" | "STAFF";
export type TransactionType = "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
export type StockStatus = "IN_STOCK" | "LOW" | "OUT";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export interface ProductDTO {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  qrCodeValue: string | null;
  category: string;
  description: string;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionDTO {
  id: string;
  productId: string;
  productName: string;
  barcode: string | null;
  sku: string;
  type: TransactionType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string | null;
  performedBy: { id: string; email: string };
  createdAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}
export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface InventoryChangeResult {
  transaction: TransactionDTO;
  product: Pick<ProductDTO, "id" | "name" | "sku" | "barcode" | "stockQuantity">;
  replayed: boolean;
}
