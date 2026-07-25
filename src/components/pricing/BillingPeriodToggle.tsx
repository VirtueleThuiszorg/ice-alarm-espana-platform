import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { BillingFrequency } from "@/config/pricing";

interface BillingPeriodToggleProps {
  value: BillingFrequency;
  onChange: (value: BillingFrequency) => void;
  /** Optional "save €X" hint rendered next to the annual option. */
  savingsLabel?: string;
  className?: string;
}

// The selected period must be obvious from colour AND weight, not a near-white fill on a
// near-white page — the state is the whole point of the control.
const ITEM_CLASS =
  "rounded-full px-6 text-sm font-medium text-muted-foreground data-[state=on]:bg-primary " +
  "data-[state=on]:text-primary-foreground data-[state=on]:font-semibold data-[state=on]:shadow-sm";

/**
 * Monthly / annual switch shared by every public pricing surface, so the period the member
 * sees is the period their "Get Started" link carries into the wizard (see lib/joinLink).
 */
export function BillingPeriodToggle({ value, onChange, savingsLabel, className }: BillingPeriodToggleProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <ToggleGroup
        type="single"
        value={value}
        // Radix allows de-selecting the active item; a billing period is never "none".
        onValueChange={(next) => {
          if (next === "monthly" || next === "annual") onChange(next);
        }}
        aria-label={t("pricing.billingPeriod", "Billing period")}
        className="rounded-full border bg-muted/40 p-1"
      >
        <ToggleGroupItem value="monthly" className={ITEM_CLASS}>
          {t("pricing.monthly", "Monthly")}
        </ToggleGroupItem>
        <ToggleGroupItem value="annual" className={ITEM_CLASS}>
          {t("pricing.annual", "Annual")}
        </ToggleGroupItem>
      </ToggleGroup>
      {savingsLabel && <p className="text-sm text-alert-resolved font-medium">{savingsLabel}</p>}
    </div>
  );
}
