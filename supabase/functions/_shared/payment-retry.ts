/**
 * WHEN A MEMBER'S PAYMENT FAILS — what happens, and above all WHEN.
 *
 * Lee's rule for the billing migration: "Failed debits: one Stripe smart retry, then staff bell +
 * friendly SMS; monitoring continues."
 *
 * ── THE TIMING IS THE WHOLE DESIGN ───────────────────────────────────────────
 *
 * `invoice.payment_failed` fires on EVERY attempt, not once. Stripe's smart retries then try
 * again over the following days, and most direct-debit failures clear on their own — a balance
 * that was short on the 15th is not short on the 18th.
 *
 * So texting the member on the first failure means texting several hundred elderly people about
 * a problem that fixes itself, and each of those messages is frightening in a way a younger
 * person's would not be: it arrives from the company that holds their emergency button. The
 * message goes out only when STRIPE HAS GIVEN UP — `next_payment_attempt` is null — which is the
 * first moment the failure is real.
 *
 * ── AND MONITORING NEVER STOPS ───────────────────────────────────────────────
 *
 * `past_due` is recorded on the first failure and the subscription stays live. P4 already settled
 * this: a member whose card bounced is still a member, and an operator still answers their alarm.
 * Nothing here suspends anything, and the staff message says so in as many words — because the
 * instinct on reading "payment failed" is to stop the service, and on this product that instinct
 * kills somebody.
 */

export interface FailedInvoice {
  /** Stripe's own field: a unix timestamp while it will try again, null once it has given up. */
  next_payment_attempt: number | null | undefined;
  /** How many times it has tried. Used only for the wording. */
  attempt_count?: number | null;
  number?: string | null;
  amount_due?: number | null;
}

export type FailureStage =
  /** Stripe will try again. Record it; say nothing to the member. */
  | "retrying"
  /** Stripe has stopped. This is the first moment the failure is real. */
  | "exhausted";

export function failureStage(invoice: FailedInvoice): FailureStage {
  return invoice.next_payment_attempt ? "retrying" : "exhausted";
}

/** What staff are told, and the sentence that stops somebody suspending the service. */
export function staffFailureMessage(
  memberName: string,
  invoice: FailedInvoice,
  stage: FailureStage,
): string {
  const which = invoice.number ? ` (invoice ${invoice.number})` : "";
  if (stage === "retrying") {
    return (
      `${memberName}'s payment did not go through${which}. The bank will be tried again ` +
      "automatically over the next few days — most clear on their own. Monitoring continues; do " +
      "not suspend the service."
    );
  }
  return (
    `${memberName}'s payment has failed and the bank will not be tried again${which}. They have ` +
    "been sent a text. Ring them if it is not sorted in a few days. Monitoring continues; do not " +
    "suspend the service."
  );
}

/**
 * The member's text. Friendly, short, and it leads with the alarm.
 *
 * IT DOES NOT SAY "URGENT" AND IT DOES NOT THREATEN THE SERVICE — because the service is not in
 * question and saying otherwise to somebody in their eighties, about their emergency alarm, is a
 * cruelty for the sake of a collection rate. It also gives them a person rather than a link: the
 * commonest cause is a bank detail that changed, which is a phone call, not a form.
 */
export function memberFailureSms(
  firstName: string,
  language: "en" | "es" | "nl",
  phone: string,
): string {
  switch (language) {
    case "es":
      return (
        `Hola ${firstName}, somos ICE Alarm España. Tu alarma sigue funcionando con normalidad. ` +
        `El pago de este mes no ha salido del banco — llámanos al ${phone} cuando puedas y lo ` +
        "arreglamos juntos."
      );
    case "nl":
      return (
        `Hallo ${firstName}, dit is ICE Alarm España. Je alarm werkt gewoon door. De betaling van ` +
        `deze maand is niet gelukt — bel ons even op ${phone}, dan regelen we het samen.`
      );
    default:
      return (
        `Hello ${firstName}, this is ICE Alarm España. Your alarm is working as normal. This ` +
        `month's payment did not go through from your bank — give us a ring on ${phone} when you ` +
        "can and we will sort it out together."
      );
  }
}
