import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, Copy, CreditCard, ExternalLink, Loader2, Mail, MessageSquare, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  anyChannelSent,
  useSendPaymentLink,
  type DeliveryReport,
  type SendPaymentLinkResult,
} from "@/hooks/useSendPaymentLink";

/**
 * "Send payment link" — what replaces a `<Button>Create Subscription</Button>` that had no
 * `onClick` at all (Lee's dashboard notes, 9 Sep, item 4).
 *
 * THE FORM HAS NO PRICE FIELD, and that is the design. Staff choose a plan, a billing
 * frequency, a pendant count and who pays; every figure is computed on the server from the
 * pricing tables and charged against Stripe Price objects created from those same tables. The
 * old join path let the BROWSER name the amount (REVIEW_JOIN_PATH.md F7) and a visitor who
 * edited the request body paid what they typed — there is no field here to do that with.
 *
 * IT NEVER SAYS "SENT" WITHOUT EVIDENCE. The result panel reports each channel separately:
 * sent, or the reason it was not (Lee's global SMS switch off, no phone number, no verified
 * email sender, or a transport that failed). The link itself is always on screen with a copy
 * button, because reading it out over the phone is a perfectly good delivery channel and the
 * one that always works.
 *
 * ACTIVATION IS NOT HERE. Pressing this creates PENDING rows and a Stripe session. The member
 * becomes active when the webhook sees the money — golden rule 4 — and since 20260909110000 the
 * database refuses every other route, including a staff member typing a status.
 */

interface SendPaymentLinkDialogProps {
  memberId: string;
  memberName: string;
  /** Rendered as the trigger. Defaults to a primary button. */
  trigger?: React.ReactNode;
}

type PayerMode = "member" | "other";

const CHANNEL_ICON = { sms: MessageSquare, email: Mail } as const;

