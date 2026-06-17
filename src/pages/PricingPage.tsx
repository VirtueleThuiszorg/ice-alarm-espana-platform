import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePricing } from "@/hooks/usePricing";
import {
  formatPrice,
  getSubscriptionMonthlyFinal,
  getSubscriptionFinalPrice,
  getAnnualSavings,
  getPendantFinalPrice,
  getRegistrationFee,
  getShippingCost,
} from "@/config/pricing";

/**
 * Public /pricing page. Reads the canonical pricing via usePricing() (DB-backed); the home
 * #pricing section and pendant cards read the same source, so there is one place to change.
 */
export default function PricingPage() {
  const { t } = useTranslation();
  const { isLoading } = usePricing(); // hydrate + react to admin-edited prices

  const plans: Array<{ key: "single" | "couple"; titleKey: string; descKey: string; popular?: boolean }> = [
    { key: "single", titleKey: "landing.singleMembership", descKey: "landing.forOnePerson" },
    { key: "couple", titleKey: "landing.coupleMembership", descKey: "landing.forTwoPeople", popular: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <section className="pt-28 pb-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{t("navigation.pricing", "Pricing")}</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("landing.pricingDesc", "Simple, transparent pricing. Cancel anytime.")}
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {plans.map((plan) => (
                <Card key={plan.key} className={plan.popular ? "relative border-primary shadow-glow" : "relative"}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="px-3 py-1">{t("landing.mostPopular", "Most Popular")}</Badge>
                    </div>
                  )}
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-lg mb-2">{t(plan.titleKey)}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{t(plan.descKey)}</p>
                    <div className="mb-2">
                      <span className="text-4xl font-bold">{formatPrice(getSubscriptionMonthlyFinal(plan.key))}</span>
                      <span className="text-muted-foreground">{t("landing.perMonth", "/month")}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-6">
                      {t("common.or", "or")} {formatPrice(getSubscriptionFinalPrice(plan.key, "annual"))}{t("landing.perYear", "/year")}{" "}
                      <span className="text-alert-resolved">
                        ({t("landing.save", "save")} {formatPrice(getAnnualSavings(plan.key))})
                      </span>
                    </p>
                    <Button className="w-full" variant={plan.popular ? "default" : "outline"} asChild>
                      <Link to="/join">{t("common.getStarted", "Get Started")}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* One-time costs */}
          <div className="mt-12 max-w-2xl mx-auto">
            <Card>
              <CardContent className="pt-6 space-y-3 text-sm">
                <h3 className="font-semibold text-base mb-2">{t("pricing.oneTime", "One-time costs")}</h3>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-alert-resolved" /> {t("pricing.pendant", "GPS pendant")}</span>
                  <span className="font-medium">{formatPrice(getPendantFinalPrice(1))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-alert-resolved" /> {t("pricing.shipping", "Shipping")}</span>
                  <span className="font-medium">{formatPrice(getShippingCost())}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-alert-resolved" /> {t("pricing.registration", "Registration & setup")}</span>
                  <span className="font-medium">{formatPrice(getRegistrationFee())}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      <footer className="py-8 text-center text-sm text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} Care Conneqt. Connected Health. Human Care.</p>
      </footer>
    </div>
  );
}
