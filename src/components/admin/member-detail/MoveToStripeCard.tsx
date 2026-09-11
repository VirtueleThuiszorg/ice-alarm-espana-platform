import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowRightLeft, Check, Copy, CreditCard, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  LegacyPlanNotConfirmedError,
  useLegacySwitchLink,
  type SendPaymentLinkResult,
} from "@/hooks/useSendPaymentLink";

/**
 * "Move to Stripe billing" — the one control that starts a legacy member's migration.
 *
 * WHAT PRESSING IT DOES, AND WHAT IT DOES NOT. The server asks Stripe for a Checkout Session
 * for the plan this member is already on, and records `billing_source = 'switch_pending'`. From
 * that moment they are OUT OF THE SANTANDER EXPORT — which is the point, because the office is
 * still running that collection while the migration happens, and a member who pays Stripe while
 * still in the run is charged twice in one month for the same monitoring.
 *
 * It does NOT move them onto Stripe. `billing_source` becomes `stripe` when the payment webhook
 * sees the money and at no other time — golden rule 4 applied to who bills, not only to who is
 * active. Until then this screen says "waiting for payment", because that is what is true.
 *
 * THE LINK IS ALWAYS ON SCREEN. SMS and email are attempted and each reports separately, but
 * most of these members are eighty and the delivery that actually works is an operator reading
 * it out or texting it themselves. A "sent" that silently sent nothing is the defect this whole
 * codebase keeps finding.
 *
 * ── AND SOMETIMES IT ASKS WHAT THEY ARE ON ────────────────────────────────────
 *
 * The plan comes off Karma's verbatim membership label. That label is free text and some of it
 * names no plan at all ('FOC — Ayuntamiento'), in which case the CRM import stored its `single`
 * and `annual` DEFAULTS — indistinguishable from real answers, and one of them is the wrong
 * price while the other is twelve months of monitoring charged at once. The server refuses those
 * rather than guessing, and this card turns the refusal into a question with Karma's own words
 * printed above it. Nothing is sent until somebody answers.
 */
