/**
 * WHICH MEMBER IS THIS — the derivation, exhaustively, without rendering anything.
 *
 * `myPendantPage.test.tsx` proves the page reads this module. This one proves the module is
 * right, which is a different job: the page has three or four interesting cases and the
 * derivation has every fulfilment state crossed with every order status.
 *
 * THE TWO RULES THAT MATTER, and both were broken before it existed:
 *
 *   1. **Nobody with a pendant on order is called phone-only.** `hasPendant` was
 *      `subscription?.has_pendant && device`, so every member between paying and the device
 *      being assigned was shown the branch titled "Phone-Only membership" — told they had
 *      chosen a service they had paid to leave.
 *   2. **We never offer to sell a pendant to somebody who has one coming.** Same cause: the
 *      sales card lived in the branch that boolean sent them to.
 *
 * Both are asserted here as properties over the whole enum rather than as examples, so a new
 * fulfilment state cannot quietly fall into the selling case.
 */

import { describe, it, expect } from "vitest";

import {
  MEMBER_PENDANT_SUBTITLE,
  hasWorkingPendant,
  mayOfferPendant,
  memberPendantView,
  type MemberPendantView,
} from "@/lib/memberPendantView";
import { FULFILMENT_STATES, type FulfilmentState } from "@/lib/fulfilmentState";
import type { OrderStatus } from "@/lib/orderStatus";

const order = (fulfilmentState: FulfilmentState, status: OrderStatus | null = null) => ({
  fulfilmentState,
  status,
});

/** No pendant, no order, no plan — the only state in which we may sell. */
const NOTHING = { hasDevice: false, subscriptionHasPendant: false, order: null };

describe("a device on the record outranks everything", () => {
  it("is `with_pendant` whatever the order says", () => {
    for (const state of FULFILMENT_STATES) {
      expect(
        memberPendantView({ hasDevice: true, subscriptionHasPendant: true, order: order(state) }),
        state,
      ).toBe("with_pendant");
    }
  });

  it("…including with no order at all — they are holding it", () => {
    expect(
      memberPendantView({ hasDevice: true, subscriptionHasPendant: null, order: null }),
    ).toBe("with_pendant");
  });
});

describe("the waiting states, each its own sentence", () => {
  it("an unpaid order says so — golden rule 4, only the webhook changes it", () => {
    expect(memberPendantView({ ...NOTHING, order: order("awaiting_payment") })).toBe(
      "awaiting_payment",
    );
  });

  it("paid with no stock says NO STOCK, the same answer the fulfilment desk reads", () => {
    expect(memberPendantView({ ...NOTHING, order: order("paid", "awaiting_stock") })).toBe(
      "awaiting_stock",
    );
  });

  it("paid with nobody having allocated one yet is 'being prepared', NOT 'no stock'", () => {
    // Telling a member there is no stock when nobody has looked is a different — and worse —
    // wrong answer than telling them nothing.
    expect(memberPendantView({ ...NOTHING, order: order("paid", null) })).toBe("being_prepared");
    expect(memberPendantView({ ...NOTHING, order: order("paid", "processing") })).toBe(
      "being_prepared",
    );
  });

  it("allocated and programmed are being prepared", () => {
    expect(memberPendantView({ ...NOTHING, order: order("allocated") })).toBe("being_prepared");
    expect(memberPendantView({ ...NOTHING, order: order("programmed") })).toBe("being_prepared");
  });

  it("dispatched is in the post", () => {
    expect(memberPendantView({ ...NOTHING, order: order("dispatched") })).toBe("shipped");
  });

  it("delivered or tested with NO device row keeps saying it is coming, and never sells", () => {
    /*
      A record we know to be incomplete rather than a member without a pendant. Offering to sell
      them the one they are holding is the worse of the two wrong answers; staff see the same
      gap as drift on `PendantFulfilmentCard`.
    */
    for (const state of ["delivered", "tested"] as const) {
      const view = memberPendantView({ ...NOTHING, order: order(state) });
      expect(view, state).toBe("being_prepared");
      expect(mayOfferPendant(view), state).toBe(false);
    }
  });

  it("a status of `awaiting_stock` past the paid rung is NOT reported as no stock", () => {
    // Past that rung a device is assigned, so a stale status is drift rather than a condition —
    // `fulfilmentCondition` says so, and the member's page must not repeat the stale value.
    expect(memberPendantView({ ...NOTHING, order: order("dispatched", "awaiting_stock") })).toBe(
      "shipped",
    );
  });
});

