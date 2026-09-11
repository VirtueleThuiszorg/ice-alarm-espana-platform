/**
 * MOVING A LEGACY MEMBER ONTO STRIPE — the decisions, none of the I/O.
 *
 * `send-payment-link` already asks Stripe for a Checkout Session, records the pending rows and
 * hands the link to staff. A switch link is THE SAME THING with three things removed and one
 * added, so this module is what "legacy_switch mode" means rather than a second edge function
 * that drifts from the first within a month.
 *
 * WHAT IS REMOVED, and why each one matters:
 *
 *   THE REGISTRATION FEE.  They joined in 2014. Charging it again is charging somebody to stay.
 *   THE PENDANT.           They are wearing it. A second one on the invoice is a second device
 *                          nobody ordered, and `includeShipping` would post it.
 *   THE TRIAL / ANCHOR.    No `trial_period_days`, no `billing_cycle_anchor`, no proration.
 *                          Lee's rule: "a member pays the month's fee the moment they set up
 *                          and again exactly one month later — the setup day becomes their
 *                          billing day. No €0 setups, no future anchors, no proration."
 *
 * WHAT IS ADDED: `sepa_debit` beside `card`. Most of these members have paid by direct debit for
 * a decade; offering only a card asks a 79-year-old to find one.
 *
 * ── THE ONE THING THIS MODULE MUST NOT GET WRONG ─────────────────────────────
 *
 * An anchor or a trial would produce a €0 first invoice, and a €0 invoice does not make Stripe
 * send `checkout.session.completed` with a payment. The member would believe they had moved,
 * the Santander run would have dropped them (they are `switch_pending`), and NOBODY would be
 * collecting. That is the failure this whole item exists to prevent, produced by the very
 * parameter that looks like it prevents it.
 */

import type { BillingFrequency, MembershipType } from "./pricing-calc.ts";
import type { LinkSelection } from "./checkout-lines.ts";
import {
  normaliseSelection,
  type CheckoutPaymentMethod,
} from "./checkout-payment-methods.ts";

/**
 * How long an unpaid switch link stands before the member goes back on Santander billing.
 *
 * Fourteen days, matching the annual notice's lead time: the runner writes to an annual member
 * 14 days before their renewal, and a link that lapsed before their renewal arrived would be a
 * link that was never usable.
 */
export const LEGACY_SWITCH_EXPIRY_DAYS = 14;

/** Stripe's own `expires_at` cap is 24 hours, so the session and OUR window are different things. */
export const STRIPE_SESSION_HOURS = 24;

export interface LegacySwitchPlan {
  membershipType: MembershipType;
  billingFrequency: BillingFrequency;
}

/**
 * The selection a switch link is built from: the membership line and nothing else.
 *
 * Expressed as a `LinkSelection` on purpose — it goes through `resolveCheckoutLines` exactly as
 * a new member's does, so the switch link is priced from the same synced Stripe Prices, refuses
 * a stale price the same way, and cannot be given an amount by the browser.
 */
export function legacySwitchSelection(plan: LegacySwitchPlan): LinkSelection {
  return {
    membershipType: plan.membershipType,
    billingFrequency: plan.billingFrequency,
    pendantCount: 0,
    includeShipping: false,
    registrationFeeEnabled: false,
    registrationFeeDiscount: 0,
  };
}

/**
 * WHICH METHODS A SWITCH LINK OFFERS, and why it is not simply `["card", "sepa_debit"]`.
 *
 * SEPA is what these members already do — a decade of direct debits — so a switch link that
 * offers only a card asks a 79-year-old to find one, and most of them will not.
 *
 * But a SEPA checkout completes `unpaid` and activates only on
 * `checkout.session.async_payment_succeeded`. If the webhook destination is not listening for
 * that event, the member signs the mandate, Stripe takes the money days later, and NOTHING
 * activates them — while `switch_pending` has already taken them out of the Santander run. They
 * would be paying twice as much attention to us and getting billed by nobody.
 *
 * So the ask is card + SEPA and the ANSWER is whatever `normaliseSelection` allows: SEPA only
 * once an admin has confirmed the destination listens (Admin → Settings → Payments). The caller
 * reports which it got, so "why was I only offered a card" has an answer on the screen.
 */
export function legacySwitchPaymentMethods(asyncEventsConfirmed: boolean): CheckoutPaymentMethod[] {
  return normaliseSelection(["card", "sepa_debit"], asyncEventsConfirmed);
}

/**
 * The `subscription_data` a switch link sends — which is to say, almost nothing.
 *
 * NOT SET, each for the reason in the header: `trial_period_days`, `billing_cycle_anchor`,
 * `proration_behavior`. They are named here rather than merely absent so a future reader can
 * see they were considered and refused; a helper that returns metadata and nothing else is the
 * shape of "no trial, no anchor, no proration" that a test can actually assert.
 */
export function legacySwitchSubscriptionData(
  metadata: Record<string, string>,
): Record<string, unknown> {
  return { metadata };
}

export interface SwitchNoticeInput {
  memberFirstName: string;
  /** What they will pay now, and again each cycle. */
  amountEuros: number;
  billingFrequency: BillingFrequency;
  url: string;
  language: "en" | "es" | "nl";
}

const MONEY = (n: number) => `€${n.toFixed(2)}`;