export function MoveToStripeCard({
  memberId,
  memberName,
  status,
  billingSource,
  switchExpiresAt,
  nextRenewal,
  onChanged,
}: {
  memberId: string;
  memberName: string;
  status: string | null;
  billingSource: string | null;
  switchExpiresAt: string | null;
  nextRenewal: string | null;
  onChanged?: () => void;
}) {
  const send = useLegacySwitchLink();
  const [result, setResult] = useState<SendPaymentLinkResult | null>(null);
  const [copied, setCopied] = useState(false);
  /* The server's refusal, kept so the question stays on screen rather than in a toast that
     disappears while the operator is still looking for the answer. */
  const [needsPlan, setNeedsPlan] = useState<LegacyPlanNotConfirmedError | null>(null);
  const [membershipType, setMembershipType] = useState<"single" | "couple" | "">("");
  const [billingFrequency, setBillingFrequency] = useState<"monthly" | "annual" | "">("");

  const isLegacy = billingSource === "legacy" && status === "active";
  const isPending = billingSource === "switch_pending";

  // Nothing to say to a Stripe member, and nothing honest to offer a member nobody has confirmed
  // yet — confirming them is the card above this one.
  if (!isLegacy && !isPending) return null;

  const onSend = async (confirmPlan?: {
    membershipType: "single" | "couple";
    billingFrequency: "monthly" | "annual";
  }) => {
    try {
      const r = await send.mutateAsync({ memberId, confirmPlan });
      setResult(r);
      setNeedsPlan(null);
      onChanged?.();
      toast.success("Switch link created. It is on screen — read it out if the text did not land.");
    } catch (e) {
      if (e instanceof LegacyPlanNotConfirmedError) {
        // Not a toast: this one needs an answer, so it stays on the card until it gets one.
        setNeedsPlan(e);
        return;
      }
      toast.error(e instanceof Error ? e.message : "The switch link could not be created.");
    }
  };

  const canConfirm = membershipType !== "" && billingFrequency !== "";

  const copy = async () => {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the link and copy it by hand.");
    }
  };

  const cardOnly =
    result?.paymentMethodTypes !== undefined && !result.paymentMethodTypes.includes("sepa_debit");

  return (
    <Card data-testid="move-to-stripe-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft className="h-5 w-5" />
              {isPending ? "Moving to Stripe billing" : "Move to Stripe billing"}
            </CardTitle>
            <CardDescription>
              {isPending ? (
                <>
                  A Stripe link is out and unpaid. {memberName} has been taken out of the
                  Santander export so nobody collects twice
                  {switchExpiresAt
                    ? `, and it lapses on ${format(new Date(switchExpiresAt), "PPP")} if they do not use it.`
                    : "."}
                </>
              ) : (
                <>
                  Sends {memberName} a Stripe link for the plan they are already on — no
                  registration fee and no pendant, because they joined years ago and are wearing
                  it. They pay the full amount today and the same on this date each cycle.
                </>
              )}
            </CardDescription>
          </div>
          <Badge variant="outline" data-testid="switch-state-badge">
            {isPending ? "Waiting for payment" : "On Santander"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isPending && (
          <>
            <p className="text-sm text-muted-foreground">
              {nextRenewal
                ? `Their next Santander collection is ${format(new Date(nextRenewal), "PPP")}. The runner times this link to it; sending it by hand now is the same thing, earlier.`
                : "No Santander date is recorded for this member, so the runner cannot time their link. You can still send one now."}
            </p>
            <Button
              onClick={() => onSend()}
              disabled={send.isPending || needsPlan !== null}
              data-testid="move-to-stripe-send"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Create the switch link
            </Button>
          </>
        )}

        {/* WHAT KARMA SAID, AND THE QUESTION IT DOES NOT ANSWER. Shown instead of a price the
            import made up. Sending stays blocked until both halves are chosen — the plan decides
            the amount, and the frequency decides whether it is one month or one year. */}
        {needsPlan && (
          <div
            className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30"
            data-testid="switch-plan-unconfirmed"
          >
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{needsPlan.message}</span>
            </p>

            <RadioGroup
              value={membershipType}
              onValueChange={(v) => setMembershipType(v as "single" | "couple")}
              aria-label="Which plan is this member on?"
            >
              <p className="text-sm font-medium">Which plan are they on?</p>
              {(["single", "couple"] as const).map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <RadioGroupItem value={v} id={`switch-plan-${v}`} />
                  <Label htmlFor={`switch-plan-${v}`} className="font-normal">
                    {v === "single" ? "Single" : "Couple"}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <RadioGroup
              value={billingFrequency}
              onValueChange={(v) => setBillingFrequency(v as "monthly" | "annual")}
              aria-label="How often do they pay?"
            >
              <p className="text-sm font-medium">How often do they pay?</p>
              {(["monthly", "annual"] as const).map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <RadioGroupItem value={v} id={`switch-frequency-${v}`} />
                  <Label htmlFor={`switch-frequency-${v}`} className="font-normal">
                    {v === "monthly" ? "Every month" : "Once a year"}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <Button
              onClick={() =>
                canConfirm &&
                onSend({
                  membershipType: membershipType as "single" | "couple",
                  billingFrequency: billingFrequency as "monthly" | "annual",
                })
              }
              disabled={!canConfirm || send.isPending}
              data-testid="switch-plan-confirm"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Create the link for this plan
            </Button>
          </div>
        )}

        {/* NOTHING HERE SAYS "MOVED". They are moved when Stripe says they paid, and the badge
            above says "waiting for payment" until then. */}
        {result?.url && (
          <div className="space-y-3 rounded-lg border p-3" data-testid="switch-link-result">
            <p className="text-sm font-medium">The link — read it out if nothing else lands</p>
            <div className="flex gap-2">
              <Input readOnly value={result.url} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copy} aria-label="Copy the link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <ul className="space-y-1 text-sm text-muted-foreground">
              {result.delivery.map((d) => (
                <li key={d.channel}>
                  {d.channel === "sms" ? "Text" : "Email"}:{" "}
                  {d.outcome === "sent" ? `sent to ${d.to}` : d.outcome.replace(/_/g, " ")}
                  {d.detail ? ` — ${d.detail}` : ""}
                </li>
              ))}
            </ul>

            {cardOnly && (
              <p className="flex items-start gap-2 text-sm text-amber-600" data-testid="switch-card-only">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Card only — direct debit is switched off until an admin confirms the Stripe
                webhook listens for the SEPA events (Settings → Payments). Most of these members
                have paid by direct debit for years, so this is worth clearing before a bulk run.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
