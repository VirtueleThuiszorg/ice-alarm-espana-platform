/**
 * The `fulfilment_state` machine, mirrored for the UI — and only for the UI.
 *
 * WHAT THIS FILE IS NOT
 *
 * It is not the rule. The rule is `enforce_fulfilment_state()`, a BEFORE UPDATE trigger
 * (20260907100000, corrected by 20260907110100). Everything asserted here is asserted there
 * too, and there is where it BITES: RLS decides whether you may write the row, never which
 * value you may write, so anyone with a session and the anon key can PATCH
 * `/rest/v1/orders?id=eq.…` with any value in the enum. FULFILMENT_MODEL.md §1-E.
 *
 * This module exists so the SCREEN agrees with the trigger instead of guessing. `orderStatus.ts`
 * had to be written because three layers hand-listed the same five values and all three drifted
 * when a migration added two more; the fix there was to derive from the generated enum and refuse
 * to compile on a value nobody has handled. Same discipline here, from the first line, because
 * this enum is younger than that lesson.
 *
 * The consequence of getting it wrong is not a cosmetic one. Offering a staff member a button
 * the trigger will refuse teaches them the screen is unreliable; hiding a button the trigger
 * would accept leaves a paid member's pendant stuck. Both are worse than either alone.
 */
import type { Database } from "@/integrations/supabase/types";
import type { OrderStatus } from "@/lib/orderStatus";

export type FulfilmentState = Database["public"]["Enums"]["fulfilment_state"];
type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * The ranked sequence — the seven states that are a PLACE in fulfilment, in order.
 *
 * `cancelled` is deliberately absent: `fulfilment_state_rank()` returns NULL for it, because it
 * is not a point on the line. An order can reach it from anywhere and leaving it is a correction
 * like any other. Keeping it out of this array is what makes `fulfilmentRank` honest.
 */
export const FULFILMENT_SEQUENCE = [
  // An order exists from the moment the wizard is submitted, which is BEFORE the customer has
  // paid. It used to start at `paid` (20260907100000's DEFAULT), so an abandoned checkout
  // entered the fulfilment queue and `awaiting_allocation` counted it — REVIEW_JOIN_PATH.md F14.
  "awaiting_payment",
  "paid",
  "allocated",
  "programmed",
  "dispatched",
  "delivered",
  "tested",
] as const satisfies readonly FulfilmentState[];

export type SequencedFulfilmentState = (typeof FULFILMENT_SEQUENCE)[number];

/** Every value, sequence first then the one that means "stopped". */
export const FULFILMENT_STATES = [...FULFILMENT_SEQUENCE, "cancelled"] as const satisfies
  readonly FulfilmentState[];

/**
 * Compile-time exhaustiveness, the `orderStatus.ts` guard. If a migration adds a value to
 * `fulfilment_state` and `types.ts` is regenerated, this stops compiling until somebody decides
 * whether the new value is a place in the sequence or another `cancelled`. A runtime test cannot
 * catch it: the missing value simply never appears in a fixture.
 */
type Uncovered = Exclude<FulfilmentState, (typeof FULFILMENT_STATES)[number]>;
const _everyStateIsHandled: Uncovered extends never ? true : never = true;
void _everyStateIsHandled;

/**
 * `public.fulfilment_state_rank()`, in TypeScript. NULL there, `null` here — for `cancelled`
 * only. Callers must handle `null` rather than coercing it to 0, which would make `cancelled`
 * read as "before paid" and every move out of it look like progress.
 */
export function fulfilmentRank(state: FulfilmentState): number | null {
  const i = FULFILMENT_SEQUENCE.indexOf(state as SequencedFulfilmentState);
  return i === -1 ? null : i + 1;
}

