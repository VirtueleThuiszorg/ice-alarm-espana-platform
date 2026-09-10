import type { Database } from "@/integrations/supabase/types";
import type { SupportActionKey } from "@/lib/supportActions";

/**
 * WHAT THE MEMBERSHIP PAGE SHOULD SAY WHEN THERE IS NO ACTIVE SUBSCRIPTION.
 *
 * R8 says: *"Empty states offer the action. 'No active subscription' shows the plans."*
 * Taken literally that is wrong for five of the seven `subscription_status` values, and
 * dangerously wrong for two of them.
 *
 * `useMemberSubscription()` queries `.eq("status", "active")`, so a member whose subscription is
 * `paused`, `past_due`, `suspended`, `cancelled`, `expired` or `pending` gets `null` — the same
 * `null` as somebody who never joined. The page could not tell them apart, so it said one thing
 * to all of them.
 *
 * **A member in arrears sent to the plans is a member about to pay twice.** They already have a
 * subscription; what they need is to fix the payment on the one they have. And it is worse than
 * a wasted payment, because of where "the plans" leads:
 *
 * ── WHY THE ACTION IS NEVER `/join` ────────────────────────────────────────────────────────
 *
 * `/join` has no idea anybody is signed in. It ends at `submit-registration`, which calls
 * `submit_registration_atomic`, which **INSERTs a new `members` row** — no lookup of an existing
 * member, no `user_id` link. A signed-in member who goes through it comes out with a *second*
 * member record: a second medical record, a second set of emergency contacts, a second Stripe
 * customer. On a life-safety product that is not a billing annoyance. It is two records for one
 * person, and an operator with an SOS on screen opening the wrong one.
 *
 * So the plans are SHOWN — prices, what is included, which is the informative half of R8 and the
 * thing a member actually wants to see — and the action opens a prefilled support request. A
 * human sets the subscription up and takes the payment. There is no member-initiated checkout
 * for an existing account and building one is new Stripe money-movement code against a real
 * card, which is the same line WP7 stopped at. `PENDING_FOR_LEE.md` D-12 puts it to Lee.
 *
 * ── AND `monitored` IS THE FIELD THAT MATTERS ──────────────────────────────────────────────
 *
 * Every condition here except `active` means **nobody is watching**. A member reading a page
 * about billing states has to be told that, in the first sentence, not left to infer it from the
 * word "paused". `monitored` is on every spec so that a condition added later cannot quietly
 * default to "yes, you are covered".
 */

export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

export type MembershipCondition =
  /** An active subscription. The page renders the record. */
  | "active"
  /**
   * `members.status = 'active'` with `billing_source = 'legacy'` — monitored, and billed
   * outside Stripe.
   *
   * A separate condition and not a flavour of `active`, because the two differ in exactly the
   * place this module exists to get right: an operator IS watching, and there is no subscription
   * row to render, no renewal date to show and no payment for the member to fix. Folding it into
   * `active` would send the page looking for a plan name that does not exist; folding it into
   * `never_joined` would show the plans to somebody who has been a member since 2014 and tell
   * them nobody is watching.
   */
  | "legacy_billing"
  /** No subscription row at all. The only condition that shows the plans. */
  | "never_joined"
  /** `pending` — a subscription exists, the payment has not been confirmed. */
  | "awaiting_payment"
  | "paused"
  /** `past_due` — a payment failed. */
  | "in_arrears"
  | "suspended"
  /** `cancelled` or `expired` — over, whichever way it ended. */
  | "ended"
  /**
   * The subscription could not be read, or has a NULL status.
   *
   * NOT folded into `never_joined`: a failed read rendered as "you have never joined" invites
   * the member to join again, and `status` is a nullable column, so this is reachable from real
   * data and not only from a network error. Same rule as `readinessGap()`'s `unknown` — a
   * missing value is never quietly read as a zero.
   */
  | "unknown";

/**
 * Every `subscription_status` maps to exactly one condition.
 *
 * A `Record` over the enum, so widening the enum is a compile error here rather than a value
 * that silently falls through to whatever the default branch was.
 */
