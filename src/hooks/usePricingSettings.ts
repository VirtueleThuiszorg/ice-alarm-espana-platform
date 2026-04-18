import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRICING } from "@/config/pricing";
import { STALE_TIMES } from "@/config/constants";

type PaymentGateway = "stripe" | "mollie";

interface PricingSettings {
  registrationFeeEnabled: boolean;
  registrationFeeDiscount: number; // 0-100
  registrationFeeBase: number;
  registrationFeeFinal: number;
  testModeEnabled: boolean;
  activeGateway: PaymentGateway;
  isLoading: boolean;
}

export function usePricingSettings(): PricingSettings {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["pricing-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["registration_fee_enabled", "registration_fee_discount", "registration_test_mode_enabled", "settings_active_payment_gateway"]);

      if (error) throw error;

      const settingsMap = (data || []).reduce((acc, s) => {
        acc[s.key] = s.value;
        return acc;
      }, {} as Record<string, string>);

      return {
        registrationFeeEnabled: settingsMap.registration_fee_enabled !== "false",
        registrationFeeDiscount: parseFloat(settingsMap.registration_fee_discount || "0"),
        testModeEnabled: settingsMap.registration_test_mode_enabled === "true",
        activeGateway: (settingsMap.settings_active_payment_gateway as PaymentGateway) || "stripe",
      };
    },
    staleTime: STALE_TIMES.VERY_LONG,
  });

  const registrationFeeEnabled = settings?.registrationFeeEnabled ?? true;
  const registrationFeeDiscount = settings?.registrationFeeDiscount ?? 0;
  const testModeEnabled = settings?.testModeEnabled ?? false;
  const activeGateway = settings?.activeGateway ?? "stripe";
  const registrationFeeBase = PRICING.registration.amount;

  // Calculate final fee
  let registrationFeeFinal = 0;
  if (registrationFeeEnabled) {
    registrationFeeFinal = registrationFeeBase * (1 - registrationFeeDiscount / 100);
  }

  return {
    registrationFeeEnabled,
    registrationFeeDiscount,
    registrationFeeBase,
    registrationFeeFinal,
    testModeEnabled,
    activeGateway,
    isLoading,
  };
}

// Helper function to format registration fee display
export function formatRegistrationFeeDisplay(
  enabled: boolean,
  discount: number,
  baseAmount: number,
  finalAmount: number,
  t: (key: string) => string
): { display: string; showStrikethrough: boolean; originalPrice: string; isFree: boolean } {
  if (!enabled) {
    return {
      display: "",
      showStrikethrough: false,
      originalPrice: "",
      isFree: false,
    };
  }

  if (discount === 100) {
    return {
      display: t("common.free") || "FREE",
      showStrikethrough: true,
      originalPrice: `€${baseAmount.toFixed(2)}`,
      isFree: true,
    };
  }

  if (discount > 0) {
    return {
      display: `€${finalAmount.toFixed(2)}`,
      showStrikethrough: true,
      originalPrice: `€${baseAmount.toFixed(2)}`,
      isFree: false,
    };
  }

  return {
    display: `€${baseAmount.toFixed(2)}`,
    showStrikethrough: false,
    originalPrice: "",
    isFree: false,
  };
}
