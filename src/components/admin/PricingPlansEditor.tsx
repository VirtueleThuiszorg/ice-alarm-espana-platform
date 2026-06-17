import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePricing } from "@/hooks/usePricing";
import { formatPrice } from "@/config/pricing";
import { calculateOrder, getSubscriptionMonthlyFinal, getSubscriptionFinalPrice, getPendantFinalPrice } from "../../../supabase/functions/_shared/pricing-calc";
import { configToForm, formToConfig, formToDbRows, type PricingForm } from "@/lib/pricingEditor";

/**
 * Canonical pricing editor — writes to pricing_plans + pricing_settings (the single source
 * of truth read by the public site AND the charge path). Live preview shows exactly what
 * members will see/pay from the EDITED values before saving.
 */
export function PricingPlansEditor() {
  const { config, isLoading } = usePricing();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PricingForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form && !isLoading) setForm(configToForm(config));
  }, [config, isLoading, form]);

  if (!form) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const set = (k: keyof PricingForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  const preview = formToConfig(form); // compute the "what members pay" from edited values

  const handleSave = async () => {
    setSaving(true);
    try {
      const { plans, settings } = formToDbRows(form);
      const sb = supabase as any;
      for (const p of plans) {
        const { error } = await sb.from("pricing_plans")
          .update({ monthly_net: p.monthly_net, annual_months: p.annual_months, subscription_tax_rate: p.subscription_tax_rate })
          .eq("plan_key", p.plan_key);
        if (error) throw error;
      }
      for (const s of settings) {
        const { error } = await sb.from("pricing_settings").upsert({ key: s.key, value: s.value }, { onConflict: "key" });
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["pricing-config"] });
      toast.success("Pricing updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof PricingForm, step = "0.01") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={form[key]} onChange={set(key)} />
    </div>
  );

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Canonical pricing (single source of truth)</CardTitle>
        <CardDescription>
          Edits here change the live site AND what members are charged at checkout. Net prices
          are before IVA. Tax rates are decimals (0.10 = 10%).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="font-medium mb-2 text-sm">Membership (net €/month)</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Single — monthly net", "singleMonthlyNet")}
            {field("Couple — monthly net", "coupleMonthlyNet")}
            {field("Annual months (10 = 2 free)", "annualMonths", "1")}
            {field("Subscription IVA rate", "subscriptionTaxRate", "0.01")}
          </div>
        </div>
        <div>
          <h4 className="font-medium mb-2 text-sm">One-time</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Pendant net", "pendantNet")}
            {field("Pendant IVA rate", "pendantTaxRate")}
            {field("Shipping (IVA incl.)", "shipping")}
            {field("Registration base", "registrationBase")}
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <h4 className="font-medium mb-2">What members will see / pay</h4>
          <div className="grid gap-1 sm:grid-cols-2">
            <span>Single: <b>{formatPrice(getSubscriptionMonthlyFinal(preview, "single"))}</b>/mo · {formatPrice(getSubscriptionFinalPrice(preview, "single", "annual"))}/yr</span>
            <span>Couple: <b>{formatPrice(getSubscriptionMonthlyFinal(preview, "couple"))}</b>/mo · {formatPrice(getSubscriptionFinalPrice(preview, "couple", "annual"))}/yr</span>
            <span>Pendant: <b>{formatPrice(getPendantFinalPrice(preview, 1))}</b></span>
            <span>Single + pendant + reg, total: <b>{formatPrice(calculateOrder(preview, { membershipType: "single", billingFrequency: "monthly", includePendant: true }).grandTotal)}</b></span>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save pricing
        </Button>
      </CardContent>
    </Card>
  );
}
