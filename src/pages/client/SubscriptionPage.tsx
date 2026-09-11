import { useTranslation } from "react-i18next";
import { useMemberSubscriptions, useMemberPayments, useMemberProfile } from "@/hooks/useMemberProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  CreditCard,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUpRight,
  Smartphone,
  Banknote
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/client/PageHeader";
import { MembershipConditionCard } from "@/components/client/MembershipConditionCard";
import { SwitchToStripeCard } from "@/components/client/SwitchToStripeCard";
import { membershipCondition } from "@/lib/membershipCondition";
import { supportActionPath } from "@/lib/supportActions";
import { subscriptionPrice, taxRatePercent } from "@/lib/subscriptionPrice";
import { usePricing } from "@/hooks/usePricing";

export default function SubscriptionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: subscriptions, isLoading: subLoading } = useMemberSubscriptions();
  const { data: payments, isLoading: paymentsLoading } = useMemberPayments();
  /*
    THE MEMBER ROW, because the subscription cannot answer the question this page asks.

    A legacy member — and a member mid-migration — has no subscription of their own, so
    `membershipCondition` read from the subscription alone answers "never joined" for somebody an
    operator is watching tonight. `billing_source` is the authority on who bills them; the
    subscription is the authority on what this platform has charged, and for these people that is
    nothing yet.
  */
  const { data: profile } = useMemberProfile();
  // Hydrates the module-level pricing config from `pricing_plans`, so the IVA rate applied to
  // this member's net is the one an admin set rather than a literal. Unconditional and above
  // the early returns, because it is a hook.
  usePricing();

  const isLoading = subLoading || paymentsLoading;
  const subscription = subscriptions?.active ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!subscription) {
    /*
      SEVEN SITUATIONS, NOT ONE.

      This branch used to say `subscription.contactSupport` — *"contact support to change"* —
      to everybody who reached it, which is the exact sentence R6 forbids and which R8
      contradicts ("'No active subscription' shows the plans"). And it reached seven different
      people: somebody who never joined, somebody whose payment failed, somebody paused,
      suspended, cancelled, expired, or still waiting for a first payment to clear.

      Only ONE of them should be shown the plans. Sending a member in arrears to sign up again
      is how one person ends up with two member records and two Stripe customers — and on this
      product, two records for one person is an operator opening the wrong one during an SOS.
      `membershipCondition.ts` carries the full argument.

      `subscriptions` is `undefined` when the query FAILED as well as while it was loading, and
      the loading case has already returned above. So an undefined here is a failed read, and it
      maps to `unknown` rather than to "you have never joined".
    */
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title={t("subscription.title")} subtitle={t("subscription.subtitle")} />
        <MembershipConditionCard
          condition={membershipCondition(
            subscriptions === undefined ? undefined : subscriptions.latest,
            profile ? { status: profile.status, billing_source: profile.billing_source } : null,
          )}
        />

        {/* Their own copy of the link, because "I've lost the text" is the commonest reason a
            migration stalls. Renders only mid-switch; absent for everybody else. */}
        {profile?.billing_source === "switch_pending" && (
          <SwitchToStripeCard
            checkoutUrl={profile.switch_checkout_url}
            sessionExpiresAt={profile.switch_session_expires_at}
            switchExpiresAt={profile.switch_expires_at}
          />
        )}
      </div>
    );
  }

  // Their contracted net (from the row) plus the plan's IVA rate — see subscriptionPrice.ts.
  const price = subscriptionPrice(subscription.amount, subscription.plan_type);

  const planLabel = subscription.plan_type === "single" 
    ? t("membership.single") 
    : t("membership.couple");
  const billingLabel = subscription.billing_frequency === "monthly" 
    ? t("membership.monthly") 
    : t("membership.annual");
  const statusColor = subscription.status === "active" 
    ? "bg-alert-resolved text-alert-resolved-foreground" 
    : "bg-muted";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={t("subscription.title")} subtitle={t("subscription.subtitle")} />

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t("subscription.currentPlan")}</CardTitle>
            <Badge className={statusColor}>
              {subscription.status === "active" ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {t("common.active")}
                </>
              ) : (
                subscription.status
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">{t("subscription.planType")}</p>
              <p className="text-xl font-semibold">{planLabel}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">{t("subscription.billing")}</p>
              <p className="text-xl font-semibold">{billingLabel}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">{t("subscription.serviceType")}</p>
              <div className="flex items-center gap-2 mt-1">
                {subscription.has_pendant ? (
                  <>
                    <Smartphone className="h-5 w-5 text-alert-resolved" />
                    <span className="font-semibold">{t("membership.pendantService")}</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5 text-alert-battery" />
                    <span className="font-semibold">{t("membership.phoneOnlyService")}</span>
                  </>
                )}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">{t("subscription.amount")}</p>
              {/*
                WHAT LEAVES THEIR BANK, not the net.

                This read `€{subscription.amount}` straight out of the row — and both functions
                that create a subscription write the NET there (`v_subscription_net` /
                `v_sub_net`). So a member debited €27.39 read €24.90 on the one page that is
                supposed to tell them what their membership costs, while the join wizard, the
                plan cards and the Stripe line items all showed the inclusive figure.
                `subscriptionPrice()` carries why this is derived rather than fixed in the column.
              */}
              {price === null ? (
                // Not "€0.00". Zero is a real price (`is_free_of_charge`), so rendering it for
                // an unreadable amount would tell a paying member their membership is free.
                <p className="text-xl font-semibold" data-testid="subscription-amount-unknown">
                  {t("subscription.amountUnavailable", "Not available")}
                </p>
              ) : (
                <>
                  <p className="text-xl font-semibold" data-testid="subscription-amount">
                    €{price.final.toFixed(2)}
                    {/* `subscription.mo` is "/mo" and `subscription.yr` is "/yr" — the slash is
                        IN the string, as `ClientDashboard` (its other caller) relies on. A
                        literal "/" in front of it rendered "€24.99//mo" on this page. */}
                    <span className="text-sm font-normal text-muted-foreground">
                      {subscription.billing_frequency === "monthly" ? t("subscription.mo") : t("subscription.yr")}
                    </span>
                  </p>
                  {price.taxApplied && (
                    <p className="text-xs text-muted-foreground" data-testid="subscription-amount-iva">
                      {t("joinWizard.summary.inclIvaRate", { rate: taxRatePercent(price) })}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("subscription.startDate")}</p>
                <p className="font-medium">
                  {subscription.start_date ? format(new Date(subscription.start_date), "dd MMM yyyy") : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">{t("subscription.nextRenewal")}</p>
                <p className="font-medium text-primary">
                  {subscription.renewal_date ? format(new Date(subscription.renewal_date), "dd MMM yyyy") : "—"}
                </p>
              </div>
            </div>
          </div>

          {/*
            WHO PAYS — the payer model, on the page of the person being paid for.

            `payer_id` NULL means the member pays for themselves, which is true of most rows. When
            it is set, somebody else does — usually an adult child — and the member should not be
            left to work that out from a payment method they do not recognise.

            THE PAYER'S NAME IS NOT HERE, and that is RLS rather than a design choice: `payers`
            grants SELECT to staff and to the payer themselves, and to nobody else. The member can
            read `payer_id` (it is a column of their own subscription) but not the row it points
            at. Joining it would need a new policy, and a policy on a table whose whole design
            note is "being a payer grants no access to any care data" is not a thing to add on the
            way past. PENDING_FOR_LEE.md D-13 puts it to Lee as a decision.
          */}
          <div
            className="p-4 rounded-lg bg-muted/50"
            data-testid="subscription-who-pays"
            data-payer={subscription.payer_id ? "other" : "self"}
          >
            <p className="text-sm text-muted-foreground">{t("subscription.whoPays", "Who pays")}</p>
            <p className="font-medium">
              {subscription.payer_id
                ? t("subscription.paidBySomeoneElse", "Somebody else pays for your membership.")
                : t("subscription.paidByYou", "You pay for this yourself.")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("subscription.upgradeOptions")}</CardTitle>
          <CardDescription>
            {t("subscription.upgradeDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription.billing_frequency === "monthly" && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-semibold">{t("subscription.switchToAnnual")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t("subscription.savePerYear", { amount: subscription.plan_type === "single" ? "54.99" : "76.99" })}
                  </p>
                </div>
                {/* R1: the page's ONE red button. Everything below is outline. */}
                <Button className="shrink-0" onClick={() => navigate(supportActionPath("upgrade_plan"))}>
                  {t("subscription.upgrade")}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/*
            THE TWO ACTIONS THE BRIEF NAMES — offered, and honest about what happens next.

            WP4: *"actions 'Add a pendant' and 'Change to couple' through Stripe checkout only."*
            There is no member-initiated Stripe checkout for an existing account: `/join` ends at
            `submit_registration_atomic`, which INSERTS a new member row, so reusing it would give
            one person two records. Building the real thing is new money-movement code against a
            real card — the same line WP7 stopped at for renew / plan switch / add pendant.

            So each one opens a prefilled conversation with a human who can take the payment, and
            the card says so rather than implying an instant change. An absent button is
            indistinguishable from a feature nobody built; a button that says what it does is not.
          */}
          <div className="flex flex-wrap gap-2">
            {!subscription.has_pendant && (
              <Button
                variant="outline"
                data-testid="subscription-add-pendant"
                onClick={() => navigate(supportActionPath("add_pendant"))}
              >
                {t("subscription.addPendant", "Add a pendant")}
              </Button>
            )}
            {subscription.plan_type === "single" && (
              <Button
                variant="outline"
                data-testid="subscription-change-to-couple"
                onClick={() => navigate(supportActionPath("change_to_couple"))}
              >
                {t("subscription.changeToCouple", "Change to a couple plan")}
              </Button>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {t(
              "subscription.changePlanNote",
              "Any of these starts a message to us. We will confirm the price with you and take the payment — nothing changes on your card until you say so.",
            )}
          </p>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("subscription.paymentMethod")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              {subscription.payment_method === "stripe" || subscription.payment_method === "card" ? (
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <p className="font-medium">
                  {subscription.payment_method === "stripe" || subscription.payment_method === "card"
                    ? t("subscription.creditCard", "Credit Card")
                    : subscription.payment_method === "bank_transfer"
                    ? t("subscription.bankTransfer", "Bank Transfer")
                    : subscription.payment_method === "paypal"
                    ? "PayPal"
                    : t("subscription.paymentMethod")}
                </p>
                <p className="text-sm text-muted-foreground">{t("common.active")}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(supportActionPath("update_payment"))}>
              {t("common.update")}
            </Button>
          </div>

          {/*
            A member whose subscription somebody else pays for should not be told to update "their"
            card. The card on file is not theirs, and asking them for it is how a family ends up
            paying twice.
          */}
          {subscription.payer_id && (
            <p className="text-sm text-muted-foreground" data-testid="subscription-payer-pays-note">
              {t(
                "subscription.payerArrangesPayment",
                "The person who pays for your membership arranges this. Message us if you are not sure who that is.",
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("subscription.paymentHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("subscription.date")}</TableHead>
                  <TableHead>{t("subscription.type")}</TableHead>
                  <TableHead>{t("subscription.amount")}</TableHead>
                  <TableHead>{t("subscription.status")}</TableHead>
                  <TableHead className="text-right">{t("subscription.invoice")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {payment.created_at ? format(new Date(payment.created_at), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="capitalize">
                      {(payment.payment_type || "").replace("_", " ")}
                    </TableCell>
                    <TableCell>€{(payment.amount || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={payment.status === "completed" ? "default" : "secondary"}
                        className={payment.status === "completed" ? "bg-alert-resolved" : ""}
                      >
                        {payment.status === "completed" ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t("subscription.paid")}
                          </>
                        ) : payment.status === "pending" ? (
                          <>
                            <Clock className="h-3 w-3 mr-1" />
                            {t("common.pending")}
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            {payment.status}
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {/* Download affordance removed: invoice PDFs don't exist
                          yet — a download icon that only toasts is a dead end */}
                      {payment.invoice_number || ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t("subscription.noPaymentHistory")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
