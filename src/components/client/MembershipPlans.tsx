import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { usePricing } from "@/hooks/usePricing";
import { usePricingSettings, formatRegistrationFeeDisplay } from "@/hooks/usePricingSettings";
import {
  formatPrice,
  getSubscriptionMonthlyFinal,
  getSubscriptionFinalPrice,
  getAnnualSavings,
  getPendantFinalPrice,
  getShippingCost,
} from "@/config/pricing";

/**
 * THE PLANS, ON THE MEMBER'S OWN MEMBERSHIP PAGE — R8's "shows the plans".
 *
 * Read-only. There is no "choose this one" button on a plan card, and that is the point of the
 * component: R8 asks for the plans to be SHOWN, and the single action lives once on the page
 * that renders this (R1 — one red button per page). A card each for single and couple, with a
 * button on each, would be three primary actions and two of them a lie, because neither plan can
 * be bought from here. See `membershipCondition.ts` for why.
 *
 * PRICES COME FROM THE DATABASE. `usePricing()` hydrates the module config from `pricing_plans` /
 * `pricing_settings`, so an admin's price change reaches this page. Until it lands the helpers
 * return `DEFAULT_PRICING_CONFIG`, which a seed-parity test locks to the migration seed — so the
 * numbers are right before the network call rather than blank or stale.
 *
 * AND THE ONE-OFF COSTS ARE ON IT. Showing €24.99/month next to nothing else would understate
 * what joining actually costs by about €200: there is a pendant, shipping, and usually a
 * registration fee. A member who reads a monthly price, asks us to set it up, and then hears the
 * real number has been quoted a price that was not true. The registration fee is read through
 * `formatRegistrationFeeDisplay()` so a discount or a waiver shows as one.
 */
export function MembershipPlans() {
  const { t } = useTranslation();
  // Hydrates the module-level pricing config; the helpers below read it.
  const { isLoading: pricingLoading } = usePricing();
  const {
    registrationFeeEnabled,
    registrationFeeDiscount,
    registrationFeeBase,
    registrationFeeFinal,
  } = usePricingSettings();

  const registration = formatRegistrationFeeDisplay(
    registrationFeeEnabled,
    registrationFeeDiscount,
    registrationFeeBase,
    registrationFeeFinal,
    t,
  );

  const plans = [
    { key: "single" as const, nameKey: "membership.single", nameFallback: "Single" },
    { key: "couple" as const, nameKey: "membership.couple", nameFallback: "Couple" },
  ];

  return (
    <div className="space-y-4" data-testid="membership-plans">
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.key} data-testid={`membership-plan-${plan.key}`}>
            <CardContent className="space-y-2 p-6">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(plan.nameKey, plan.nameFallback)}
              </p>
              <p className="text-2xl font-bold">
                {pricingLoading ? "—" : formatPrice(getSubscriptionMonthlyFinal(plan.key))}
                {/* The slash is inside the string: `subscription.mo` is "/mo". */}
                <span className="text-base font-normal text-muted-foreground">
                  {t("subscription.mo", "/mo")}
                </span>
              </p>
              <p className="text-base text-muted-foreground">
                {t("subscription.orAnnual", "or {{price}} a year — saves {{saving}}", {
                  price: pricingLoading ? "—" : formatPrice(getSubscriptionFinalPrice(plan.key, "annual")),
                  saving: pricingLoading ? "—" : formatPrice(getAnnualSavings(plan.key)),
                })}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-2 p-6">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("subscription.oneOffCosts", "Paid once, when you join")}
          </p>
          <dl className="space-y-1 text-base">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("subscription.thePendant", "The pendant")}</dt>
              <dd className="font-medium">
                {pricingLoading ? "—" : formatPrice(getPendantFinalPrice(1))}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("subscription.shipping", "Delivery")}</dt>
              <dd className="font-medium">{pricingLoading ? "—" : formatPrice(getShippingCost())}</dd>
            </div>
            {registrationFeeEnabled && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {t("subscription.registrationFee", "Setting you up")}
                </dt>
                <dd className="font-medium">
                  {registration.showStrikethrough && (
                    <span className="mr-2 line-through text-muted-foreground">
                      {registration.originalPrice}
                    </span>
                  )}
                  {registration.display}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
