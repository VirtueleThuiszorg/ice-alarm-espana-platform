import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanySettings {
  company_name: string;
  /**
   * NULL when `system_settings.settings_emergency_phone` is unset.
   *
   * There is deliberately NO fallback. It used to default to "+34 900 123 456", which is not a
   * number this company owns — and it was rendered as a live `tel:` link on the public site, the
   * pendant page, the member's own device page and the join confirmation. A member in trouble
   * could have dialled it. A wrong emergency number is worse than no emergency number: no number
   * sends you to look for the right one, a wrong one sends you somewhere confidently.
   *
   * Every consumer must handle null. The type is what enforces that — it is not a style choice.
   */
  emergency_phone: string | null;
  support_email: string;
  address: string;
}

/**
 * Non-safety defaults only. A wrong company name is cosmetic; a wrong emergency number is not,
 * which is why it is absent from this object rather than given a placeholder.
 */
const DEFAULT_SETTINGS = {
  company_name: "ICE Alarm España",
  support_email: "info@icealarm.es",
  address: "Calle Principal 1, Albox, 04800 Almería",
} as const;

/** Shared by the hook and by App.tsx's prefetch, so the two cannot drift apart. */
export const COMPANY_SETTINGS_KEYS = [
  "settings_company_name",
  "settings_emergency_phone",
  "settings_support_email",
  "settings_address",
] as const;

export async function fetchCompanySettings(): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", [...COMPANY_SETTINGS_KEYS]);

  if (error) throw error;

  const settingsMap = (data || []).reduce((acc, setting) => {
    const normalizedKey = setting.key.replace(/^settings_/, "");
    acc[normalizedKey] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  const phone = settingsMap.emergency_phone?.trim();
  if (!phone) {
    // Loud, not silent. If this appears in the console the 24-hour number is missing from
    // every surface that offers it, and somebody needs to set it.
    console.warn(
      "[companySettings] system_settings.settings_emergency_phone is not set — no phone number " +
        "will be shown anywhere. Set it in Admin -> Settings.",
    );
  }

  return {
    company_name: settingsMap.company_name || DEFAULT_SETTINGS.company_name,
    emergency_phone: phone || null,
    support_email: settingsMap.support_email || DEFAULT_SETTINGS.support_email,
    address: settingsMap.address || DEFAULT_SETTINGS.address,
  };
}

export function useCompanySettings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
    gcTime: 60 * 60 * 1000, // Keep in garbage collection for 1 hour
  });

  return {
    // While loading or on error, emergency_phone is null — so a surface renders no number at
    // all rather than a stale or invented one during the gap.
    settings: data ?? { ...DEFAULT_SETTINGS, emergency_phone: null },
    isLoading,
    error,
  };
}
