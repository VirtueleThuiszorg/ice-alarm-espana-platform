import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Pencil, Users, Building2, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePricing } from "@/hooks/usePricing";
import {
  formatPrice,
  getSubscriptionMonthlyFinal,
  getSubscriptionFinalPrice,
  getPendantFinalPrice,
  getRegistrationFee,
  getShippingCost,
} from "@/config/pricing";

/**
 * WHAT THIS PAGE USED TO DO, AND WHY IT DOESN'T ANY MORE.
 *
 * It rendered twelve rows from a hardcoded `DEFAULT_PRICING_TEMPLATES` array —
 * three partner types × single/couple × monthly/annual — each editable and
 * saved into `system_settings` as a JSON blob. It advertised that a `care`
 * partner's members pay 24,99 € with half the registration fee and that the
 * partner earns €40, and that a `residential` partner's members pay 19,99 €
 * with a free pendant and the partner earns nothing.
 *
 * **None of it was ever read.** `submit-registration`, `_shared/pricing-calc.ts`
 * and `create-checkout` contain zero references to `partner_pricing`,
 * `partner_type` or `commission`: every member is charged the same global
 * price, whoever referred them. And the payout is a flat constant in
 * `useOrderActions.ts`, so a care partner was paid €50, not the €40 shown, and
 * a residential partner €50, not €0.
 *
 * So the screen misquoted the price to two partner types and misstated their
 * commission, and editing it changed nothing at all — the worst kind of admin
 * screen, one that accepts input and discards it.
 *
 * Lee, 2026-09-08: **one price list for everybody, flat €50 commission, once
 * per member.** Per-partner-type pricing is wanted in a future version; when it
 * is built, the member price will depend on who referred them, which is a real
 * change to `submit-registration` and not something this page can fake.
 *
 * Until then this page shows what is actually charged and actually paid, read
 * live from the same tables the checkout uses, and sends you to the one editor
 * that changes them.
 */

const COMMISSION_PER_MEMBER_EUR = 50;

export default function PartnerPricingSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Hydrates the module-level pricing config from pricing_plans + pricing_settings,
  // which is the same source submit-registration recomputes against.
  const { isLoading } = usePricing();

  const rows = (["single", "couple"] as const).flatMap((membership) =>
    (["monthly", "annual"] as const).map((frequency) => ({
      membership,
      frequency,
      subscription:
        frequency === "monthly"
          ? getSubscriptionMonthlyFinal(membership)
          : getSubscriptionFinalPrice(membership, "annual"),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("adminPartnerPricing.title", "Partner Pricing & Commission")}
        </h1>
        <p className="text-muted-foreground">
          {t(
            "adminPartnerPricing.subtitle",
            "What a referred member pays, and what the partner earns for referring them.",
          )}
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>
          {t("adminPartnerPricing.samePricing.title", "Every partner type uses the same prices")}
        </AlertTitle>
        <AlertDescription>
          {t(
            "adminPartnerPricing.samePricing.body",
            "Referral, care and residential partners all refer members onto the same price list, and all earn the same commission. Nothing about a member's price depends on who referred them. Per-partner-type pricing is planned for a future version.",
          )}
        </AlertDescription>
      </Alert>

      {/* ── What the member pays ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>
                {t("adminPartnerPricing.memberPays.title", "What a referred member pays")}
              </CardTitle>
              <CardDescription>
                {t(
                  "adminPartnerPricing.memberPays.desc",
                  "Read live from the pricing tables the checkout charges against. IVA included.",
                )}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => navigate("/admin/settings")}>
              <Pencil className="h-4 w-4 mr-2" />
              {t("adminPartnerPricing.editInSettings", "Change prices in Settings")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminPartnerPricing.col.membership", "Membership")}</TableHead>
                  <TableHead>{t("adminPartnerPricing.col.billing", "Billing")}</TableHead>
                  <TableHead className="text-right">
                    {t("adminPartnerPricing.col.subscription", "Subscription")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("adminPartnerPricing.col.regFee", "Registration fee")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("adminPartnerPricing.col.pendant", "Pendant")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("adminPartnerPricing.col.shipping", "Shipping")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      {t("common.loading", "Loading…")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={`${r.membership}-${r.frequency}`}>
                      <TableCell className="capitalize font-medium">{r.membership}</TableCell>
                      <TableCell className="capitalize">{r.frequency}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(r.subscription)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(getRegistrationFee())}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(getPendantFinalPrice())}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(getShippingCost())}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t(
              "adminPartnerPricing.memberPays.note",
              "A member who declines a pendant pays no pendant and no shipping. The registration fee can be discounted globally in Settings.",
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── What the partner earns ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("adminPartnerPricing.commission.title", "What the partner earns")}
          </CardTitle>
          <CardDescription>
            {t(
              "adminPartnerPricing.commission.desc",
              "As stated in the signed partner agreement.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold tabular-nums">
              €{COMMISSION_PER_MEMBER_EUR}
            </span>
            <span className="text-muted-foreground">
              {t("adminPartnerPricing.commission.perMember", "per referred member, once")}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["referral", <Users className="h-4 w-4" key="i" />],
                ["care", <Building2 className="h-4 w-4" key="i" />],
                ["residential", <Home className="h-4 w-4" key="i" />],
              ] as const
            ).map(([type, icon]) => (
              <div key={type} className="flex items-center gap-3 rounded-lg border p-3">
                {icon}
                <span className="capitalize text-sm">{type}</span>
                <Badge variant="secondary" className="ml-auto tabular-nums">
                  €{COMMISSION_PER_MEMBER_EUR}
                </Badge>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
            <p className="font-medium">
              {t("adminPartnerPricing.commission.rulesTitle", "How it is earned")}
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                {t(
                  "adminPartnerPricing.commission.rule1",
                  "Paid once per referred member, on joining. A replacement pendant sent to an existing member does not earn a second commission.",
                )}
              </li>
              <li>
                {t(
                  "adminPartnerPricing.commission.rule2",
                  "A couple plan is one referral, so €50 — not €50 per person and not €50 per pendant.",
                )}
              </li>
              <li>
                {t(
                  "adminPartnerPricing.commission.rule3",
                  "Triggered when the pendant is marked delivered, then held for 7 days before release.",
                )}
              </li>
              <li>
                {t(
                  "adminPartnerPricing.commission.rule4",
                  "Cancelled automatically if the order is refunded or cancelled, or the member stops being active, during the holding period.",
                )}
              </li>
            </ul>
          </div>

          <Button variant="outline" onClick={() => navigate("/admin/commissions")}>
            {t("adminPartnerPricing.commission.viewAll", "View all commissions")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