/**
 * The trigger's `needs_authority`, verbatim in its four clauses:
 *   NEW = cancelled  OR  OLD = cancelled  OR  NEW = paid  OR  new_rank < old_rank
 *
 * This is what needs a D9 role, a NEW reason, and an activity_logs row. Getting the predicate
 * wrong in the UI means either asking for a reason nobody needs or, worse, not asking for one
 * and letting the write fail with a database error the member's operator has to read.
 *
 * `NEW = paid` is the fourth clause and the newest. It is not a backward move: it is the one
 * forward move that ASSERTS SOMETHING ABOUT MONEY, and everything else in the sequence asserts
 * something about a device that a person can check by looking at it. Before `awaiting_payment`
 * existed there was nothing below `paid`, so "entering paid" was not a move at all; now that it
 * is, an ungoverned one would be a free membership granted by a dropdown. The payment path
 * satisfies it with the service role and a reason naming the payment.
 *
 * The name stays `isFulfilmentCorrection` because that is what every caller asks it — "does
 * this move need the correction dialog" — and the answer is unchanged for all seven of the
 * moves it already covered.
 */
export function isFulfilmentCorrection(from: FulfilmentState, to: FulfilmentState): boolean {
  if (from === to) return false;
  if (to === "cancelled" || from === "cancelled") return true;
  if (to === "paid") return true;
  const fromRank = fulfilmentRank(from);
  const toRank = fulfilmentRank(to);
  // Both are non-null here: neither is `cancelled` by the branch above. The guard is for the
  // day someone adds a third unranked value and this function is the first thing to notice.
  if (fromRank === null || toRank === null) return true;
  return toRank < fromRank;
}

/**
 * The ONE forward move out of each state, or null where there is nothing ahead.
 *
 * One step, never more: the trigger raises `check_violation` on a skip, because each state is a
 * claim somebody could check and `paid → dispatched` asserts three of them with evidence for
 * none. `tested` is the end of the line; `cancelled` has no forward move at all — leaving it is
 * a correction, which is a different affordance with a different dialog.
 */
export function nextFulfilmentState(
  state: FulfilmentState,
): Exclude<FulfilmentState, "awaiting_payment"> | null {
  const rank = fulfilmentRank(state);
  if (rank === null) return null;
  // `rank` is 1-based, so index `rank` is the state AFTER this one and index 0 is unreachable.
  // `awaiting_payment` is therefore never a return value — which is why it is excluded from the
  // return type rather than left in it and handled by every caller. Nobody moves an order INTO
  // it; an order starts there. `paid` used to be excluded here for that same reason, and no
  // longer is: `awaiting_payment → paid` is a real forward move, made by the payment path.
  return (
    (FULFILMENT_SEQUENCE[rank] as Exclude<FulfilmentState, "awaiting_payment"> | undefined) ?? null
  );
}

/**
 * WHO OWNS EACH TRANSITION. This is the part a label table cannot express, and the part the
 * brief is most specific about.
 *
 *   allocated   a device is assigned, and the assignment is the transition. `post-payment.ts`
 *               does it on payment; the device-allocation screen does it when stock arrives.
 *               Never a bare "mark as allocated" button — that would claim a device is reserved
 *               when none is.
 *   programmed  "the ProvisioningChecklist's steps are all complete — COMPLETING THE CHECKLIST
 *               IS THE TRANSITION, NOT A SEPARATE BUTTON." A button here would let staff assert
 *               a pendant is configured without configuring it.
 *   dispatched  staff action, "Collected for delivery".
 *   delivered   staff action; a courier webhook later.
 *   tested      operator action, "Test call completed". The trigger REFUSES this state without
 *               a resolvable staff id, because the whole content of the state is that a named
 *               person answered.
 */
export type FulfilmentTransitionOwner =
  /** The payment webhook, through post-payment.ts. Never a person, never a button. */
  | "payment"
  | "allocation"
  | "checklist"
  | "staff"
  | "operator";

export const FULFILMENT_TRANSITION_OWNER: Record<
  Exclude<FulfilmentState, "awaiting_payment" | "cancelled">,
  FulfilmentTransitionOwner
> = {
  // Golden rule 4's shape, one column over: a member is activated by the payment webhook and
  // never by client-side code, and the order's claim that money arrived belongs to the same
  // actor. The only human route in is the correction dialog, which demands a reason — for the
  // bank transfer that arrived outside Stripe.
  paid: "payment",
  allocated: "allocation",
  programmed: "checklist",
  dispatched: "staff",
  delivered: "staff",
  tested: "operator",
};