export function SendPaymentLinkDialog({ memberId, memberName, trigger }: SendPaymentLinkDialogProps) {
  const { t } = useTranslation();
  const send = useSendPaymentLink();

  const [open, setOpen] = useState(false);
  const [membershipType, setMembershipType] = useState<"single" | "couple">("single");
  const [billingFrequency, setBillingFrequency] = useState<"monthly" | "annual">("monthly");
  const [pendantCount, setPendantCount] = useState(1);
  const [payerMode, setPayerMode] = useState<PayerMode>("member");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerRelationship, setPayerRelationship] = useState("");
  const [result, setResult] = useState<SendPaymentLinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  /** A couple gets two pendants by default; staff can still say otherwise. */
  const chooseMembership = (value: "single" | "couple") => {
    setMembershipType(value);
    setPendantCount(value === "couple" ? 2 : 1);
  };

  const payerIncomplete = payerMode === "other" && (!payerName.trim() || !payerEmail.trim());

  const submit = () => {
    send.mutate(
      {
        memberId,
        membershipType,
        billingFrequency,
        pendantCount,
        payer:
          payerMode === "member"
            ? { mode: "member" }
            : {
                mode: "other",
                fullName: payerName.trim(),
                email: payerEmail.trim(),
                phone: payerPhone.trim() || undefined,
                relationship: payerRelationship.trim() || undefined,
              },
      },
      {
        onSuccess: (data) => {
          setResult(data);
          // The wording follows the evidence: a link nobody could be sent is still a link.
          if (anyChannelSent(data.delivery)) {
            toast.success(t("admin.paymentLink.sent", "Payment link sent"));
          } else {
            toast.info(
              t(
                "admin.paymentLink.createdNotSent",
                "Payment link created — no channel was available, so copy it from the panel",
              ),
            );
          }
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A clipboard permission refusal must not look like a failure to create the link.
      toast.error(t("admin.paymentLink.copyFailed", "Could not copy — select the link and copy it"));
    }
  };

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setResult(null);
      send.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-testid="send-payment-link-open">
            <CreditCard className="h-4 w-4" />
            {t("admin.paymentLink.open", "Send payment link")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg" data-testid="send-payment-link-dialog">
        <DialogHeader>
          <DialogTitle>{t("admin.paymentLink.title", "Send a payment link")}</DialogTitle>
          <DialogDescription>
            {t("admin.paymentLink.description", {
              defaultValue:
                "Stripe takes the payment and monitoring starts when it confirms. Prices come from the pricing tables — this form has no price field.",
            })}
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>{t("admin.paymentLink.plan", "Plan")}</Label>
              <RadioGroup
                value={membershipType}
                onValueChange={(v) => chooseMembership(v as "single" | "couple")}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="single" data-testid="plan-single" />
                  {t("admin.paymentLink.single", "Single")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="couple" data-testid="plan-couple" />
                  {t("admin.paymentLink.couple", "Couple")}
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.paymentLink.billing", "Billing")}</Label>
              <RadioGroup
                value={billingFrequency}
                onValueChange={(v) => setBillingFrequency(v as "monthly" | "annual")}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="monthly" data-testid="billing-monthly" />
                  {t("admin.paymentLink.monthly", "Monthly")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="annual" data-testid="billing-annual" />
                  {t("admin.paymentLink.annual", "Yearly")}
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.paymentLink.pendants", "Pendants")}</Label>
              <RadioGroup
                value={String(pendantCount)}
                onValueChange={(v) => setPendantCount(Number(v))}
                className="flex gap-4"
              >
                {[0, 1, 2].map((n) => (
                  <label key={n} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={String(n)} data-testid={`pendants-${n}`} />
                    {n}
                  </label>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {t(
                  "admin.paymentLink.shippingNote",
                  "Shipping is charged once, however many pendants.",
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.paymentLink.payer", "Who pays")}</Label>
              <RadioGroup
                value={payerMode}
                onValueChange={(v) => setPayerMode(v as PayerMode)}
                className="space-y-1"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="member" data-testid="payer-member" />
                  {t("admin.paymentLink.payerMember", { defaultValue: "{{name}} pays", name: memberName })}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="other" data-testid="payer-other" />
                  {t("admin.paymentLink.payerOther", "Somebody else pays (a son, a daughter, a friend)")}
                </label>
              </RadioGroup>
            </div>

            {payerMode === "other" && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.paymentLink.payerNote",
                    "The payer's details are kept separately from the member's record, and paying grants no access to it. The pendant is still posted to the member.",
                  )}
                </p>
                <div className="space-y-1">
                  <Label htmlFor="payer-name">{t("admin.paymentLink.payerName", "Full name")}</Label>
                  <Input
                    id="payer-name"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    data-testid="payer-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="payer-email">{t("admin.paymentLink.payerEmail", "Email")}</Label>
                  <Input
                    id="payer-email"
                    type="email"
                    value={payerEmail}
                    onChange={(e) => setPayerEmail(e.target.value)}
                    data-testid="payer-email"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="payer-phone">{t("admin.paymentLink.payerPhone", "Phone")}</Label>
                    <Input
                      id="payer-phone"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      data-testid="payer-phone"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="payer-relationship">
                      {t("admin.paymentLink.payerRelationship", "Relationship")}
                    </Label>
                    <Input
                      id="payer-relationship"
                      value={payerRelationship}
                      onChange={(e) => setPayerRelationship(e.target.value)}
                      data-testid="payer-relationship"
                    />
                  </div>
                </div>
              </div>
            )}

            {send.isError && (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
                data-testid="send-payment-link-error"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p>{send.error?.message}</p>
                  {/* The two price failures have one fix, and it is a button on another page. */}
                  {/(sync|Sync)/.test(send.error?.message ?? "") && (
                    <Link to="/admin/settings" className="text-xs font-medium text-primary hover:underline">
                      {t("admin.paymentLink.goToPricing", "Open Settings → Pricing to sync prices")}
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4" data-testid="send-payment-link-result">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{result.planLabel}</p>
              <p className="text-muted-foreground">
                {t("admin.paymentLink.firstPayment", "First payment")}: €{result.totalEuros.toFixed(2)} ·{" "}
                {t("admin.paymentLink.order", "Order")} {result.orderNumber}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-link-url">{t("admin.paymentLink.link", "Payment link")}</Label>
              <div className="flex gap-2">
                <Input
                  id="payment-link-url"
                  readOnly
                  value={result.url}
                  className="font-mono text-xs"
                  data-testid="payment-link-url"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="outline" onClick={copy} data-testid="payment-link-copy">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" asChild>
                  <a href={result.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-1" data-testid="payment-link-delivery">
              <Label>{t("admin.paymentLink.delivery", "Delivery")}</Label>
              {result.delivery.map((d) => (
                <DeliveryRow key={d.channel} report={d} />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {t(
                "admin.paymentLink.activationNote",
                "The member is activated when Stripe confirms the payment — not by this screen.",
              )}
            </p>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => reset(false)} disabled={send.isPending}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={submit}
                disabled={send.isPending || payerIncomplete}
                data-testid="send-payment-link-submit"
              >
                {send.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("admin.paymentLink.submit", "Create link")}
              </Button>
            </>
          ) : (
            <Button onClick={() => reset(false)} data-testid="send-payment-link-done">
              {t("common.done", "Done")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One channel, and the truth about it. */
function DeliveryRow({ report }: { report: DeliveryReport }) {
  const { t } = useTranslation();
  const Icon = CHANNEL_ICON[report.channel];

  const text: Record<DeliveryReport["outcome"], string> = {
    sent: t("admin.paymentLink.outcomeSent", "sent"),
    skipped_channel_off: t("admin.paymentLink.outcomeChannelOff", "not sent — the channel is switched off"),
    skipped_not_configured: t(
      "admin.paymentLink.outcomeNotConfigured",
      "not sent — no sender is configured yet",
    ),
    skipped_no_address: t("admin.paymentLink.outcomeNoAddress", "not sent — nothing to send it to"),
    failed: t("admin.paymentLink.outcomeFailed", "FAILED"),
  };

  return (
    <div className="flex items-center gap-2 text-sm" data-testid={`delivery-${report.channel}`}>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="capitalize">{report.channel}</span>
      <Badge variant={report.outcome === "sent" ? "default" : report.outcome === "failed" ? "destructive" : "secondary"}>
        {text[report.outcome]}
      </Badge>
      {report.to && <span className="truncate text-xs text-muted-foreground">{report.to}</span>}
    </div>
  );
}
