import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CreditCard, Calendar, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { MemberActionsCard } from "@/components/admin/member-detail/MemberActionsCard";

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
}

export function SubscriptionTab({ memberId }: SubscriptionTabProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSubscription();
  }, [memberId]);

  const fetchSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("member_id", memberId)
        .eq("status", "active")
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

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>No active subscription found for this member.</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-8">
          <CreditCard className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">
            This member does not have an active subscription.
          </p>
          <Button>Create Subscription</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>Subscription details and billing information</CardDescription>
            </div>
            {getStatusBadge(subscription.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <Button variant="outline">
              Change Plan
            </Button>
            
            {/*
              The actions live in `MemberActionsCard`, below. Not beside these buttons: two ways
              to cancel a subscription, one of which wrote the database and left Stripe
              charging, is worse than either alone — whichever a staff member reaches for first
              is the one that decides whether the member keeps paying.
            */}
          </div>
        </CardContent>
      </Card>

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
