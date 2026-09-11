// @vitest-environment node
//
// WHAT A CUSTOMER MAY PAY WITH, AND THE SILENT FAILURE THAT MAKES IT MATTER.
//
// Neither `create-checkout` nor `send-payment-link` set `payment_method_types`, so STRIPE'S
// DASHBOARD DEFAULTS decided — and in the EEA those include SEPA Direct Debit.
//
// SEPA IS ASYNCHRONOUS. A SEPA checkout completes with `payment_status: "unpaid"`: the mandate
// is signed, the money is days away, and it may never arrive. `stripe-webhook` is right to
// refuse to activate on that — and activation then depends on
// `checkout.session.async_payment_succeeded`, which has to be enabled on the webhook
// destination. Lee could not find that event in the destination's picker.
//
// So the live platform could offer a payment method whose success event nobody is listening for:
// THE CUSTOMER PAYS AND IS NEVER ACTIVATED, with no error anywhere. The webhook logs "waiting
// for payment" and stops. That is the defect these tests pin shut, from both ends — the checkout
// offers card only, and the webhook does not activate on an unpaid session.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALWAYS_OFFERED,
  ASYNC_BLOCKED_REASON,
  ASYNC_EVENTS_CONFIRMED_KEY,
  ASYNC_PAYMENT_METHODS,
  CHECKOUT_PAYMENT_METHODS_KEY,
  SUPPORTED_PAYMENT_METHODS,
  isAsyncPaymentMethod,
  isMethodSelectable,
  loadCheckoutPaymentMethods,
  normaliseSelection,
  parseCheckoutPaymentMethods,
} from "../../supabase/functions/_shared/checkout-payment-methods";
import { isSessionPaid } from "../../supabase/functions/_shared/stripe-events";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the setting resolves to what Stripe is given", () => {
  it("defaults to card, and card alone", () => {
    // The default is the method that settles synchronously and always activates.
    expect(parseCheckoutPaymentMethods(null)).toEqual(["card"]);
    expect(parseCheckoutPaymentMethods("")).toEqual(["card"]);
    expect(parseCheckoutPaymentMethods("   ")).toEqual(["card"]);
  });

  it("falls back to card for anything it cannot read", () => {
    /*
      Every uncertain input resolves to card, because the failure being defended against is a
      checkout offering a method nobody is listening for. A `payment_method_types` Stripe does
      not recognise is a 400 at the one moment where an error costs a sale.
    */
    for (const junk of ["paypal", "bitcoin,card", "SEPA DEBIT", "null", "[]", "card;sepa_debit"]) {
      expect(parseCheckoutPaymentMethods(junk), junk).toContain("card");
      for (const method of parseCheckoutPaymentMethods(junk)) {
        expect(SUPPORTED_PAYMENT_METHODS, junk).toContain(method);
      }
    }
    expect(parseCheckoutPaymentMethods("paypal,bitcoin")).toEqual(["card"]);
  });

  it("always includes card, and always FIRST", () => {
    // Stripe renders them in order; the method that definitely works should not be second.
    expect(parseCheckoutPaymentMethods("sepa_debit")).toEqual(["card", "sepa_debit"]);
    expect(parseCheckoutPaymentMethods("ideal,card,bancontact")).toEqual(["card", "ideal", "bancontact"]);
    expect(parseCheckoutPaymentMethods("sepa_debit,ideal")[0]).toBe(ALWAYS_OFFERED);
  });

  it("de-duplicates, because a repeated method is a 400 from Stripe", () => {
    expect(parseCheckoutPaymentMethods("card,card,sepa_debit,sepa_debit")).toEqual(["card", "sepa_debit"]);
  });

  it("tolerates whitespace and case, which a hand-edited row will have", () => {
    expect(parseCheckoutPaymentMethods(" CARD , Sepa_Debit ")).toEqual(["card", "sepa_debit"]);
  });
});

