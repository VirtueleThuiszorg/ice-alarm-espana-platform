import type { QueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/config/constants";

/**
 * THE DATA HALF OF `usePrefetchRoute` — what to fetch when somebody hovers a
 * link, alongside the route's chunk.
 *
 * ── WHY THIS IS A SHORT LIST, AND WHAT DECIDES ──────────────────────────────
 *
 * A prefetch is only useful if it lands in the cache entry the page will
 * actually read. React Query keys on the whole `queryKey`, so a page whose key
 * carries its filter state —
 *
 *     queryKey: ["admin-members", searchQuery, statusFilter, planFilter, page]
 *
 * — can only be prefetched by reproducing every default that page starts with.
 * That is the page's internals copied into a second place, and the first time a
 * default changed the prefetch would warm an entry nobody reads: a request
 * spent, nothing saved, and no way to see it had happened.
 *
 * So only PARAMETER-FREE queries appear here, and each one is imported from the
 * hook that owns it rather than restated. Everything else gets its chunk warmed
 * — which is the larger of the two waits anyway, because the page cannot even
 * begin its query until its JavaScript has arrived.
 *
 * Adding a route here means exporting its query options from the hook, the way
 * `productsQuery` is exported from useProducts. It should never mean writing a
 * queryKey down a second time.
 *
 * The tiers come from `STALE_TIMES` in src/config/constants.ts, which this repo
 * already had — a prefetch that used its own numbers would drift from the tier
 * the page itself asks for, and warm an entry the page then considers stale.
 *
 * ── WHY THE IMPORTS ARE DYNAMIC ─────────────────────────────────────────────
 *
 * This module is reached from every sidebar, so a STATIC `import { productsQuery }
 * from "@/hooks/useProducts"` would pull the products fetcher into the chunk
 * every layout loads — spending bytes on every page to save a request on one.
 * It also made `table:products` read as reachable from 77 routes in
 * WIRING_REGISTER.md instead of the one page that actually edits it, which is
 * the register losing the thing it exists to say.
 *
 * A dynamic import inside the handler costs nothing until somebody hovers.
 */
export const ROUTE_DATA: Record<string, (queryClient: QueryClient) => void> = {
  "/admin/products": (queryClient) => {
    void import("@/hooks/useProducts").then(({ productsQuery }) => {
      void queryClient.prefetchQuery({ ...productsQuery, staleTime: STALE_TIMES.VERY_LONG });
    });
  },
};
