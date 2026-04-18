import { useTranslation } from "react-i18next";
import { useMemberSubscription, useMemberPayments } from "@/hooks/useMemberProfile";
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
  Download,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUpRight,
  Smartphone,
  Banknote
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function SubscriptionPage() {
  const { t } = useTranslation();
  const { data: subscription, isLoading: subLoading } = useMemberSubscription();
  const { data: payments, isLoading: paymentsLoading } = useMemberPayments();

  const isLoading = subLoading || paymentsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("subscription.title")}</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">{t("subscription.noActiveSubscription")}</h3>
            <p className="text-muted-foreground">
              {t("subscription.contactSupport")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("subscription.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subscription.subtitle")}</p>
      </div>

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
              <p className="text-xl font-semibold">
                €{(subscription.amount || 0).toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  /{subscription.billing_frequency === "monthly" ? t("subscription.mo") : t("subscription.yr")}
                </span>
              </p>
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
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{t("subscription.switchToAnnual")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t("subscription.savePerYear", { amount: subscription.plan_type === "single" ? "54.99" : "76.99" })}
                  </p>
                </div>
                <Button onClick={() => toast.info(t("subscription.contactToUpgrade", "Please contact support to upgrade your plan."))}>
                  {t("subscription.upgrade")}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {t("subscription.changePlanNote")}
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
            <Button variant="outline" onClick={() => toast.info(t("subscription.contactToUpdatePayment", "Please contact support to update your payment method."))}>
              {t("common.update")}
            </Button>
          </div>
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
                    <TableCell className="text-right">
                      {payment.invoice_number && (
                        <Button variant="ghost" size="sm" onClick={() => toast.info(t("subscription.invoiceComingSoon", "Invoice downloads coming soon."))}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
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
