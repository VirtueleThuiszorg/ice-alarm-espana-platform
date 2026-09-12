import { useCallback, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ROUTE_MODULES } from "@/lib/routeModules.generated";
import { ROUTE_DATA } from "@/lib/routeData";

/**
 * START THE WORK ON HOVER, so the click has nothing left to wait for.
 *
 * Every page in this app is lazy. Clicking a sidebar link therefore begins a
 * round trip for the route's JavaScript, and only once that lands does the page
 * mount and begin its queries — two serial waits the person watches through a
 * `<PageLoader />`. On the mobile profile that is most of the cold transition
 * time in docs/perf/AFTER.md.
 *
 * A pointer arrives at a link a few hundred milliseconds before the click does,
 * and a keyboard focus usually longer. That is enough to have both the chunk and
 * the first screen of data in hand by the time the navigation happens.
 *
 * ── WHY HOVER **AND** FOCUS **AND** TOUCHSTART ──────────────────────────────
 *
 * `mouseenter` covers the mouse. `focus` covers the keyboard, and leaving it out
 * would make this an optimisation that only helps people who can use a pointer.
 * `touchstart` covers the phone, where there is no hover at all — the gap
 * between finger-down and the click event is around 100 ms, which is small but
 * is the only warning a touch device gives.
 *
 * ── WHY IT IS SAFE TO FIRE ON EVERY HOVER ───────────────────────────────────
 *
 * A dynamic `import()` of an already-loaded module is a resolved promise and
 * costs nothing, so the browser deduplicates repeat chunk requests for free.
 * React Query's `prefetchQuery` is the one that needs care: it respects
 * `staleTime`, so a warm entry is a no-op, but a cold one would fire on every
 * pass of the mouse. `seen` holds the paths already warmed for the life of the
 * component, which turns a row of links skimmed by a moving pointer into one
 * request each rather than one per mouse event.
 */
export interface PrefetchHandlers {
  onMouseEnter: () => void;
  onFocus: () => void;
  onTouchStart: () => void;
}

export function prefetchRoute(path: string, queryClient: QueryClient): void {
  const loadModule = ROUTE_MODULES[path];
  // Not every path is prefetchable — parameterised routes are absent by design,
  // and an unknown path is a no-op rather than a throw. A nav item pointing
  // somewhere that does not exist is a routing bug; it is not this hook's to
  // report, and crashing a hover handler over it would be worse.
  if (loadModule) void loadModule().catch(() => {});

  const loadData = ROUTE_DATA[path];
  if (loadData) loadData(queryClient);
}

export function usePrefetchRoute(): (path: string) => PrefetchHandlers {
  const queryClient = useQueryClient();
  const seen = useRef<Set<string>>(new Set());

  return useCallback(
    (path: string): PrefetchHandlers => {
      const run = () => {
        if (seen.current.has(path)) return;
        seen.current.add(path);
        prefetchRoute(path, queryClient);
      };
      return { onMouseEnter: run, onFocus: run, onTouchStart: run };
    },
    [queryClient],
  );
}
