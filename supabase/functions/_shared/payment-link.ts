/**
 * A staff-sent payment link: who it goes to, over which channel, and what it says.
 *
 * Everything here is PURE. The edge function does the I/O — Stripe, Postgres, Twilio, the mail
 * provider — and this module makes the decisions, so "would we have texted this person, and
 * why not" is answerable in a test instead of in production logs.
 *
 * THE LINK IS ALWAYS SHOWN ON SCREEN. Every channel below can be off, unconfigured or
 * addressless, and the staff member still gets the URL to read out or paste into WhatsApp
 * themselves. A "sent" that silently sent nothing is the contact-form defect (STATE.md W1) in a
 * new costume, so each channel returns a NAMED outcome and the caller reports all of them.
 */

export type DeliveryChannel = "sms" | "email";

export type DeliveryOutcome =
  /** Handed to the transport, which accepted it. */
  | "sent"
  /** Lee's global channel switch is off — `system_settings.notify_channel_sms` (D7). */
  | "skipped_channel_off"
  /** The transport has no credentials / no verified sender yet. */
  | "skipped_not_configured"
  /** Nobody to send to: no phone, or no email. */
  | "skipped_no_address"
  /** The transport was asked and said no. The link is still on screen. */
  | "failed";

export interface DeliveryDecision {
  channel: DeliveryChannel;
  /** Where it would go, or null when there is nowhere. */
  to: string | null;
  /** Whether the caller should actually attempt the send. */
  attempt: boolean;
  /** The outcome when `attempt` is false; the caller fills it in when it is true. */
  outcome: Exclude<DeliveryOutcome, "sent" | "failed"> | null;
}

export interface DeliveryInputs {
  /** `system_settings.notify_channel_sms` — Lee's switch, and nobody else's (D7). */
  smsChannelOn: boolean;
  /**
   * Whether email can actually leave the building. `email.ts` falls back to Gmail when no
   * provider is configured, which either works or fails loudly; this flag is what the caller
   * knows about the sender being live (PENDING_FOR_LEE.md S2).
   */
  emailConfigured: boolean;
  /** The PAYER's contact details — they are the person being asked for money (P3). */
  payerPhone: string | null | undefined;
  payerEmail: string | null | undefined;
}

/**
 * Which channels to attempt.
 *
 * Order of reasons matters: an off channel is reported as off even when there is also no phone
 * number, because "turn the channel on" is the action, and reporting the address first would
 * send somebody hunting for a phone number that would not have been used anyway.
 */
export function planDelivery(input: DeliveryInputs): DeliveryDecision[] {
  const phone = input.payerPhone?.trim() || null;
  const email = input.payerEmail?.trim() || null;

  const sms: DeliveryDecision = !input.smsChannelOn
    ? { channel: "sms", to: phone, attempt: false, outcome: "skipped_channel_off" }
    : !phone
      ? { channel: "sms", to: null, attempt: false, outcome: "skipped_no_address" }
      : { channel: "sms", to: phone, attempt: true, outcome: null };

  const mail: DeliveryDecision = !input.emailConfigured
    ? { channel: "email", to: email, attempt: false, outcome: "skipped_not_configured" }
    : !email
      ? { channel: "email", to: null, attempt: false, outcome: "skipped_no_address" }
      : { channel: "email", to: email, attempt: true, outcome: null };

  return [sms, mail];
}

export interface LinkMessageInput {
  /** Who we are writing to — the payer, who may not be the member. */
  payerFirstName: string;
  /** Whose membership this is. Same person as the payer in the ordinary case. */
  memberFullName: string;
  /** True when the payer is somebody other than the member (PAYER_MODEL.md). */
  payerIsSomeoneElse: boolean;
  planLabel: string;
  totalEuros: number;
  url: string;
  language: "en" | "es" | "nl";
}

const MONEY = (n: number) => `€${n.toFixed(2)}`;

/**
 * The SMS. One message, no link shortener, no tracking parameters.
 *
 * Kept under 320 characters (two GSM segments) INCLUDING the URL: Stripe Checkout URLs are
 * ~90 characters, and a third segment costs money for nothing. Asserted in the tests rather
 * than trusted.
 */
