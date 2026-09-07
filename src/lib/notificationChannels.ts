import type { Database } from "@/integrations/supabase/types";

/**
 * MAY WE CONTACT YOU THIS WAY? — WP3 N9 / D8, the half that was never built.
 *
 * `20260907100200` created `member_notification_optin` and `notify-fulfilment` refuses every send
 * without a row in it:
 *
 *   > "Per-member, per-channel permission to send. One of the TWO gates on any send; the other
 *   > is the global system_settings.notify_channel_* flag. **Absent row means no permission.**"
 *
 * There was no way to create one. No member screen wrote to this table, and no staff screen did
 * either — so every send was `skipped_no_optin`, permanently, and would have stayed that way the
 * day Lee turned a channel on. The dispatcher was complete and could never fire.
 *
 * ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────────────────────────
 *
 * It is permission for SERVICE MESSAGES about their own equipment — dispatched, delivered,
 * tested. It is not marketing, and it is not the SOS path: an emergency call reaches a member
 * whatever is set here, because consent to be told about a delivery is not the thing standing
 * between somebody and an operator. That is worth saying on the screen, and it is said.
 *
 * ── THE RULES ──────────────────────────────────────────────────────────────────────────────
 *
 * WITHDRAWING MUST BE AS EASY AS GIVING. The same control, one press, no dialog and no reason
 * asked for. `opted_in_at` is kept when consent is withdrawn — it is the record of when consent
 * WAS given, and deleting it would erase the evidence for messages we already sent.
 *
 * A CHANNEL WE CANNOT REACH THEM ON CANNOT BE CONSENTED TO. No mobile number means the SMS and
 * WhatsApp controls are off and disabled, saying which detail is missing. A stored `true` for a
 * channel with no address is a row that reads as permission and can never be honoured.
 *
 * WHATSAPP NEEDS A MESSAGE FROM THEM FIRST, and the screen says so rather than implying the
 * toggle is enough. WhatsApp will not deliver a business-initiated message to somebody who has
 * not opened a conversation, so consent recorded here is necessary and not sufficient — hence
 * D8's `wa.me` link, offered after the toggle rather than instead of it.
 */

export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];

/** Which contact detail a channel needs before it can be honoured. */
export type ChannelRequirement = "phone" | "email";

export interface NotificationChannelSpec {
  channel: NotificationChannel;
  label: { key: string; fallback: string };
  description: { key: string; fallback: string };
  requires: ChannelRequirement;
  /** True where consent alone does not let us send — WhatsApp's session rule. */
  needsHandshake: boolean;
}

export const NOTIFICATION_CHANNELS = [
  {
    channel: "email",
    label: { key: "notifications.channel.email", fallback: "Email" },
    description: {
      key: "notifications.channel.emailDesc",
      fallback: "Updates about your pendant and your order, sent to your email address.",
    },
    requires: "email",
    needsHandshake: false,
  },
  {
    channel: "sms",
    label: { key: "notifications.channel.sms", fallback: "Text message" },
    description: {
      key: "notifications.channel.smsDesc",
      fallback: "Short updates by text, to your mobile. No more than a few a month.",
    },
    requires: "phone",
    needsHandshake: false,
  },
  {
    channel: "whatsapp",
    label: { key: "notifications.channel.whatsapp", fallback: "WhatsApp" },
    description: {
      key: "notifications.channel.whatsappDesc",
      fallback: "The same updates on WhatsApp. You need to message us once first — WhatsApp does not let us start the conversation.",
    },
    requires: "phone",
    needsHandshake: true,
  },
] as const satisfies readonly NotificationChannelSpec[];

/**
 * THE RATCHET. A channel added to the `notification_channel` enum stops the build until it has a
 * spec here — a label, a description, the contact detail it needs, and an answer about whether
 * consent alone is enough. A channel the dispatcher can send on and the member cannot consent to
 * is the state this whole module exists to end.
 */
type Covered = (typeof NOTIFICATION_CHANNELS)[number]["channel"];
type Uncovered = Exclude<NotificationChannel, Covered>;
const _everyChannelHasASpec: Uncovered extends never ? true : never = true;
void _everyChannelHasASpec;

export interface MemberContactDetails {
  phone: string | null | undefined;
  email: string | null | undefined;
}

/** Whether we hold what this channel needs. Blank is missing; a string of spaces is blank. */
export function canReachOn(spec: NotificationChannelSpec, contact: MemberContactDetails): boolean {
  const value = spec.requires === "phone" ? contact.phone : contact.email;
  return !!value && value.trim().length > 0;
}

export type OptinRow = { channel: NotificationChannel; opted_in: boolean };

/** Absent row means no permission — the table's own comment, applied in one place. */
export function isOptedIn(rows: OptinRow[] | undefined, channel: NotificationChannel): boolean {
  return rows?.some((r) => r.channel === channel && r.opted_in === true) ?? false;
}

/**
 * The row to write. `opted_in_at` is stamped when consent is GIVEN and left alone when it is
 * withdrawn — the database refuses an opted-in row without it, and the timestamp is the evidence
 * for the messages already sent under it.
 */
export function optinUpsert(input: {
  memberId: string;
  channel: NotificationChannel;
  optedIn: boolean;
  userId: string | null;
  existingOptedInAt: string | null | undefined;
  now?: string;
}): {
  member_id: string;
  channel: NotificationChannel;
  opted_in: boolean;
  opted_in_at: string | null;
  recorded_by_user_id: string | null;
  basis: "member_self";
} {
  const now = input.now ?? new Date().toISOString();
  return {
    member_id: input.memberId,
    channel: input.channel,
    opted_in: input.optedIn,
    opted_in_at: input.optedIn ? now : (input.existingOptedInAt ?? null),
    recorded_by_user_id: input.userId,
    // The member is doing this themselves. `staff_recorded` is a different act with a different
    // evidential weight, and a screen that writes it because the enum has two values is lying.
    basis: "member_self",
  };
}