describe("no pendant, and the plan that says otherwise", () => {
  it("nothing at all is `no_pendant`", () => {
    expect(memberPendantView(NOTHING)).toBe("no_pendant");
  });

  it("an unread order is not an absent one — `undefined` is not a gap", () => {
    // A read in flight must not flip the page into the selling state for a beat.
    expect(
      memberPendantView({ hasDevice: false, subscriptionHasPendant: true, order: undefined }),
    ).toBe("being_prepared");
  });

  it("a plan that includes a pendant with no order row is still not phone-only", () => {
    /*
      WP2's window: the money has been taken and no order row exists yet. It must not read as
      "no pendant" — and unlike the member, we can go and look.
    */
    expect(
      memberPendantView({ hasDevice: false, subscriptionHasPendant: true, order: null }),
    ).toBe("being_prepared");
  });

  it("a CANCELLED order is not an order — the member can be offered one again", () => {
    /*
      Without this they are held in "getting it ready" forever and never offered a pendant
      again: the page would have no way back to the only state in which it may sell.
    */
    expect(memberPendantView({ ...NOTHING, order: order("cancelled") })).toBe("no_pendant");
    expect(mayOfferPendant(memberPendantView({ ...NOTHING, order: order("cancelled") }))).toBe(
      true,
    );
  });

  it("…but a cancelled order on a plan that still includes a pendant is not a sale", () => {
    // The subscription is still being charged for a pendant. Selling a second one is wrong;
    // somebody has to look at why the order was cancelled.
    expect(
      memberPendantView({
        hasDevice: false,
        subscriptionHasPendant: true,
        order: order("cancelled"),
      }),
    ).toBe("being_prepared");
  });
});

describe("the two rules, as properties over the whole enum", () => {
  it("EXACTLY ONE state may be offered a pendant", () => {
    const sellable = (
      [
        "with_pendant",
        "awaiting_payment",
        "being_prepared",
        "awaiting_stock",
        "shipped",
        "no_pendant",
      ] as const satisfies readonly MemberPendantView[]
    ).filter(mayOfferPendant);
    expect(sellable).toEqual(["no_pendant"]);
  });

  it("no live order, in any state, ever reaches the selling case", () => {
    for (const state of FULFILMENT_STATES) {
      if (state === "cancelled") continue; // not a live order, covered above
      for (const status of [null, "awaiting_stock", "processing", "delivered"] as const) {
        const view = memberPendantView({
          ...NOTHING,
          order: order(state, status as OrderStatus | null),
        });
        expect(mayOfferPendant(view), `${state}/${status} may not be sold to`).toBe(false);
      }
    }
  });

  it("only `with_pendant` reads the live-status view", () => {
    for (const state of FULFILMENT_STATES) {
      const view = memberPendantView({ ...NOTHING, order: order(state) });
      expect(hasWorkingPendant(view), state).toBe(false);
    }
    expect(hasWorkingPendant("with_pendant")).toBe(true);
  });
});

describe("the subtitles", () => {
  it("every state has one, and none of them is empty", () => {
    for (const [state, spec] of Object.entries(MEMBER_PENDANT_SUBTITLE)) {
      expect(spec.fallback.length, state).toBeGreaterThan(20);
      expect(spec.key, state).toMatch(/^device\.state\./);
    }
  });

  it("none of them uses staff vocabulary", () => {
    /*
      The page used to render `FULFILMENT_MEANING` straight to the member — "A specific pendant
      is reserved for this member and has left stock", "This is what pays the partner
      commission". Internal vocabulary and a partner's commission are not what somebody waiting
      for their alarm reads.
    */
    for (const [state, spec] of Object.entries(MEMBER_PENDANT_SUBTITLE)) {
      for (const word of [/commission/i, /left stock/i, /allocat/i, /provision/i, /fulfilment/i]) {
        expect(spec.fallback, `${state}: ${word}`).not.toMatch(word);
      }
    }
  });

  it("and none of them calls anybody phone-only", () => {
    // The word itself was the defect. A member who chose the plan does not need naming for it,
    // and a member who left it must never be called it.
    for (const [state, spec] of Object.entries(MEMBER_PENDANT_SUBTITLE)) {
      expect(spec.fallback, state).not.toMatch(/phone.only/i);
    }
  });
});