describe("the async methods are locked until somebody confirms the destination listens", () => {
  it("names all three, and card is not one of them", () => {
    expect([...ASYNC_PAYMENT_METHODS].sort()).toEqual(["bancontact", "ideal", "sepa_debit"]);
    expect(isAsyncPaymentMethod("card")).toBe(false);
    // Bancontact and iDEAL are usually immediate — and "usually immediate" is not a property to
    // bet an activation on, so both are treated as asynchronous.
    expect(isAsyncPaymentMethod("bancontact")).toBe(true);
    expect(isAsyncPaymentMethod("ideal")).toBe(true);
  });

  it("refuses them without the acknowledgement, and says why", () => {
    for (const method of ASYNC_PAYMENT_METHODS) {
      const gate = isMethodSelectable(method, false);
      expect(gate.selectable, method).toBe(false);
      // The reason on the control itself: a greyed checkbox with no explanation is a control
      // somebody assumes is broken.
      expect(gate.reason, method).toBe(ASYNC_BLOCKED_REASON);
      expect(gate.reason, method).toContain("checkout.session.async_payment_succeeded");
    }
  });

  it("allows them once it is given", () => {
    for (const method of ASYNC_PAYMENT_METHODS) {
      expect(isMethodSelectable(method, true), method).toEqual({ selectable: true });
    }
  });

  it("card is selectable either way and can never be removed", () => {
    expect(isMethodSelectable("card", false)).toEqual({ selectable: true });
    // A checkout with no payment methods is not a checkout.
    expect(normaliseSelection([], true)).toEqual(["card"]);
    expect(normaliseSelection(["sepa_debit"], true)).toEqual(["card", "sepa_debit"]);
  });

  it("DROPS an async method saved without the acknowledgement", () => {
    /*
      Enforced in the data path, not only by a disabled checkbox. A stale browser tab, a replayed
      request or a future caller must not be able to enable SEPA while the destination is deaf —
      the cost of that is a customer who pays and is never activated.
    */
    expect(normaliseSelection(["card", "sepa_debit", "ideal"], false)).toEqual(["card"]);
    expect(normaliseSelection(["card", "sepa_debit", "ideal"], true)).toEqual(["card", "sepa_debit", "ideal"]);
  });
});

describe("what the checkout functions actually read", () => {
  const reader = (rows: Array<{ key: string; value: string | null }> | null, error: unknown = null) => {
    const seen: string[][] = [];
    return {
      seen,
      db: {
        from: () => ({
          select: () => ({
            in: async (_c: string, keys: string[]) => {
              seen.push(keys);
              return { data: rows, error };
            },
          }),
        }),
      },
    };
  };

  it("reads both keys in one query", () => {
    const { db, seen } = reader([]);
    return loadCheckoutPaymentMethods(db).then(() => {
      expect(seen).toEqual([[CHECKOUT_PAYMENT_METHODS_KEY, ASYNC_EVENTS_CONFIRMED_KEY]]);
    });
  });

  it("returns card when nothing is stored", async () => {
    const { db } = reader([]);
    expect(await loadCheckoutPaymentMethods(db)).toEqual({ methods: ["card"], asyncEventsConfirmed: false });
  });

  it("A FAILED READ IS CARD, not a throw and not the stored value", async () => {
    /*
      This runs while somebody is trying to pay. The safe answer to "I cannot tell which methods
      are allowed" is the one that settles synchronously and always activates — and it must not
      be an exception, which would turn a checkout into a 500.
    */
    const { db } = reader(null, { message: "permission denied" });
    expect(await loadCheckoutPaymentMethods(db)).toEqual({ methods: ["card"], asyncEventsConfirmed: false });
  });

  it("re-applies the acknowledgement on READ, not just on write", async () => {
    /*
      A row saying "card,sepa_debit" while the confirmation has since been turned off must not
      keep offering SEPA: the destination may have been changed in the Stripe dashboard since,
      and turning the acknowledgement off is how somebody records that.
    */
    const { db } = reader([
      { key: CHECKOUT_PAYMENT_METHODS_KEY, value: "card,sepa_debit" },
      { key: ASYNC_EVENTS_CONFIRMED_KEY, value: "false" },
    ]);
    expect(await loadCheckoutPaymentMethods(db)).toEqual({ methods: ["card"], asyncEventsConfirmed: false });
  });

  it("offers SEPA once both the row and the acknowledgement say so", async () => {
    const { db } = reader([
      { key: CHECKOUT_PAYMENT_METHODS_KEY, value: "card,sepa_debit" },
      { key: ASYNC_EVENTS_CONFIRMED_KEY, value: "true" },
    ]);
    expect(await loadCheckoutPaymentMethods(db)).toEqual({
      methods: ["card", "sepa_debit"],
      asyncEventsConfirmed: true,
    });
  });

  it("treats anything but the string 'true' as not confirmed", async () => {
    for (const value of ["", "1", "yes", "TRUE", null]) {
      const { db } = reader([
        { key: CHECKOUT_PAYMENT_METHODS_KEY, value: "card,sepa_debit" },
        { key: ASYNC_EVENTS_CONFIRMED_KEY, value },
      ]);
      expect((await loadCheckoutPaymentMethods(db)).methods, String(value)).toEqual(["card"]);
    }
  });
});

