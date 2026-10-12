"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { useDebounce } from "@/lib/hooks";
import type { Pagination, ProductDTO } from "@/types";

export interface ProductFilters {
  q: string;
  category: string;
  status: "all" | "in" | "low" | "out";
  archived: "active" | "archived" | "all";
  sort: string;
  page: number;
}

interface ListResponse {
  items: ProductDTO[];
  categories: string[];
  pagination: Pagination;
}

export function useProductList(filters: ProductFilters, pageSize = 20) {
  const debouncedQ = useDebounce(filters.q);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      page: String(filters.page),
      pageSize: String(pageSize),
      status: filters.status,
      archived: filters.archived,
      sort: filters.sort,
    });
    if (debouncedQ) qs.set("q", debouncedQ);
    if (filters.category) qs.set("category", filters.category);
    try {
      setData(await apiFetch<ListResponse>(`/api/products?${qs}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, filters.category, filters.status, filters.archived, filters.sort, filters.page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