/**
 * The states a human may move an order INTO from a menu.
 *
 * Derived from the owner table rather than listed again, so the two cannot disagree: the two
 * transitions that are side-effects of doing the real work (`allocated`, `programmed`) are
 * excluded by construction, not by being left out of a second list somebody has to remember.
 */
export const STAFF_MOVABLE_STATES = (
  Object.entries(FULFILMENT_TRANSITION_OWNER) as [
    Exclude<FulfilmentState, "awaiting_payment" | "cancelled">,
    FulfilmentTransitionOwner,
  ][]
)
  .filter(([, owner]) => owner === "staff" || owner === "operator")
  .map(([state]) => state);

/** Is this forward move one a staff member may make from a menu? */
export function isStaffMovableTransition(from: FulfilmentState, to: FulfilmentState): boolean {
  if (nextFulfilmentState(from) !== to) return false;
  return (STAFF_MOVABLE_STATES as FulfilmentState[]).includes(to);
}

/**
 * D9, derived from `app_role` so a new role cannot be added to the database without somebody
 * deciding here whether it may correct a fulfilment state. `may_reverse_fulfilment()` is the
 * enforcement; this is the affordance.
 *
 * A `Record<AppRole, boolean>` rather than a set of allowed values, for exactly that reason: an
 * added enum value stops the build instead of silently defaulting to "not allowed", which would
 * look like a working screen with a missing button.
 */
export const MAY_CORRECT_FULFILMENT: Record<AppRole, boolean> = {
  super_admin: true,
  admin: true,
  call_centre_supervisor: true,
  call_centre: false,
};

export function mayCorrectFulfilment(role: AppRole | null | undefined): boolean {
  return role ? MAY_CORRECT_FULFILMENT[role] === true : false;
}

/**
 * i18n keys with English fallbacks inline, the `orderStatus.ts` convention. Not new keys in
 * `src/i18n/locales/*.json`: CLAUDE.md's merging rules make every locale change a serial merge,
 * and this work package touches several screens. The keys are named so the strings can be lifted
 * into the locale files in one later PR without touching any of these call sites.
 */
export const FULFILMENT_LABEL: Record<FulfilmentState, { key: string; fallback: string }> = {
  awaiting_payment: {
    key: "admin.fulfilment.awaitingPayment",
    fallback: "Awaiting payment",
  },
  paid: { key: "admin.fulfilment.paid", fallback: "Paid" },
  allocated: { key: "admin.fulfilment.allocated", fallback: "Device allocated" },
  programmed: { key: "admin.fulfilment.programmed", fallback: "Programmed" },
  dispatched: { key: "admin.fulfilment.dispatched", fallback: "Dispatched" },
  delivered: { key: "admin.fulfilment.delivered", fallback: "Delivered" },
  tested: { key: "admin.fulfilment.tested", fallback: "Tested" },
  cancelled: { key: "admin.fulfilment.cancelled", fallback: "Cancelled" },
};

/**
 * The wording on the BUTTON, which is not the name of the state.
 *
 * "Mark as tested" describes a database write. "Test call completed" describes the thing the
 * operator just did, and the difference matters because the second is checkable: an operator who
 * has not made a call will not press it. The brief names two of these verbatim ("Collected for
 * delivery", "Test call completed"); the rest follow their register.
 *
 * Only the states a human moves an order into appear here. `paid` is where an order starts.
 */
export const FULFILMENT_ACTION_LABEL: Record<
  Exclude<FulfilmentState, "awaiting_payment">,
  { key: string; fallback: string }
> = {
  // Reached only through the correction dialog, which asks for a reason. There is no menu item
  // that moves an order into `paid`: the payment webhook does it, or a supervisor records a
  // payment that arrived another way and says so.
  paid: { key: "admin.fulfilment.action.paid", fallback: "Record payment received" },
  allocated: { key: "admin.fulfilment.action.allocated", fallback: "Allocate a device" },
  programmed: { key: "admin.fulfilment.action.programmed", fallback: "Finish provisioning" },
  dispatched: {
    key: "admin.fulfilment.action.dispatched",
    fallback: "Collected for delivery",
  },
  delivered: { key: "admin.fulfilment.action.delivered", fallback: "Delivered to member" },
  tested: { key: "admin.fulfilment.action.tested", fallback: "Test call completed" },
  cancelled: { key: "admin.fulfilment.action.cancelled", fallback: "Cancel this order" },
};