/**
 * The SMS. Under 320 characters including the URL, for the same reason `paymentLinkSms` is.
 *
 * THE SENTENCE THAT MATTERS IS "your alarm does not change". Every one of these people is
 * elderly and has had the same arrangement for years; a message about money from a company that
 * holds their emergency button reads as a threat to the button unless it says otherwise first.
 */
export function switchNoticeSms(input: SwitchNoticeInput): string {
  const each = input.billingFrequency === "annual" ? "year" : "month";
  switch (input.language) {
    case "es":
      return (
        `ICE Alarm España: hola ${input.memberFirstName}, tu alarma no cambia. Estamos pasando ` +
        `los pagos a tarjeta o domiciliación: ${MONEY(input.amountEuros)} hoy y lo mismo cada ` +
        `${each === "year" ? "año" : "mes"} en esta misma fecha. ${input.url}`
      );
    case "nl":
      return (
        `ICE Alarm España: hallo ${input.memberFirstName}, je alarm verandert niet. We zetten de ` +
        `betaling om naar kaart of incasso: ${MONEY(input.amountEuros)} vandaag en daarna elke ` +
        `${each === "year" ? "jaar" : "maand"} op deze dag. ${input.url}`
      );
    default:
      return (
        `ICE Alarm España: hello ${input.memberFirstName}, your alarm does not change. We are ` +
        `moving payments to card or direct debit: ${MONEY(input.amountEuros)} today and the ` +
        `same each ${each} on this date. ${input.url}`
      );
  }
}

/**
 * The email. Says four things, in this order, because that is the order the questions arrive in:
 * nothing changes about the alarm; what is changing and why; exactly what will be taken and
 * when; and that the old collection stops.
 */
export function switchNoticeEmail(input: SwitchNoticeInput): { subject: string; html: string } {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const copy = {
    es: {
      subject: "Tu servicio no cambia — solo la forma de pago",
      hello: `Hola ${esc(input.memberFirstName)},`,
      unchanged:
        "Tu alarma, tu colgante y el número al que llamamos siguen exactamente igual. Esto es " +
        "solo sobre la forma de pagar.",
      why:
        "Estamos pasando los cobros del banco a nuestro sistema de pagos. Puedes pagar con " +
        "tarjeta o dar tu IBAN para que se domicilie automáticamente cada vez.",
      when:
        input.billingFrequency === "annual"
          ? `Se cobrará ${MONEY(input.amountEuros)} hoy, y la misma cantidad cada año en esta fecha.`
          : `Se cobrará ${MONEY(input.amountEuros)} hoy, y la misma cantidad cada mes en esta fecha.`,
      stops: "Dejaremos de pasar el recibo por el banco en cuanto se complete este pago.",
      pay: "Pagar y domiciliar",
      help: "Si prefieres hablarlo por teléfono, responde a este correo y te llamamos.",
    },
    nl: {
      subject: "Je dienst verandert niet — alleen de betaalwijze",
      hello: `Hallo ${esc(input.memberFirstName)},`,
      unchanged:
        "Je alarm, je hanger en het nummer dat we bellen blijven precies hetzelfde. Dit gaat " +
        "alleen over hoe je betaalt.",
      why:
        "We verplaatsen de incasso van de bank naar ons eigen betaalsysteem. Je kunt met kaart " +
        "betalen of je IBAN opgeven zodat het voortaan automatisch gaat.",
      when:
        input.billingFrequency === "annual"
          ? `Vandaag wordt ${MONEY(input.amountEuros)} afgeschreven, en daarna elk jaar op deze dag.`
          : `Vandaag wordt ${MONEY(input.amountEuros)} afgeschreven, en daarna elke maand op deze dag.`,
      stops: "Zodra deze betaling is gelukt, stoppen we de incasso via de bank.",
      pay: "Betalen en instellen",
      help: "Liever even bellen? Antwoord op deze e-mail en we bellen je.",
    },
    en: {
      subject: "Your service is not changing — only how you pay",
      hello: `Hello ${esc(input.memberFirstName)},`,
      unchanged:
        "Your alarm, your pendant and the number we call stay exactly as they are. This is only " +
        "about how the payment is taken.",
      why:
        "We are moving payments off the bank collection and onto our own payment system. You can " +
        "pay by card, or give your IBAN so it is taken automatically each time.",
      when:
        input.billingFrequency === "annual"
          ? `${MONEY(input.amountEuros)} will be taken today, and the same amount each year on this date.`
          : `${MONEY(input.amountEuros)} will be taken today, and the same amount each month on this date.`,
      stops: "We stop the bank collection as soon as this payment goes through.",
      pay: "Pay and set up",
      help: "If you would rather talk it through, reply to this email and we will ring you.",
    },
  }[input.language];

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.7;color:#1f2937">
  <p>${copy.hello}</p>
  <p><strong>${copy.unchanged}</strong></p>
  <p>${copy.why}</p>
  <p>${copy.when}</p>
  <p><a href="${esc(input.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:600">${copy.pay}</a></p>
  <p style="font-size:14px;color:#6b7280;word-break:break-all">${esc(input.url)}</p>
  <p style="font-size:14px;color:#6b7280">${copy.stops}</p>
  <p style="font-size:14px;color:#6b7280">${copy.help}</p>
</div>`.trim();

  return { subject: copy.subject, html };
}