export function paymentLinkSms(input: LinkMessageInput): string {
  const who = input.payerIsSomeoneElse ? ` for ${input.memberFullName}` : "";
  switch (input.language) {
    case "es":
      return (
        `ICE Alarm España: hola ${input.payerFirstName}, aquí tienes el enlace de pago${
          who ? ` de la suscripción de ${input.memberFullName}` : ""
        } (${input.planLabel}, ${MONEY(input.totalEuros)}): ${input.url}`
      );
    case "nl":
      return (
        `ICE Alarm España: hallo ${input.payerFirstName}, hier is de betaallink${
          who ? ` voor het abonnement van ${input.memberFullName}` : ""
        } (${input.planLabel}, ${MONEY(input.totalEuros)}): ${input.url}`
      );
    default:
      return (
        `ICE Alarm España: hello ${input.payerFirstName}, here is the payment link${who} ` +
        `(${input.planLabel}, ${MONEY(input.totalEuros)}): ${input.url}`
      );
  }
}

/**
 * The email. Deliberately plain: a payment link that looks like marketing gets treated like
 * marketing, and this one is the difference between a pendant arriving and not.
 *
 * No "click here" — the URL is written out, because a member forwarding this to the family
 * member who actually pays needs the address to survive the forward.
 */
export function paymentLinkEmail(input: LinkMessageInput): { subject: string; html: string } {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const copy = {
    es: {
      subject: `Enlace de pago — ICE Alarm España (${MONEY(input.totalEuros)})`,
      hello: `Hola ${esc(input.payerFirstName)},`,
      intro: input.payerIsSomeoneElse
        ? `Aquí tienes el enlace para pagar la suscripción de ${esc(input.memberFullName)}.`
        : "Aquí tienes el enlace para completar tu suscripción.",
      plan: "Plan",
      total: "Total del primer pago",
      pay: "Pagar ahora",
      note:
        "El pago se realiza en Stripe. Tu servicio de monitorización se activa en cuanto Stripe " +
        "confirma el pago.",
      help: "Si tienes cualquier duda, responde a este correo.",
    },
    nl: {
      subject: `Betaallink — ICE Alarm España (${MONEY(input.totalEuros)})`,
      hello: `Hallo ${esc(input.payerFirstName)},`,
      intro: input.payerIsSomeoneElse
        ? `Hier is de link om het abonnement van ${esc(input.memberFullName)} te betalen.`
        : "Hier is de link om je abonnement af te ronden.",
      plan: "Abonnement",
      total: "Totaal van de eerste betaling",
      pay: "Nu betalen",
      note:
        "De betaling verloopt via Stripe. Je bewaking begint zodra Stripe de betaling heeft " +
        "bevestigd.",
      help: "Vragen? Antwoord gewoon op deze e-mail.",
    },
    en: {
      subject: `Payment link — ICE Alarm España (${MONEY(input.totalEuros)})`,
      hello: `Hello ${esc(input.payerFirstName)},`,
      intro: input.payerIsSomeoneElse
        ? `Here is the link to pay for ${esc(input.memberFullName)}'s subscription.`
        : "Here is the link to complete your subscription.",
      plan: "Plan",
      total: "First payment total",
      pay: "Pay now",
      note:
        "Payment is taken by Stripe. Monitoring starts as soon as Stripe confirms the payment.",
      help: "Any questions, just reply to this email.",
    },
  }[input.language];

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">
  <p>${copy.hello}</p>
  <p>${copy.intro}</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">${copy.plan}</td><td style="padding:4px 0"><strong>${esc(input.planLabel)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">${copy.total}</td><td style="padding:4px 0"><strong>${MONEY(input.totalEuros)}</strong></td></tr>
  </table>
  <p><a href="${esc(input.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${copy.pay}</a></p>
  <p style="font-size:13px;color:#6b7280;word-break:break-all">${esc(input.url)}</p>
  <p style="font-size:13px;color:#6b7280">${copy.note}</p>
  <p style="font-size:13px;color:#6b7280">${copy.help}</p>
</div>`.trim();

  return { subject: copy.subject, html };
}

/** "Couple membership, billed annually" — one label, used in the SMS, the email and the log. */
export function planLabel(
  membershipType: "single" | "couple",
  billingFrequency: "monthly" | "annual",
  pendantCount: number,
): string {
  const plan = membershipType === "couple" ? "Couple membership" : "Single membership";
  const billing = billingFrequency === "annual" ? "billed annually" : "billed monthly";
  const pendant =
    pendantCount === 0 ? "no pendant" : pendantCount === 1 ? "1 pendant" : `${pendantCount} pendants`;
  return `${plan}, ${billing}, ${pendant}`;
}