export const STATUS_CONDITION: Record<SubscriptionStatus, MembershipCondition> = {
  active: "active",
  pending: "awaiting_payment",
  paused: "paused",
  past_due: "in_arrears",
  suspended: "suspended",
  cancelled: "ended",
  expired: "ended",
};

export interface MembershipConditionSpec {
  condition: MembershipCondition;
  /**
   * Is an operator watching right now?
   *
   * REQUIRED on every spec, not optional. See the module comment: a condition added later must
   * not inherit "covered" because nobody thought about it.
   */
  monitored: boolean;
  /**
   * Does the page show the plans and their prices? R8 — and only for a member who has no
   * subscription at all. See the module comment for why the other six do not.
   */
  showsPlans: boolean;
  /** The single action offered, as a support route. `null` for `active`, which is the record. */
  action: SupportActionKey | null;
  title: { key: string; fallback: string };
  /** What is true, and what happens next. Never "contact support to change" (R6). */
  body: { key: string; fallback: string };
}

export const MEMBERSHIP_CONDITIONS = [
  {
    condition: "legacy_billing",
    // Monitored. This is the whole point of the state: they wear the pendant tonight.
    monitored: true,
    // No plans. They have a membership; showing prices invites a second payment.
    showsPlans: false,
    /* A route to a human, unlike `active`. `active` offers none because the page renders the
       record — the plan, the renewal date, the payment method. A legacy member has NO
       subscription row, so there is nothing to render and a billing question has nowhere to go.
       `update_payment` is the nearest true thing: it opens a prefilled support request, and a
       human answers it. */
    action: "update_payment",
    title: {
      key: "subscription.condition.legacyTitle",
      fallback: "Your membership is active",
    },
    body: {
      key: "subscription.condition.legacyBody",
      fallback:
        "An operator answers your alarm, day and night. Your payments are handled directly with our office rather than online.",
    },
  },
  {
    condition: "active",
    monitored: true,
    showsPlans: false,
    action: null,
    title: { key: "subscription.condition.activeTitle", fallback: "Your membership is active" },
    body: {
      key: "subscription.condition.activeBody",
      fallback: "An operator answers your alarm, day and night.",
    },
  },
  {
    condition: "never_joined",
    monitored: false,
    showsPlans: true,
    action: "start_membership",
    title: { key: "subscription.condition.neverJoinedTitle", fallback: "You have no membership yet" },
    body: {
      key: "subscription.condition.neverJoinedBody",
      fallback:
        "Nobody is monitoring an alarm for you today. Here is what a membership costs — tell us which one you want and we will set it up with you and take the payment.",
    },
  },
  {
    condition: "awaiting_payment",
    monitored: false,
    showsPlans: false,
    action: "start_membership",
    title: {
      key: "subscription.condition.awaitingPaymentTitle",
      fallback: "We are still waiting for your payment",
    },
    body: {
      key: "subscription.condition.awaitingPaymentBody",
      fallback:
        "Your membership is set up but the payment has not reached us, so monitoring has not started. If you think you have paid, tell us and we will find it.",
    },
  },
  {
    condition: "paused",
    monitored: false,
    showsPlans: false,
    action: "restart_membership",
    title: { key: "subscription.condition.pausedTitle", fallback: "Your membership is paused" },
    body: {
      key: "subscription.condition.pausedBody",
      fallback:
        "While it is paused nobody is monitoring your alarm and you are not being charged. Ask us and we will start it again.",
    },
  },
  {
    condition: "in_arrears",
    monitored: false,
    showsPlans: false,
    action: "update_payment",
    title: { key: "subscription.condition.inArrearsTitle", fallback: "A payment did not go through" },
    body: {
      key: "subscription.condition.inArrearsBody",
      fallback:
        "Monitoring has stopped until the payment is settled. Send us a message and we will sort the card out with you — please do not sign up again, you already have a membership.",
    },
  },
  {
    condition: "suspended",
    monitored: false,
    showsPlans: false,
    action: "restart_membership",
    title: { key: "subscription.condition.suspendedTitle", fallback: "Your membership is suspended" },
    body: {
      key: "subscription.condition.suspendedBody",
      fallback:
        "Nobody is monitoring your alarm at the moment. Send us a message and we will tell you why and what it takes to start it again.",
    },
  },
  {
    condition: "ended",
    monitored: false,
    showsPlans: false,
    action: "restart_membership",
    title: { key: "subscription.condition.endedTitle", fallback: "Your membership has ended" },
    body: {
      key: "subscription.condition.endedBody",
      fallback:
        "Nobody is monitoring your alarm. We still have your details, so starting again is a short conversation rather than signing up from scratch.",
    },
  },
  {
    condition: "unknown",
    monitored: false,
    showsPlans: false,
    action: "restart_membership",
    title: {
      key: "subscription.condition.unknownTitle",
      fallback: "We could not load your membership",
    },
    body: {
      key: "subscription.condition.unknownBody",
      fallback:
        "This is a problem at our end, not something you have done. Try again in a moment — and if it keeps happening, tell us, because we would rather know.",
    },
  },
] as const satisfies readonly MembershipConditionSpec[];

