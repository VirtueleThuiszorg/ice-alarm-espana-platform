import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LIMITS } from "@/config/constants";

// ============================================================
//  usePaginatedQuery — client-side filtering + pagination
// ============================================================

interface PaginatedQueryOptions<T> {
  items: T[];
  pageSize?: number;
  searchQuery?: string;
  searchFields?: (keyof T & string)[];
  filters?: Record<string, string | null>;
  filterFields?: Record<string, keyof T & string>;
}

interface PaginatedQueryResult<T> {
  paginatedItems: T[];
  filteredItems: T[];
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  totalFiltered: number;
}

/**
 * Generic hook for client-side filtering and pagination.
 *
 * @example
 * const { paginatedItems, page, setPage, totalPages } = usePaginatedQuery({
 *   items: tasks,
 *   searchQuery,
 *   searchFields: ["title", "description"],
 *   filters: { status: statusFilter },
 *   filterFields: { status: "status" },
 * });
 */
export function usePaginatedQuery<T>(
  options: PaginatedQueryOptions<T>,
): PaginatedQueryResult<T> {
  const {
    items,
    pageSize = LIMITS.DEFAULT_PAGE_SIZE,
    searchQuery = "",
    searchFields = [],
    filters = {},
    filterFields = {},
  } = options;

  const [page, setPage] = useState(1);

  // Reset page when search or filters change
  const prevSearchRef = useRef(searchQuery);
  const prevFiltersRef = useRef(filters);

  useEffect(() => {
    const filtersChanged =
      JSON.stringify(filters) !== JSON.stringify(prevFiltersRef.current);
    const searchChanged = searchQuery !== prevSearchRef.current;

    if (filtersChanged || searchChanged) {
      setPage(1);
      prevSearchRef.current = searchQuery;
      prevFiltersRef.current = filters;
    }
  }, [searchQuery, filters]);

  const filteredItems = useMemo(() => {
    let result = items;

    // Apply key/value filters
    for (const [filterKey, filterValue] of Object.entries(filters)) {
      if (filterValue === null || filterValue === "" || filterValue === "all") {
        continue;
      }
      const field = filterFields[filterKey];
      if (field) {
        result = result.filter(
          (item) => String(item[field]) === filterValue,
        );
      }
    }

    // Apply text search
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) =>
        searchFields.some((field) => {
          const value = item[field];
          return value != null && String(value).toLowerCase().includes(query);
        }),
      );
    }

    return result;
  }, [items, searchQuery, searchFields, filters, filterFields]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  // Clamp page to valid range when filtered results shrink
  const clampedPage = Math.min(page, totalPages);
  useEffect(() => {
    if (page !== clampedPage) {
      setPage(clampedPage);
    }
  }, [page, clampedPage]);

  const paginatedItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, clampedPage, pageSize]);

  return {
    paginatedItems,
    filteredItems,
    page: clampedPage,
    setPage,
    totalPages,
    totalFiltered: filteredItems.length,
  };
}

// ============================================================
//  useSupabaseMutation — standardised CRUD with toasts
// ============================================================

interface SupabaseMutationOptions {
  table: string;
  queryKey: string[];
  successMessage?: string;
  errorMessage?: string;
}

/**
 * Returns three pre-wired mutations (insert / update / delete) for a Supabase
 * table.  Each mutation invalidates the provided query key and fires a toast.
 *
 * @example
 * const { insertMutation, updateMutation, deleteMutation } =
 *   useSupabaseMutation<Task>({
 *     table: "tasks",
 *     queryKey: ["tasks"],
 *   });
 *
 * insertMutation.mutate({ title: "New task", status: "pending" });
 * updateMutation.mutate({ id: "abc", data: { status: "completed" } });
 * deleteMutation.mutate("abc");
 */
export function useSupabaseMutation<
  T extends Record<string, unknown> = Record<string, unknown>,
>(options: SupabaseMutationOptions) {
  const { table, queryKey } = options;
  const queryClient = useQueryClient();

  const insertMutation = useMutation({
    mutationFn: async (values: Partial<T>) => {
      const { data, error } = await (supabase as any)
        .from(table)
        .insert(values)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(options.successMessage ?? `${table} record created`);
    },
    onError: (error: Error) => {
      console.error(`Error inserting into ${table}:`, error);
      toast.error(options.errorMessage ?? `Failed to create ${table} record`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data: values,
    }: {
      id: string;
      data: Partial<T>;
    }) => {
      const { data, error } = await (supabase as any)
        .from(table)
        .update(values)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(options.successMessage ?? `${table} record updated`);
    },
    onError: (error: Error) => {
      console.error(`Error updating ${table}:`, error);
      toast.error(options.errorMessage ?? `Failed to update ${table} record`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(options.successMessage ?? `${table} record deleted`);
    },
    onError: (error: Error) => {
      console.error(`Error deleting from ${table}:`, error);
      toast.error(options.errorMessage ?? `Failed to delete ${table} record`);
    },
  });

  return { insertMutation, updateMutation, deleteMutation };
}