/**
 * What each state MEANS, for the staff member deciding whether it is true yet. Shown next to the
 * action, because "dispatched" is not self-explanatory and a state asserted wrongly is a paid
 * member whose pendant nobody is looking for.
 */
export const FULFILMENT_MEANING: Record<FulfilmentState, { key: string; fallback: string }> = {
  awaiting_payment: {
    key: "admin.fulfilment.meaning.awaitingPayment",
    fallback:
      "The registration was submitted but no payment has cleared. Nothing to fulfil yet, and nobody to chase but the checkout.",
  },
  paid: {
    key: "admin.fulfilment.meaning.paid",
    fallback: "Payment cleared. No device assigned yet.",
  },
  allocated: {
    key: "admin.fulfilment.meaning.allocated",
    fallback: "A specific pendant is reserved for this member and has left stock.",
  },
  programmed: {
    key: "admin.fulfilment.meaning.programmed",
    fallback: "The pendant is configured: SIM, server, SOS number, and both tests passed.",
  },
  dispatched: {
    key: "admin.fulfilment.meaning.dispatched",
    fallback: "Collected for delivery and on its way to the member.",
  },
  delivered: {
    key: "admin.fulfilment.meaning.delivered",
    fallback: "In the member's hands. This is what pays the partner commission.",
  },
  tested: {
    key: "admin.fulfilment.meaning.tested",
    fallback:
      "The member pressed the button at home and a named operator answered. This is half of monitoring readiness.",
  },
  cancelled: {
    key: "admin.fulfilment.meaning.cancelled",
    fallback: "This order is not being fulfilled. Any pending commission is cancelled with it.",
  },
};

/**
 * Badge treatment. `tested` is the only one that reads as finished, because it is the only one
 * that means the member is actually protected — `delivered` is a pendant in a drawer until
 * somebody presses it. `cancelled` is destructive-toned; nothing else is, because an order
 * halfway down the sequence is progress, not a problem.
 */
