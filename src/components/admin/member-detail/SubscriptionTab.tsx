import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CreditCard, Calendar, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { MemberActionsCard } from "@/components/admin/member-detail/MemberActionsCard";
import { ConfirmLegacyMemberCard } from "@/components/admin/member-detail/ConfirmLegacyMemberCard";
import { LegacyBillingDateCard } from "@/components/admin/member-detail/LegacyBillingDateCard";
import { EditableCard } from "@/components/EditableCard";
import { SendPaymentLinkDialog } from "@/components/admin/member-detail/SendPaymentLinkDialog";

interface Subscription {
  id: string;
  plan_type: string;
  billing_frequency: string;
  amount: number;
  status: string;
  start_date: string;
  renewal_date: string | null;
  payment_method: string | null;
  registration_fee_paid: boolean | null;
  has_pendant: boolean | null;
  stripe_subscription_id: string | null;
  mollie_subscription_id: string | null;
  mollie_customer_id: string | null;
}

interface SubscriptionTabProps {
  memberId: string;
  /** For the payment-link dialog's copy — it writes to whoever pays, who may not be the member. */
  memberName?: string;
  /**
   * The MEMBER's status and billing source, not the subscription's. A legacy member has no
   * subscription row at all, so this tab cannot tell from its own query whether it is looking at
   * somebody who has never joined or somebody imported from Karma who is waiting to be
   * confirmed — and those two need opposite screens.
   */
  memberStatus?: string | null;
  billingSource?: string | null;
  /** The Santander schedule, for the card that records it and the line that states it. */
  legacyBillingDay?: number | null;
  legacyNextRenewal?: string | null;
  /** Refetch the member after the billing date is written, so the line below updates. */
  onMemberChanged?: () => void;
}

/**
 * Which statuses mean "this member is paying us". `past_due` counts: P4 keeps monitoring running
 * while Stripe retries a failed card, so a past_due member has a subscription, not a gap.
 */
const LIVE_STATUSES = ["active", "past_due"];

