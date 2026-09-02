/**
 * Which Twilio number does this message go out from?
 *
 * There used to be one answer — `settings_twilio_phone_number` — and it was
 * used both as the SMS `From` and as the voice `callerId`. Those cannot be the
 * same number here.
 *
 * ICE Alarm's public number is 950 473 199, a geographic landline in Almería.
 * Spanish landlines cannot send SMS at all: Twilio rejects the request outright
 * with error 21614. So the moment that number is entered as "the Twilio phone
 * number", every emergency-contact SMS stops leaving the building — and it
 * stops quietly, one failed POST at a time, on the path that tells a family
 * their mother has fallen.
 *
 * Point the setting at an SMS-capable mobile instead and the opposite happens:
 * SMS works, and every escalation call arrives at an operator or a family
 * member showing a number none of them recognise, at three in the morning.
 *
 * Hence two settings:
 *
 *   settings_twilio_sms_number       an SMS-capable long code (+34 6xx / 7xx).
 *                                    Carries emergency-contact alerts, member
 *                                    SMS, and the inbound replies to both.
 *
 *   settings_twilio_voice_caller_id  the number people should SEE when we ring
 *                                    them — 950 473 199. It does not have to be
 *                                    a Twilio number: a verified outgoing caller
 *                                    ID works, which means the line can stay
 *                                    where it is while the platform borrows its
 *                                    identity.
 *
 * Both fall back to the old single setting, so a deployment where the new rows
 * have not been filled in behaves exactly as it did before rather than losing
 * its numbers. The fallback is a bridge, not a destination — 20260902150000
 * seeds the new rows from the old one.
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SMS_NUMBER_KEY = "settings_twilio_sms_number";
export const VOICE_CALLER_ID_KEY = "settings_twilio_voice_caller_id";
export const LEGACY_NUMBER_KEY = "settings_twilio_phone_number";

export interface TwilioNumbers {
  /** `From` on every outbound SMS. Must be SMS-capable. */
  sms: string;
  /** `callerId` / `From` on every outbound voice call. May be a landline. */
  voice: string;
  /** True when the SMS number looks like something that cannot carry SMS. */
  smsNumberLooksLikeALandline: boolean;
}

/**
 * Spanish geographic numbers begin 8 or 9; mobiles begin 6 or 7. This is a
 * smell test for logging, never a gate: it must never be the reason an SOS
 * notification is not attempted. Twilio is the authority on what it will send,
 * and a wrong guess here should cost a log line, not a message.
 */
export function looksLikeSpanishLandline(number: string): boolean {
  const digits = number.replace(/[^\d+]/g, "");
  return /^(\+34|0034|34)?[89]\d{8}$/.test(digits);
}

export async function loadTwilioNumbers(sb: SupabaseClient): Promise<TwilioNumbers> {
  const { data } = await sb
    .from("system_settings")
    .select("key, value")
    .in("key", [SMS_NUMBER_KEY, VOICE_CALLER_ID_KEY, LEGACY_NUMBER_KEY]);

  const cfg: Record<string, string> = {};
  (data ?? []).forEach((row: { key: string; value: string }) => {
    if (row?.value) cfg[row.key] = row.value;
  });

  const legacy = cfg[LEGACY_NUMBER_KEY] || "";
  const sms = cfg[SMS_NUMBER_KEY] || legacy;
  const voice = cfg[VOICE_CALLER_ID_KEY] || legacy;

  return {
    sms,
    voice,
    smsNumberLooksLikeALandline: !!sms && looksLikeSpanishLandline(sms),
  };
}

/**
 * Shout about a misconfigured SMS sender at the moment it is used, because the
 * alternative is a 21614 buried in a Twilio log that nobody reads until someone
 * asks why the family were never told.
 */
export function warnIfSmsNumberCannotSendSms(numbers: TwilioNumbers, context: string): void {
  if (numbers.smsNumberLooksLikeALandline) {
    console.error(
      `[twilio-numbers] ${context}: ${SMS_NUMBER_KEY} is "${numbers.sms}", which looks ` +
        `like a Spanish landline. Spanish landlines cannot send SMS (Twilio error 21614). ` +
        `Set it to an SMS-capable mobile (+34 6xx/7xx) — the landline belongs in ` +
        `${VOICE_CALLER_ID_KEY}.`,
    );
  }
}
