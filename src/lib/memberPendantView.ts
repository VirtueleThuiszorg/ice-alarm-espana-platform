import { fulfilmentCondition, type FulfilmentState } from "@/lib/fulfilmentState";
import type { OrderStatus } from "@/lib/orderStatus";

/**
 * WHAT TO SAY TO A MEMBER ABOUT THEIR PENDANT — one derivation, so the page cannot contradict
 * the fulfilment desk.
 *
 * THE DEFECT THIS EXISTS FOR, and it is a sentence rather than a layout. `DevicePage` decided
 * between three branches on `subscription?.has_pendant && device`, and the branch a member fell
 * into was the subtitle they read. A member with a paid pendant order and no device row yet fell
 * into the branch titled **"Phone-Only membership"** — told they had chosen a service they had
 * paid to leave, on the screen they open when they are worried about whether their alarm works.
 * WP4 fixed the worst of it (the sales card) by adding a fourth branch; the words were still
 * decided by a boolean that cannot tell "never bought one" from "bought one, waiting".
 *
 * So the question "which member is this?" is answered here, once, from the same two columns the
 * staff queue reads (`orders.fulfilment_state` and `orders.status`, via `fulfilmentCondition`).
 * A member cannot be told their pendant is being prepared while the desk shows no stock, and
 * cannot be called phone-only while an order exists — which is the rule this module is for.
 *
 * WHY SIX STATES AND NOT THREE. Each one is a genuinely different sentence to somebody waiting:
 * "we have not been paid" is not "we have no stock" is not "it is in the post". Collapsing them
 * gives a member a reassurance that is false a quarter of the time, and the member who rings up
 * to ask is the one who was told the wrong one.
 */
export type MemberPendantView =
  /** A pendant is on the record. The live-status view. */
  | "with_pendant"
  /** An order exists but no payment has cleared. Golden rule 4: only the webhook changes this. */
  | "awaiting_payment"
  /** Paid, and a pendant is being got ready — allocated, programmed, or not yet reserved. */
  | "being_prepared"
  /** Paid, and the allocator found no free pendant. Somebody has to buy stock. */
  | "awaiting_stock"
  /** Collected for delivery and on its way. */
  | "shipped"
  /** No pendant and no live order. The only state in which we may offer to sell one. */
  | "no_pendant";

export interface MemberPendantInput {
  /** Is there a `devices` row for this member? */
  hasDevice: boolean;
  /** `subscriptions.has_pendant` — does the plan they pay for include one? */
  subscriptionHasPendant: boolean | null | undefined;
  /**
   * Their pendant order, device or not — `usePendantOrderForMember().memberPendantOrder`.
   * `undefined` means the read has not answered; `null` means there is none.
   */
  order:
    | { fulfilmentState: FulfilmentState; status: OrderStatus | null }
    | null
    | undefined;
}

/**
 * A cancelled order is not an order.
 *
 * Without this, a member whose order was cancelled would be held forever in "we are getting your
 * pendant ready" and would never be offered one again — the page would have no way back to the
 * only state in which it may sell.
 */
function isLive(order: MemberPendantInput["order"]): boolean {
  return !!order && order.fulfilmentState !== "cancelled";
}

export function memberPendantView(input: MemberPendantInput): MemberPendantView {
  // A device on the record outranks everything: whatever the order says, they have it.
  if (input.hasDevice) return "with_pendant";

  if (isLive(input.order)) {
    const order = input.order!;
    switch (order.fulfilmentState) {
      case "awaiting_payment":
        return "awaiting_payment";
      case "dispatched":
        return "shipped";
      case "paid":
        // The same derivation the fulfilment desk reads, so the member and the desk cannot
        // disagree about whether stock is the hold-up.
        return fulfilmentCondition({
          fulfilment_state: order.fulfilmentState,
          status: order.status,
        }) === "awaiting_stock"
          ? "awaiting_stock"
          : "being_prepared";
      case "allocated":
      case "programmed":
        return "being_prepared";
      case "delivered":
      case "tested":
        /*
          DELIVERED, BUT NO DEVICE ROW. That is a record we know to be incomplete rather than a
          member without a pendant, and the honest thing is to keep saying "it is on its way"
          instead of offering to sell them the one they are holding. `PendantFulfilmentCard` is
          where staff see the same gap as the drift it is.
        */
        return "being_prepared";
      case "cancelled":
        // Unreachable — `isLive` refused it. Listed so a new enum value cannot fall through
        // silently into the sales state.
        return "no_pendant";
    }
  }

  /*
    NO ORDER, BUT THE PLAN SAYS THEY HAVE ONE.

    `subscriptions.has_pendant` with no order row is the window WP2 exists for, and it must not
    read as "no pendant": the money has been taken. It is `being_prepared` rather than a fifth
    sentence, because from the member's side there is nothing to distinguish it from an order we
    have not started — and unlike them, we can go and look.
  */
  if (input.subscriptionHasPendant === true) return "being_prepared";

  return "no_pendant";
}

/**
 * The page subtitle, in the member's own terms.
 *
 * NOT `FULFILMENT_MEANING`. Those strings are written for the staff member deciding whether a
 * state is true yet — *"A specific pendant is reserved for this member and has left stock"*,
 * *"This is what pays the partner commission"* — and the page used to render them straight to
 * the member. Internal vocabulary and a partner's commission are not what somebody waiting for
 * their alarm needs to read. Same facts, the member's register.
 */
export const MEMBER_PENDANT_SUBTITLE: Record<
  MemberPendantView,
  { key: string; fallback: string }
> = {
  with_pendant: {
    key: "device.state.withPendant",
    fallback: "Your pendant, and whether it is working right now.",
  },
  awaiting_payment: {
    key: "device.state.awaitingPayment",
    fallback: "Your pendant order is waiting for payment before we can send it.",
  },
  being_prepared: {
    key: "device.state.beingPrepared",
    fallback: "We are getting your pendant ready. We will call you when it is on its way.",
  },
  awaiting_stock: {
    key: "device.state.awaitingStock",
    fallback:
      "Your pendant is paid for and we are waiting on stock. We will call you as soon as yours is reserved.",
  },
  shipped: {
    key: "device.state.shipped",
    fallback: "Your pendant is in the post. We will phone you to test it together when it lands.",
  },
  no_pendant: {
    key: "device.state.noPendant",
    fallback: "Your membership is answered by phone. You can add a pendant whenever you like.",
  },
};

/**
 * May the page offer to SELL a pendant?
 *
 * Exactly one state, and it is a function rather than `view === "no_pendant"` written at the
 * call site so that adding a state cannot quietly become a seventh place a sales card appears.
 * Offering a pendant to somebody who has already bought one is the original defect.
 */
export function mayOfferPendant(view: MemberPendantView): boolean {
  return view === "no_pendant";
}

/** Does this member read the live-status view rather than a waiting one? */
export function hasWorkingPendant(view: MemberPendantView): boolean {
  return view === "with_pendant";
}
