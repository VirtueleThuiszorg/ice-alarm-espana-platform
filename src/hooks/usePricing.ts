import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import {
  DEFAULT_PRICING_CONFIG,
  buildPricingConfig,
  setPricingConfig,
  type PricingConfig,
} from "@/config/pricing";

/**
 * Fetches the canonical pricing from the DB (pricing_plans + pricing_settings), builds the
 * PricingConfig, and hydrates the module-level active config so all pricing helpers reflect
 * admin-edited prices. Falls back to DEFAULT_PRICING_CONFIG (== seed) on error/empty so the
 * UI never renders blank prices. Returns the config for reactive consumers.
 */
export function usePricing() {
  const query = useQuery({
    queryKey: ["pricing-config"],
    staleTime: STALE_TIMES?.MEDIUM ?? 5 * 60 * 1000,
    queryFn: async (): Promise<PricingConfig> => {
      // New tables aren't in generated types yet → cast.
      const sb = supabase as unknown as {
        from: (t: string) => { select: (c: string) => Promise<{ data: unknown; error: unknown }> };
      };
      const [plansRes, settingsRes] = await Promise.all([
        sb.from("pricing_plans").select("plan_key, monthly_net, annual_months, subscription_tax_rate, is_active"),
        sb.from("pricing_settings").select("key, value"),
      ]);
      const plans = (plansRes.data as any[] | null) ?? [];
      const settings = (settingsRes.data as any[] | null) ?? [];
      if (plansRes.error || settingsRes.error || plans.length === 0) {
        return DEFAULT_PRICING_CONFIG;
      }
      const activePlans = plans.filter((p) => p.is_active !== false);
      const config = buildPricingConfig(activePlans, settings);
      setPricingConfig(config); // hydrate module config for the non-hook helpers
      return config;
    },
  });

  return {
    config: query.data ?? DEFAULT_PRICING_CONFIG,
    isLoading: query.isLoading,
    error: query.error,
  };
}
