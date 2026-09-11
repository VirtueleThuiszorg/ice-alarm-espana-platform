/**
 * IS TWILIO ACTUALLY ABLE TO SEND — the same three settings `twilio-sms` itself reads.
 *
 * Lifted out of `notify-staff-runtime.ts` so a surface that needs only this answer does not have
 * to import that module's whole world (email, Firebase, the dispatch loop). It re-exports this,
 * so there is still one implementation: two copies of "is WhatsApp configured" is how one screen
 * reports "not configured" while another queues Twilio 400s.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Twilio credentials, read once — the same three settings twilio-sms itself reads. */
export async function twilioConfigured(db: SupabaseClient): Promise<{ sms: boolean; whatsapp: boolean }> {
  const { data } = await db
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "settings_twilio_account_sid",
      "settings_twilio_auth_token",
      "settings_twilio_api_key_secret",
      "settings_twilio_sms_number",
      "settings_twilio_whatsapp_number",
    ]);
  const get = (k: string) => data?.find((r) => r.key === k)?.value?.trim() || "";
  const account = !!get("settings_twilio_account_sid")
    && (!!get("settings_twilio_auth_token") || !!get("settings_twilio_api_key_secret"));
  return {
    // A number is as necessary as a credential: `twilio-sms` refuses without one, and reporting
    // "not configured" is better than a queue of Twilio 400s (PENDING_FOR_LEE S15 is exactly
    // that lesson, on the WhatsApp number).
    sms: account && !!get("settings_twilio_sms_number"),
    whatsapp: account && !!get("settings_twilio_whatsapp_number"),
  };
}

