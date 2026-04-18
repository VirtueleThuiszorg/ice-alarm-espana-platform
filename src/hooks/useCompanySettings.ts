import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CompanySettings {
  company_name: string;
  emergency_phone: string;
  support_email: string;
  address: string;
}

const DEFAULT_SETTINGS: CompanySettings = {
  company_name: "ICE Alarm España",
  emergency_phone: "+34 900 123 456",
  support_email: "info@icealarm.es",
  address: "Calle Principal 1, Albox, 04800 Almería"
};

export function useCompanySettings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["settings_company_name", "settings_emergency_phone", "settings_support_email", "settings_address"]);
      
      if (error) throw error;
      
      const settingsMap = (data || []).reduce((acc, setting) => {
        // Strip the 'settings_' prefix to normalize keys
        const normalizedKey = setting.key.replace(/^settings_/, '');
        acc[normalizedKey] = setting.value;
        return acc;
      }, {} as Record<string, string>);
      
      return {
        company_name: settingsMap.company_name || DEFAULT_SETTINGS.company_name,
        emergency_phone: settingsMap.emergency_phone || DEFAULT_SETTINGS.emergency_phone,
        support_email: settingsMap.support_email || DEFAULT_SETTINGS.support_email,
        address: settingsMap.address || DEFAULT_SETTINGS.address
      } as CompanySettings;
    },
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
    gcTime: 60 * 60 * 1000, // Keep in garbage collection for 1 hour
  });

  return {
    settings: data || DEFAULT_SETTINGS,
    isLoading,
    error
  };
}
