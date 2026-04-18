import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, CreditCard, Calendar, CheckCircle, AlertTriangle,
  PauseCircle, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

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

  const updateStatus = async (newStatus: string) => {
    if (!subscription) return;

    try {
      // If cancelling, also cancel on the payment gateway
      if (newStatus === "cancelled") {
        if (subscription.mollie_subscription_id && subscription.mollie_customer_id) {
          const { error: mollieErr } = await supabase.functions.invoke("cancel-mollie-subscription", {
            body: { subscriptionId: subscription.id },
          });
          if (mollieErr) {
            console.error("Mollie cancellation error:", mollieErr);
            toast.error("Failed to cancel Mollie subscription. DB updated locally.");
          }
        }
        // Stripe cancellation would be handled via Stripe Dashboard or API if needed
      }

      const { error } = await supabase
        .from("subscriptions")
        .update({ status: newStatus as "active" | "paused" | "cancelled" | "expired" })
        .eq("id", subscription.id);

      if (error) throw error;
      toast.success(`Subscription ${newStatus}`);
      fetchSubscription();
    } catch (error) {
      console.error("Error updating subscription:", error);
      toast.error("Failed to update subscription");
    }
  };

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
            
            {subscription.status === "active" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">
                    <PauseCircle className="mr-2 h-4 w-4" />
                    Pause Subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Pause Subscription?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will pause the member's subscription. They will not be billed until resumed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => updateStatus("paused")}>
                      Pause
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {subscription.status === "paused" && (
              <Button variant="outline" onClick={() => updateStatus("active")}>
                Resume Subscription
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently cancel the member's subscription. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                  <AlertDialogAction 
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => updateStatus("cancelled")}
                  >
                    Cancel Subscription
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