describe("both functions pass it to Stripe, from the one module", () => {
  const create = stripComments(read("supabase/functions/create-checkout/index.ts"));
  const link = stripComments(read("supabase/functions/send-payment-link/index.ts"));

  for (const [name, src] of [["create-checkout", create], ["send-payment-link", link]] as const) {
    it(`${name} sets payment_method_types from the shared loader`, () => {
      /*
        THE CLIENT'S NAME IS NOT THE POINT, AND ASSERTING IT CAUSED THE OUTAGE THIS LINE NOW
        AVOIDS. This read `toContain("loadCheckoutPaymentMethods(supabase)")` for BOTH files.
        `create-checkout` calls its client `supabase`; `send-payment-link` calls its `admin` —
        so the only way to make this assertion pass in the second file was to write an
        identifier that file does not have, and somebody did. Every staff-sent payment link then
        threw a ReferenceError at that line, after the pending order rows had been written.

        What matters is that the loader is called at all, and with something real. The second
        half is now ESLint's `no-undef`, switched on for supabase/functions/** and pinned by
        src/test/edgeFunctionClients.test.ts — a scope rule catches an undefined identifier;
        a substring match can only ever guess at one.
      */
      expect(src, name).toMatch(/loadCheckoutPaymentMethods\(\s*[A-Za-z_$][\w$]*\s*\)/);
      expect(src, name).toMatch(/payment_method_types: paymentMethodTypes/);
      // Read per session rather than cached: ticking a box in Settings should change the next
      // checkout, not the next cold start.
      expect(src.indexOf("loadCheckoutPaymentMethods"), name).toBeLessThan(
        src.indexOf("stripe.checkout.sessions.create"),
      );
    });

    it(`${name} does not hard-code a method list of its own`, () => {
      // One implementation. Two lists is how one of them ends up offering SEPA after the other
      // stopped.
      expect(src, name).not.toMatch(/payment_method_types: \[/);
      expect(src, name).not.toContain('"sepa_debit"');
    });
  }
});

// ── the other end of the same defect ───────────────────────────────────────
describe("an unpaid session does not activate anybody", () => {
  it("payment_status decides, and only 'paid' passes", () => {
    /*
      The SEPA shape: `checkout.session.completed` arrives with `payment_status: "unpaid"`. If
      that activated a member, the platform would be giving away memberships to anyone who
      signs a mandate and cancels it.
    */
    expect(isSessionPaid("paid")).toBe(true);
    expect(isSessionPaid("unpaid")).toBe(false);
    expect(isSessionPaid("no_payment_required")).toBe(false);
    expect(isSessionPaid(null)).toBe(false);
    expect(isSessionPaid(undefined)).toBe(false);
  });

  it("the webhook checks it BEFORE it looks at the money or the order", () => {
    const webhook = stripComments(read("supabase/functions/stripe-webhook/index.ts"));
    const gate = webhook.indexOf("isSessionPaid(session.payment_status)");
    expect(gate).toBeGreaterThan(-1);
    // Before the amount check and before any activation write.
    expect(gate).toBeLessThan(webhook.indexOf('from("payments")'));
    expect(webhook).toMatch(/awaitingPayment: true/);
  });

  it("...and it handles the event that means the money arrived", () => {
    // The refusal above is only safe BECAUSE this event is handled: without it, a SEPA customer
    // pays and is never activated. That is why the async methods are locked behind an
    // acknowledgement that the destination is subscribed to it.
    const webhook = stripComments(read("supabase/functions/stripe-webhook/index.ts"));
    expect(webhook).toContain("checkout.session.async_payment_succeeded");
    expect(webhook).toContain("checkout.session.completed");
  });

  it("the card tells an admin exactly which events to enable", () => {
    const card = read("src/components/admin/settings/CheckoutPaymentMethodsCard.tsx");
    expect(card).toContain("checkout.session.async_payment_succeeded");
    /*
      IT NAMED AN EVENT THAT DOES NOT EXIST. The card asked for `checkout.session.failed`, which
      is not a Stripe event at all — an admin following the instruction would subscribe to
      nothing and tick the box believing they had. The real one is
      `checkout.session.async_payment_failed`, and it is the event that puts a legacy member
      whose debit bounced back into the Santander collection.
    */
    expect(card).toContain("checkout.session.async_payment_failed");
    expect(card).not.toMatch(/checkout\.session\.failed</);
    expect(card).toContain("never activated");
    // Card cannot be unticked in the UI either.
    expect(card).toMatch(/disabled=\{locked \|\| !gate\.selectable/);
  });

  it("the acknowledgement is audited with both the old and the new value", () => {
    // "Who turned SEPA on" is the first question after a customer pays and is not activated.
    const card = read("src/components/admin/settings/CheckoutPaymentMethodsCard.tsx");
    expect(card).toMatch(/oldValues: \{[\s\S]{0,160}?asyncEventsConfirmed/);
    expect(card).toMatch(/newValues: \{ methods: methods\.join\(","\), asyncEventsConfirmed/);
  });
});
