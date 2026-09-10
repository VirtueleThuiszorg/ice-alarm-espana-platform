/**
 * WHICH CHANNELS TO EVEN ATTEMPT, AND WHY NOT — one implementation, shared.
 *
 * Extracted from `payment-link.ts` when the member-update request needed the same decision.
 * Two copies of "is the SMS channel on, is there a number, is mail configured" is how one
 * surface quietly gets a different answer from another (CLAUDE.md: no duplicate parallel
 * implementations), and the reasoning below is the part that must not be re-derived.
 *
 * THE LINK IS ALWAYS SHOWN ON SCREEN. Every channel here can be off, unconfigured or
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

export interface ChannelInputs {
  /** `system_settings.notify_channel_sms` — Lee's switch, and nobody else's (D7). */
  smsChannelOn: boolean;
  /**
   * Whether email can actually leave the building. `email.ts` falls back to Gmail when no
   * provider is configured, which either works or fails loudly; this flag is what the caller
   * knows about the sender being live (PENDING_FOR_LEE.md S2).
   */
  emailConfigured: boolean;
  phone: string | null | undefined;
  email: string | null | undefined;
}

/**
 * Which channels to attempt.
 *
 * Order of reasons matters: an off channel is reported as off even when there is also no phone
 * number, because "turn the channel on" is the action, and reporting the address first would
 * send somebody hunting for a phone number that would not have been used anyway.
 */
export function planChannels(input: ChannelInputs): DeliveryDecision[] {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim() || null;

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
