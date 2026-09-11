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
 * themselves — which is still true now that WhatsApp is one of the channels, because it is the
 * one most likely to be switched off or without an approved template.
 *
 * A "sent" that silently sent nothing is the contact-form defect (STATE.md W1) in a new costume,
 * so each channel returns a NAMED outcome and the caller reports all of them.
 */

export type DeliveryChannel = "sms" | "whatsapp" | "email";

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
   * WHATSAPP, WHEN THE CALLER OFFERS IT — omitted entirely by the surfaces that do not.
   *
   * Not every message belongs on WhatsApp. A business-initiated WhatsApp message outside a
   * 24-hour conversation window needs an APPROVED TEMPLATE at Meta, so a surface that has no
   * template must not attempt one: Twilio would reject it and the report would read "failed"
   * for something that was never possible.
   *
   * So this is optional rather than a third boolean every caller has to answer. Absent means
   * the decisions come back as they always did — sms, email — and nothing about the other
   * surfaces changes.
   */
  whatsapp?: {
    /** `system_settings.notify_channel_whatsapp` — the same kind of switch as the SMS one. */
    channelOn: boolean;
    /** Twilio account credentials AND a `settings_twilio_whatsapp_number`. */
    configured: boolean;
  };
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

  /*
    SAME ORDER OF REASONS as the SMS decision: an off channel is reported as off even when there
    is also no number, because "turn the channel on" is the action. The extra rung is
    `configured`: WhatsApp needs a sender number of its own, and PENDING_FOR_LEE S15 is the
    record of what reporting a missing number as anything else cost.
  */
  const whatsapp: DeliveryDecision | null = !input.whatsapp
    ? null
    : !input.whatsapp.channelOn
      ? { channel: "whatsapp", to: phone, attempt: false, outcome: "skipped_channel_off" }
      : !input.whatsapp.configured
        ? { channel: "whatsapp", to: phone, attempt: false, outcome: "skipped_not_configured" }
        : !phone
          ? { channel: "whatsapp", to: null, attempt: false, outcome: "skipped_no_address" }
          : { channel: "whatsapp", to: phone, attempt: true, outcome: null };

  const mail: DeliveryDecision = !input.emailConfigured
    ? { channel: "email", to: email, attempt: false, outcome: "skipped_not_configured" }
    : !email
      ? { channel: "email", to: null, attempt: false, outcome: "skipped_no_address" }
      : { channel: "email", to: email, attempt: true, outcome: null };

  return whatsapp ? [sms, whatsapp, mail] : [sms, mail];
}
