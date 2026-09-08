import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CloudUpload, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePricing } from "@/hooks/usePricing";
import { formatPrice } from "@/config/pricing";
import { calculateOrder, getSubscriptionMonthlyFinal, getSubscriptionFinalPrice, getPendantFinalPrice } from "../../../supabase/functions/_shared/pricing-calc";
import { configToForm, formToConfig, formToDbRows, type PricingForm } from "@/lib/pricingEditor";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useStripePriceSyncState, useSyncPricesToStripe } from "@/hooks/useStripePrices";

/**
 * Canonical pricing editor — writes to pricing_plans + pricing_settings (the single source
 * of truth read by the public site AND the charge path). Live preview shows exactly what
 * members will see/pay from the EDITED values before saving.
 */

// pricing_plans / pricing_settings are not present in the generated Supabase types yet,
// so we access them through a narrow structural shim instead of `any`.
type PricingQueryResult = Promise<{ error: { message: string } | null }>;
interface PricingTableClient {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: unknown) => PricingQueryResult };
    upsert: (values: Record<string, unknown>, options: { onConflict: string }) => PricingQueryResult;
  };
}

export function PricingPlansEditor() {
  const { config, isLoading } = usePricing();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PricingForm | null>(null);
  const [saving, setSaving] = useState(false);

  // Editing these tables changes what the public pages SHOW. It does not change what Stripe
  // CHARGES until the prices are synced, because a Stripe Price is an object with its own
  // amount. That gap is the whole reason this panel exists rather than the save button quietly
  // implying both happened.
  const { data: staff } = useCurrentStaff();
  const sync = useStripePriceSyncState(isLoading ? null : config);
  const syncMutation = useSyncPricesToStripe();
  const isSuperAdmin = staff?.role === "super_admin";

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
      const sb = supabase as unknown as PricingTableClient;
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

        {/* What Stripe actually charges, and whether it still matches the above */}
        <div className="rounded-lg border p-4 text-sm space-y-3">
          <div className="flex items-start gap-2">
            {sync.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mt-0.5 text-muted-foreground" />
            ) : sync.inSync ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
            )}
            <div className="space-y-1">
              <h4 className="font-medium">Stripe prices</h4>
              {sync.isLoading ? (
                <p className="text-muted-foreground">Checking what Stripe holds…</p>
              ) : sync.error ? (
                <p className="text-destructive">Could not read the synced prices: {sync.error.message}</p>
              ) : sync.neverSynced ? (
                <p className="text-amber-700">
                  Never synced. Checkout has no Stripe price to charge against, so a customer
                  cannot pay until these are pushed to Stripe.
                </p>
              ) : sync.inSync ? (
                <p className="text-muted-foreground">
                  All {sync.rows.length} prices in Stripe match the values above.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-amber-700">
                    {sync.changes.filter((c) => c.action !== "unchanged").length} price(s) in Stripe
                    no longer match the values above. Customers are charged what STRIPE holds, not
                    what this page shows, until you sync.
                  </p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {sync.changes
                      .filter((c) => c.action !== "unchanged")
                      .map((c) => (
                        <li key={c.desired.priceKey}>
                          <span className="font-mono">{c.desired.priceKey}</span> — {c.reason}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {syncMutation.data && (
            <p className="text-xs text-muted-foreground">
              Last sync: {syncMutation.data.created?.length ?? 0} created,{" "}
              {syncMutation.data.repriced?.length ?? 0} repriced,{" "}
              {syncMutation.data.unchanged?.length ?? 0} already in sync.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                syncMutation.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(
                      `Stripe prices synced — ${r.created?.length ?? 0} created, ` +
                        `${r.repriced?.length ?? 0} repriced`,
                    ),
                  onError: (e) => toast.error(e.message),
                });
              }}
              disabled={!isSuperAdmin || syncMutation.isPending || sync.isLoading}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CloudUpload className="h-4 w-4 mr-2" />
              )}
              Sync prices to Stripe
            </Button>
            {!isSuperAdmin && (
              <span className="text-xs text-muted-foreground">
                Super admin only — this creates the objects Stripe charges from.
              </span>
            )}
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
