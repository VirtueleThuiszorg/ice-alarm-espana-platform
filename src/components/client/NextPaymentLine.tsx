import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { enGB } from "date-fns/locale";
import { CalendarClock } from "lucide-react";
import { membershipCondition } from "@/lib/membershipCondition";
import { toDate } from "@/lib/formatDate";
import type { SubscriptionInfo } from "@/hooks/useMemberProfile";

/**
 * "NEXT PAYMENT 14 OCT", under the member's name.
 *
 * Lee asked for the next payment date at the top of the dashboard. The whole of this component
 * is the decision about WHEN NOT TO SAY IT, because on this page a date is a promise: it appears
 * directly beneath "Welcome back, Rosa", above a checklist whose job is to tell her the truth
 * about her own cover.
 *
 * ── IT DERIVES THE STATE, IT DOES NOT RE-DECIDE IT ──────────────────────────
 *
 * `membershipCondition()` owns "what does this subscription mean for the member", and this asks
 * it rather than reading `status` — the same rule `protectionChecklist.ts` follows, for the same
 * reason: two places deciding what `past_due` means is one place that will eventually disagree
 * with the other, and the member would be reading both at once, six inches apart.
 *
 * So the line renders in exactly ONE case: `active`, with a renewal date on the row. Every other
 * condition renders NOTHING, and each of them has a reason:
 *
 *   legacy_billing        monitored, billed outside Stripe, no subscription row and no renewal
 *                         date. Any date here would be invented.
 *   switching_to_stripe   a link is out and unpaid; the date it would renew is not yet a fact.
 *   awaiting_payment      nothing has been taken yet.
 *   in_arrears            a payment FAILED. "Next payment 14 Oct" in the header while the rung
 *                         below says a payment failed is the page contradicting itself, and the
 *                         cheerful half is the one in the larger type.
 *   paused / suspended / ended / never_joined / unknown
 *                         nothing is scheduled, or we do not know that anything is.
 *
 * The Membership rung of the protection checklist already words every one of those, and words
 * them as the member's next action. This line is not a second, shorter, less careful version.
 *
 * ── LOADING IS NOT "NONE", AND IT IS NOT AN EM DASH EITHER ──────────────────
 *
 * While the query is in flight this renders null: no skeleton, no "—". This is one short phrase
 * under a name, so a placeholder there flickers on every page load; and "Next payment —" reads
 * as a fact about the member's account rather than about our network. Same rule as
 * `readinessGap()`'s `unknown` and the emergency-contact banner in ICE_OPERATOR_CARD_SPEC §5.1.2:
 * a thing we have not established yet is not rendered as an established nothing.
 *
 * ── WHO IS ACTUALLY BEING CHARGED ───────────────────────────────────────────
 *
 * `payer_id` non-null means somebody else pays — usually an adult child. Telling that member
 * "next payment 14 October" implies money is about to leave THEIR account, which it is not. RLS
 * means we cannot name the payer from here (SubscriptionPage's who-pays comment,
 * PENDING_FOR_LEE D-13), so the line says that it is paid for them and stops there.
 *
 * ── WHY IT IS NOT A LINK, A BADGE, OR RED ───────────────────────────────────
 *
 * Not a Link: the Membership rung below already carries the route to /dashboard/membership, and
 * a second one competing with it splits a single destination across two controls.
 * Not a badge and not coloured: R2 keeps brand red for the page's one action, and this is a
 * status. Inline, muted, and it inherits the subtitle's 16px — R10's floor, so it is not shrunk
 * to `text-sm` to make it look neater.
 *
 * NOT SHOWING THE AMOUNT is deliberate and Lee's call to revisit: "€27.49 on 14 Oct" is more
 * useful and it puts a figure under the member's name on a screen family members read over their
 * shoulder. Adding it later is one interpolation.
 */

export interface NextPaymentLineProps {
  /** The member's most recent subscription of any status. `undefined` while unknown. */
  subscription: SubscriptionInfo | null | undefined;
  /** True while the subscription query is in flight. Renders nothing — see above. */
  loading: boolean;
  /**
   * The date-fns locale the rest of the header is formatted in, passed in rather than decided
   * here so the two dates in this subtitle cannot disagree about which language they are in.
   */
  dateLocale?: Locale;
}

export function NextPaymentLine({ subscription, loading, dateLocale = enGB }: NextPaymentLineProps) {
  const { t } = useTranslation();

  if (loading) return null;
  if (membershipCondition(subscription) !== "active") return null;

  // `toDate` rather than `new Date(...)`: a null renewal_date is the Unix epoch to the Date
  // constructor, and "Next payment 1 Jan 1970" is worse than no line at all.
  const due = toDate(subscription?.renewal_date);
  if (!due) return null;

  const date = format(due, "d MMM yyyy", { locale: dateLocale });
  const paidBySomebodyElse = subscription?.payer_id != null;

  return (
    <span className="inline-flex items-center gap-1.5" data-testid="next-payment-line">
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {paidBySomebodyElse
        ? t("dashboard.nextPaymentPaidForYou", {
            defaultValue: "Next payment {{date}} · paid for you",
            date,
          })
        : t("dashboard.nextPayment", { defaultValue: "Next payment {{date}}", date })}
    </span>
  );
}