/**
 * Compile-time: every condition in the union has a spec.
 *
 * `as const satisfies` above, never an annotation — an explicit `: readonly
 * MembershipConditionSpec[]` widens `condition` to the whole union and this check passes no
 * matter what the array contains. That is not a hypothetical; it is how `medicalFields.ts`
 * shipped a decorative ratchet on its first attempt, found by deleting a field and watching
 * nothing break.
 */
type CoveredCondition = (typeof MEMBERSHIP_CONDITIONS)[number]["condition"];
type UncoveredCondition = Exclude<MembershipCondition, CoveredCondition>;
const _everyConditionHasCopy: UncoveredCondition extends never ? true : never = true;
void _everyConditionHasCopy;

/** The subscription fields this module reads. Deliberately tiny. */
export interface MembershipSubscriptionRow {
  status: SubscriptionStatus | null;
}

/** The two member columns that decide whether somebody is monitored without paying us online. */
export interface LegacyBillingMember {
  status: Database["public"]["Enums"]["member_status"] | null;
  billing_source: string | null;
}

/**
 * The condition, from the member's most recent subscription of ANY status.
 *
 * `undefined` means the query has not produced an answer (still loading, or it failed) and maps
 * to `unknown`. `null` means the query answered and there is no subscription row — the one case
 * that is genuinely "never joined". Collapsing the two is the defect this signature exists to
 * prevent.
 */
export function membershipCondition(
  latest: MembershipSubscriptionRow | null | undefined,
  member?: LegacyBillingMember | null,
): MembershipCondition {
  /* LEGACY IS CHECKED FIRST, and before the loading case.
     A legacy member has NO subscription row, so every branch below would answer either
     `never_joined` (the plans, and "nobody is watching") or `unknown` — for somebody who is
     monitored right now. The member row is the authority on whether an operator is watching;
     the subscription is the authority on billing, and these people have no billing here. */
  if (member && member.billing_source === "legacy" && member.status === "active") {
    return "legacy_billing";
  }
  if (latest === undefined) return "unknown";
  if (latest === null) return "never_joined";
  if (latest.status === null) return "unknown";
  return STATUS_CONDITION[latest.status] ?? "unknown";
}

/**
 * Whether renewal, dunning or a payment-failed notice may fire for this member.
 *
 * `false` for a legacy member, and that is the reason `billing_source` exists rather than a
 * status value: a legacy member IS active, so anything keyed on status alone would start
 * chasing them for a card this platform has never held.
 */
export function hasPlatformBilling(member: LegacyBillingMember | null | undefined): boolean {
  return member?.billing_source === "stripe";
}

export function membershipConditionSpec(condition: MembershipCondition): MembershipConditionSpec {
  const spec = MEMBERSHIP_CONDITIONS.find((c) => c.condition === condition);
  // Unreachable while the ratchet above compiles; thrown rather than defaulted, because a
  // silent fallback here would show one member's copy to another member's situation.
  if (!spec) throw new Error(`no copy for membership condition: ${condition}`);
  return spec;
}
