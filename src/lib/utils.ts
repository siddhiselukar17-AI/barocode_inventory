import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { StockStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** SKUs are case-insensitive identifiers: stored trimmed + upper-case. */
export function normalizeSku(value: string) {
  return value.trim().toUpperCase();
}

/** Barcodes / QR values are stored trimmed (case preserved). Empty -> undefined. */
export function normalizeCode(value?: string | null) {
  const v = (value ?? "").trim();
  return v === "" ? undefined : v;
}

export function getStockStatus(qty: number, threshold: number): StockStatus {
  if (qty <= 0) return "OUT";
  if (qty <= threshold) return "LOW";
  return "IN_STOCK";
}

export function formatDateTime(iso: string | Date) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}