export const FULFILMENT_BADGE: Record<FulfilmentState, string> = {
  // Deliberately the flattest treatment of the eight: an unpaid order is not progress and not a
  // problem, it is a checkout somebody may still finish.
  awaiting_payment: "bg-muted text-muted-foreground border-border",
  paid: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  allocated: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  programmed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  dispatched: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  delivered: "bg-teal-500/10 text-teal-700 border-teal-500/30",
  tested: "bg-alert-resolved/15 text-alert-resolved border-alert-resolved/30 font-semibold",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * `awaiting_stock` IS NOT A STATE — increment 6.
 *
 * FULFILMENT_MODEL.md §2, in as many words: *"`awaiting_stock` is not a state in this machine.
 * It is `paid` with a failed allocation — a CONDITION, not a place in the sequence. Modelling it
 * as a sequence state is what let it become invisible in 1-B. It should be a flag or a queue,
 * and the order should still read `paid`."*
 *
 * So it is derived, here, from two facts that are already recorded:
 *
 *   `fulfilment_state = 'paid'`        the order has not been allocated
 *   `orders.status = 'awaiting_stock'` `post-payment.ts` TRIED to allocate and found no free
 *                                      EV-07B — that status value is the record of the attempt
 *
 * Both matter. An order that is merely `paid` may simply not have reached the allocation desk;
 * one that is `paid` AND `awaiting_stock` is a paid member whose pendant could not be reserved,
 * and somebody has to buy stock. Those are different pieces of work and a screen that shows one
 * number for both tells nobody what to do.
 *
 * WHY NOT A NEW COLUMN. There is nothing to record that is not already recorded, and a boolean
 * `is_awaiting_stock` would be a third thing to keep in step with the other two. A derived
 * condition cannot drift from the facts it is derived from.
 */
export type FulfilmentCondition =
  /** Paid, no device, and the allocator found no stock. Somebody has to buy pendants. */
  | "awaiting_stock"
  /** Paid, no device, and nobody has tried yet. Somebody has to allocate one. */
  | "awaiting_allocation"
  /** Nothing outstanding that this pair of columns can express. */
  | "none";

export function fulfilmentCondition(order: {
  fulfilment_state: FulfilmentState | null;
  status: OrderStatus | null;
}): FulfilmentCondition {
  // Only a `paid` order can be awaiting anything. Past that rung a device is assigned, and an
  // order at `dispatched` whose status still reads `awaiting_stock` is DRIFT rather than a
  // condition — flagged as drift, which is a different and louder thing.
  //
  // BELOW that rung there is nothing to allocate either: an `awaiting_payment` order is not work
  // for the fulfilment desk, and counting it as `awaiting_allocation` is precisely the defect
  // F14 describes — staff chasing pendants for people who never paid.
  if (order.fulfilment_state !== "paid") return "none";
  if (order.status === "awaiting_stock") return "awaiting_stock";
  return "awaiting_allocation";
}

export const FULFILMENT_CONDITION_LABEL: Record<
  Exclude<FulfilmentCondition, "none">,
  { key: string; fallback: string; work: { key: string; fallback: string } }
> = {
  awaiting_stock: {
    key: "admin.fulfilment.condition.awaitingStock",
    fallback: "Awaiting stock",
    work: {
      key: "admin.fulfilment.condition.awaitingStockWork",
      fallback:
        "This member has paid and there was no free pendant to reserve. Buy stock, then allocate one from their record.",
    },
  },
  awaiting_allocation: {
    key: "admin.fulfilment.condition.awaitingAllocation",
    fallback: "Needs a pendant",
    work: {
      key: "admin.fulfilment.condition.awaitingAllocationWork",
      fallback: "Allocate a pendant from this member's record. That is what moves the order on.",
    },
  },
};

/**
 * The trigger's refusals, translated once.
 *
 * PostgREST hands a React component the raw `RAISE EXCEPTION` message. Those messages are written
 * for the developer reading a log, and three of the five are conditions the UI is supposed to
 * have prevented — so showing them raw to an operator mid-shift is both unhelpful and an
 * admission. Matched on the distinctive fragment of each message rather than on ERRCODE, because
 * two of them share `check_violation`.
 *
 * The fallback returns the raw message rather than a generic "something went wrong": an
 * unrecognised database refusal is a bug in this file, and hiding it would hide the bug.
 */
export function describeFulfilmentError(message: string): { title: string; body: string } {
  if (message.includes("cannot skip")) {
    return {
      title: "That would skip a step",
      body: "Fulfilment moves one state at a time. Move it to the next state first.",
    };
  }
  if (message.includes("needs a NEW fulfilment_state_reason")) {
    return {
      title: "A correction needs a reason",
      body: "Say why this order is moving back, in your own words. The previous reason cannot be reused.",
    };
  }
  if (message.includes("D9")) {
    return {
      title: "Your role cannot correct a fulfilment state",
      body: "Moving an order backwards or cancelling it needs a supervisor or an admin. Ask one to do it, or ask for the reason to be recorded.",
    };
  }
  if (message.includes("requires tested_by")) {
    return {
      title: "We could not record who made the test call",
      body: "This state means a named operator answered. Your account is not linked to an active staff record, so it cannot be recorded against you.",
    };
  }
  if (message.includes("partner commission is already")) {
    return {
      title: "The partner has already been paid for this delivery",
      body: "Reversing a released or paid commission is a finance decision, not a data correction. Cancel or claw back the commission first.",
    };
  }
  return { title: "The change was refused", body: message };
}

/**
 * `fulfilment_state` → the `orders.status` that means the same thing, or null where the
 * fulfilment state is finer-grained than `orders.status` can express.
 *
 * `programmed` and `tested` map to nothing, and that is the honest answer rather than a gap:
 * `orders.status` has no value for "configured" and none for "the member has pressed it". An
 * order in `tested` stays `delivered`, which is exactly what the commission path should see.
 */
export const FULFILMENT_TO_ORDER_STATUS: Record<FulfilmentState, OrderStatus | null> = {
  // `pending` is what submit_registration_atomic already writes, so this pair agrees from the
  // start rather than needing a reconciliation on the first move.
  awaiting_payment: "pending",
  paid: null,
  allocated: "processing",
  programmed: null,
  dispatched: "shipped",
  delivered: "delivered",
  tested: null,
  cancelled: "cancelled",
};