export function SubscriptionTab({
  memberId,
  memberName,
  memberStatus,
  billingSource,
  legacyBillingDay = null,
  legacyNextRenewal = null,
  onMemberChanged,
}: SubscriptionTabProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSubscription();
  }, [memberId]);

  /*
    THE MOST RECENT SUBSCRIPTION, WHATEVER ITS STATUS — not `.eq("status", "active")`.

    That filter is why this tab said "no active subscription" to a member who had just been sent
    a payment link: the row exists and is `pending`, waiting for the webhook. A staff member
    looking at an empty tab sends a second link, and now two orders are chasing one member.
    Ordered newest-first because a member can legitimately have an old cancelled row.
  */
  const fetchSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setSubscription(data as Subscription | null);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      toast.error("Failed to load subscription");
    } finally {
      setIsLoading(false);
    }
  };

  /*
    `updateStatus` IS GONE, and it was the defect WP7 exists to fix.

    It wrote `subscriptions.status` STRAIGHT FROM THE BROWSER — pause, resume and cancel — and
    for Stripe it called nothing at all. Its own comment said so: "Stripe cancellation would be
    handled via Stripe Dashboard or API if needed."

    So pressing Cancel left the database saying `cancelled` while STRIPE KEPT CHARGING THE
    MEMBER'S CARD, and pressing Resume wrote `status = 'active'` from the client, which golden
    rule 4 reserves for the payment webhook. Neither was attributed and neither had a reason.

    Both now go through `MemberActionsCard` → `useMemberAction`, which drives the gateway first
    and lets the SERVER mirror the status — and records who did it and why, which
    `enforce_member_action_attribution()` refuses to let it skip.
  */


  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">Active</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Awaiting payment</Badge>;
      case "past_due":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Payment overdue</Badge>;
      case "paused":
        return <Badge variant="secondary">Paused</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      case "expired":
        return <Badge variant="outline">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLive = !!subscription && LIVE_STATUSES.includes(subscription.status);

  /*
    NOT LIVE — no subscription at all, or one that is pending, cancelled or expired.

    `Create Subscription` used to sit here with NO onClick: pressing it did nothing at all, and
    a staff member could press it repeatedly while believing they had signed the member up
    (Lee's dashboard notes, 9 Sep, item 4). It is replaced by a dialog that asks the SERVER for a
    Stripe Checkout Session — and by golden rule 4, that is as far as any screen may go: the
    member becomes active when the webhook sees the money.
  */
  const isLegacyActive = memberStatus === "active" && billingSource === "legacy";

  if (!isLive) {
    const pending = subscription?.status === "pending";
    return (
      <div className="space-y-6">
        {/* FIRST, and above the "no subscription" card. A legacy member genuinely has no
            subscription — that card is telling the truth — but read on its own it says "this
            person is not a member", which for somebody wearing a pendant since 2014 is the
            wrong story. The confirm card renders only for pending_review + legacy, so it is
            absent for everybody else and this costs them nothing. */}
        <ConfirmLegacyMemberCard
          memberId={memberId}
          memberName={memberName ?? "this member"}
          status={memberStatus ?? null}
          billingSource={billingSource ?? null}
        />

        {isLegacyActive && (
          <Card data-testid="legacy-billing-notice">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Legacy billing
                <Badge variant="outline">Monitored</Badge>
              </CardTitle>
              <CardDescription>
                Confirmed as a legacy member: an operator answers their alarm, and their payments
                are handled directly with the office. There is no subscription here to renew, and
                renewal or payment-failed reminders will never fire for them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* THE ONE LINE SOMEBODY ON THE PHONE NEEDS. "Is my payment still coming out, and
                  when?" has no answer anywhere else on this record — there is no subscription
                  row to read it off. When it is unknown it says so rather than showing a dash,
                  because "we don't know" is the thing that needs doing something about. */}
              <p className="text-sm" data-testid="legacy-billing-line">
                Legacy billing — Santander —{" "}
                {legacyNextRenewal ? (
                  <span className="font-medium">
                    next debit {format(new Date(legacyNextRenewal), "PPP")}
                  </span>
                ) : (
                  <span className="font-medium text-amber-600">no billing date recorded yet</span>
                )}
                {legacyBillingDay !== null && (
                  <span className="text-muted-foreground">
                    {" "}
                    (day {legacyBillingDay} of the month)
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        <LegacyBillingDateCard
          memberId={memberId}
          billingSource={billingSource ?? null}
          billingDay={legacyBillingDay}
          nextRenewal={legacyNextRenewal}
          onSaved={onMemberChanged}
        />

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Subscription</CardTitle>
                <CardDescription>
                  {pending
                    ? "A payment link has been created for this member and is waiting to be paid."
                    : "This member has no live subscription."}
                </CardDescription>
              </div>
              {subscription && getStatusBadge(subscription.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 py-6 text-center">
            <CreditCard className="mx-auto h-16 w-16 text-muted-foreground" />
            {pending && subscription && (
              <div className="mx-auto max-w-sm space-y-1 text-sm text-muted-foreground">
                <p>
                  {subscription.plan_type} · {subscription.billing_frequency} · €
                  {Number(subscription.amount).toFixed(2)}
                </p>
                <p>
                  Created {format(new Date(subscription.start_date), "PPP")}. It becomes active the
                  moment Stripe confirms the payment — nothing on this screen can activate it.
                </p>
              </div>
            )}
            <div className="flex justify-center">
              <SendPaymentLinkDialog
                memberId={memberId}
                memberName={memberName ?? "This member"}
                trigger={
                  <Button data-testid="send-payment-link-open">
                    <CreditCard className="h-4 w-4" />
                    {pending ? "Send another payment link" : "Send payment link"}
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/*
        LOCKED, WITH THE REASON ON THE SCREEN — not an Edit button that unlocks nothing.

        Every other card on this record now shows a padlock until somebody presses Edit, so a
        card with no padlock and no button reads as "editable, and the control is missing". The
        truth is narrower and worth saying: plan, price, billing period and dates are whatever
        the payment webhook last recorded (golden rule 4), and the way to change them is the
        actions card below, which drives the gateway first and lets the server mirror it.
      */}
      <EditableCard
        testId="subscription-card"
        mode="locked"
        title={
          <span className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Plan
          </span>
        }
        description="Subscription details and billing information"
        lockedReason="Set by the payment path — plan, price and dates change when Stripe or Mollie says they have. Use the actions below to change a subscription."
        headerExtra={<div className="pt-1">{getStatusBadge(subscription.status)}</div>}
      >
        <div className="space-y-6">
          {/* Plan Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Plan Type</p>
              <p className="text-2xl font-bold capitalize">{subscription.plan_type}</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Billing</p>
              <p className="text-2xl font-bold capitalize">{subscription.billing_frequency}</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-2xl font-bold">€{Number(subscription.amount).toFixed(2)}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">{format(new Date(subscription.start_date), "PPP")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Next Renewal</p>
                <p className="font-medium">{subscription.renewal_date ? format(new Date(subscription.renewal_date), "PPP") : "-"}</p>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              {subscription.registration_fee_paid ? (
                <CheckCircle className="h-4 w-4 text-alert-resolved" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              )}
              <span className="text-sm">
                Registration Fee {subscription.registration_fee_paid ? "Paid" : "Pending"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {subscription.has_pendant ? (
                <CheckCircle className="h-4 w-4 text-alert-resolved" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">
                {subscription.has_pendant ? "Includes Pendant" : "No Pendant"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm capitalize">
                Payment: {subscription.payment_method}
                {subscription.mollie_subscription_id && " (Mollie)"}
                {subscription.stripe_subscription_id && " (Stripe)"}
              </span>
            </div>
          </div>

          {/*
            `Change Plan` USED TO BE HERE, WITH NO HANDLER — a second dead button beside the
            dead `Create Subscription` one (item 4). Changing a plan is `switch_to_single` /
            `switch_to_couple` in `MemberActionsCard` below, where it carries the reason and the
            attribution the database demands. A button that looks like it changes a plan and
            does nothing is worse than no button: the staff member believes the plan changed.

            Nothing replaces it in this card on purpose. Two ways to change a subscription, one
            of which writes the database and leaves Stripe charging, is worse than either alone
            — whichever a staff member reaches for first is the one that decides what the member
            pays.
          */}
        </div>
      </EditableCard>

      <MemberActionsCard
        memberId={memberId}
        subscriptionId={subscription?.id ?? null}
        gateway={
          subscription?.mollie_subscription_id
            ? "mollie"
            : subscription?.stripe_subscription_id
              ? "stripe"
              : null
        }
      />
    </div>
  );
}
