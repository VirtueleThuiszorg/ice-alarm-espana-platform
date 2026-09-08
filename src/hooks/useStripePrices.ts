import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import { functionError } from "@/lib/functionError";
import type { PricingConfig } from "../../supabase/functions/_shared/pricing-calc";
import {
  desiredPrices,
  planSync,
  type ExistingPrice,
  type PlannedChange,
} from "../../supabase/functions/_shared/stripe-price-sync";

/**
 * Is what Stripe holds still what `pricing_plans` / `pricing_settings` say?
 *
 * Imports the SAME module the edge function uses, so the admin screen and the sync agree by
 * construction. A screen with its own idea of "in sync" is how you end up believing a price is
 * live when Stripe was never told about it.
 *
 * `stripe_prices` is staff-readable and not public (20260908120100), so this runs on the admin
 * screens only. A member or an anonymous visitor gets nothing from it, by policy.
 */

// pricing_plans / pricing_settings / stripe_prices are not in the generated Supabase types yet,
// so the table is reached through a narrow structural shim rather than `any`.
interface StripePricesClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => Promise<{ data: ExistingPrice[] | null; error: { message: string } | null }>;
    };
  };
}

export interface StripeSyncState {
  /** The current rows, one per synced price key. */
  rows: ExistingPrice[];
  /** Per-key plan: create / reprice / unchanged, with a reason. */
  changes: PlannedChange[];
  /** True when all seven keys match the tables. */
  inSync: boolean;
  /** True when nothing has ever been synced — checkout has no price to charge against. */
  neverSynced: boolean;
  isLoading: boolean;
  error: Error | null;
}

export function useStripePriceSyncState(config: PricingConfig | null): StripeSyncState {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stripe-prices"],
    queryFn: async () => {
      const sb = supabase as unknown as StripePricesClient;
      const { data, error } = await sb
        .from("stripe_prices")
        .select("price_key, stripe_product_id, stripe_price_id, amount_cents, recurring_interval")
        .eq("is_current", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: STALE_TIMES.SHORT,
  });

  const rows = data ?? [];
  const changes = config ? planSync(desiredPrices(config), rows) : [];

  return {
    rows,
    changes,
    // An empty table is NOT "in sync" — with no config loaded yet we say nothing either way.
    inSync: Boolean(config) && rows.length > 0 && changes.every((c) => c.action === "unchanged"),
    neverSynced: !isLoading && rows.length === 0,
    isLoading,
    error: (error as Error) ?? null,
  };
}

export interface SyncPricesResponse {
  success?: boolean;
  created?: string[];
  repriced?: string[];
  unchanged?: string[];
  error?: string;
}

export function useSyncPricesToStripe() {
  const queryClient = useQueryClient();

  return useMutation<SyncPricesResponse, Error>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<SyncPricesResponse>(
        "stripe-sync-prices",
        { body: {} },
      );
      // `functions.invoke` reports every non-2xx as "Edge Function returned a non-2xx status
      // code" and leaves the real reason unread on the response — and the reasons here are ones
      // the admin needs ("super admin access required", "Stripe is not configured",
      // "Pricing not configured: missing 'couple' plan").
      if (error) throw await functionError(error, "Could not sync prices to Stripe");
      // A 200 can still carry an `error` field, so it is checked rather than read as success.
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error("The sync returned no result");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stripe-prices"] });
    },
  });
}
