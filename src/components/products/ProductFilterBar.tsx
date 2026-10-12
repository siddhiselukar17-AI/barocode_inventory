"use client";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import type { ProductFilters } from "@/components/products/useProductList";

export function ProductFilterBar({
  filters,
  categories,
  onChange,
  showArchived = true,
}: {
  filters: ProductFilters;
  categories: string[];
  onChange: (patch: Partial<ProductFilters>) => void;
  showArchived?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search products"
          placeholder="Search name, SKU or barcode…"
          className="pl-9"
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value, page: 1 })}
        />
      </div>
      <Select
        aria-label="Filter by category"
        className="md:w-44"
        value={filters.category}
        onChange={(e) => onChange({ category: e.target.value, page: 1 })}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by stock status"
        className="md:w-40"
        value={filters.status}
        onChange={(e) => onChange({ status: e.target.value as ProductFilters["status"], page: 1 })}
      >
        <option value="all">All stock</option>
        <option value="in">In stock</option>
        <option value="low">Low stock</option>
        <option value="out">Out of stock</option>
      </Select>
      {showArchived && (
        <Select
          aria-label="Filter archived"
          className="md:w-36"
          value={filters.archived}
          onChange={(e) => onChange({ archived: e.target.value as ProductFilters["archived"], page: 1 })}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </Select>
      )}
    </div>
  );
}
