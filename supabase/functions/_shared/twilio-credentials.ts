/**
 * Shared Twilio credential loader for edge functions.
 * Env vars take priority; falls back to system_settings table.
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  sosNumber: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
}

/**
 * Load Twilio credentials from env vars first, falling back to system_settings.
 */
export async function loadTwilioCredentials(
  sb: SupabaseClient,
): Promise<TwilioCredentials> {
  let accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  let authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  let sosNumber = Deno.env.get("TWILIO_SOS_NUMBER") || "";

  // Fall back to system_settings if env vars missing
  if (!accountSid || !authToken || !sosNumber) {
    const { data: settings } = await sb
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_twilio_account_sid",
        "settings_twilio_auth_token",
        "settings_twilio_phone_number",
      ]);

    const cfg: Record<string, string> = {};
    settings?.forEach((s: { key: string; value: string }) => {
      cfg[s.key] = s.value;
    });

    if (!accountSid) accountSid = cfg.settings_twilio_account_sid || "";
    if (!authToken) authToken = cfg.settings_twilio_auth_token || "";
    if (!sosNumber) sosNumber = cfg.settings_twilio_phone_number || "";
  }

  return {
    accountSid,
    authToken,
    sosNumber,
    apiKeySid: Deno.env.get("TWILIO_API_KEY_SID") || "",
    apiKeySecret: Deno.env.get("TWILIO_API_KEY_SECRET") || "",
    twimlAppSid: Deno.env.get("TWILIO_TWIML_APP_SID") || "",
  };
}

/**
 * Returns a base64-encoded Basic Auth string for Twilio REST API calls.
 */
export function twilioAuth(sid: string, token: string): string {
  return btoa(`${sid}:${token}`);
}
