import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import { identifyNotifyCaller } from "../_shared/admin-caller.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { parseServiceAccount, sendPush } from "../_shared/fcm.ts";
import {
  NOTIFY_CHANNELS,
  dispatchNotifications,
  parseNotifyRequest,
  type Audience,
  type ChannelConfigured,
  type ChannelFlags,
  type LogRow,
  type NotifyChannel,
  type Pref,
  type Recipient,
  type Route,
  type SendResult,
  type Store,
  type Transports,
} from "../_shared/notify-staff.ts";

/**
 * notify-staff — the one door every staff notification goes through.
 *
 * WHO MAY CALL IT: the service role (an edge function, or a trigger through pg_net) and an
 * admin's own JWT (the "send a test notification" button). Nothing else — an operator who could
 * post here could text the whole company, and an anonymous caller could do it from a browser.
 *
 * WHAT IT DOES NOT DECIDE: what fires. Emitters call this from where their event already
 * happens; the routing, the preferences and the logging live in `_shared/notify-staff.ts`, and
 * every decision — including every skip, with its reason — becomes a `notification_log` row.
 *
 * Deliberately NOT on the SOS decision path: this sends notifications ABOUT alerts, and cannot
 * change who is called or in what order. The escalation ladder is untouched.
 */

const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://icealarm.es").replace(/\/+$/, "");

/** Twilio credentials, read once — the same three settings twilio-sms itself reads. */
async function twilioConfigured(db: SupabaseClient): Promise<{ sms: boolean; whatsapp: boolean }> {
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

/** Is email live? The provider switch says which transport, and each needs its own secret. */
async function emailConfigured(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from("email_settings").select("provider").limit(1).maybeSingle();
  const provider = (data?.provider as string | undefined) ?? "gmail";
  return provider === "resend"
    ? !!Deno.env.get("RESEND_API_KEY")
    : !!Deno.env.get("GMAIL_APP_PASSWORD");
}

function makeStore(db: SupabaseClient): Store {
  return {
    async recipients(audience: Audience): Promise<Recipient[]> {
      const roles = audience.roles ?? [];
      const ids = audience.staffIds ?? [];
      if (roles.length === 0 && ids.length === 0) return [];

      // Two filters, one query, and `.or()` rather than two round trips. Active staff only: a
      // deactivated account is not somebody to text.
      let query = db
        .from("staff")
        .select("id, user_id, first_name, role, email, phone, personal_mobile")
        .eq("is_active", true);

      if (roles.length && ids.length) {
        query = query.or(`role.in.(${roles.join(",")}),id.in.(${ids.join(",")})`);
      } else if (roles.length) {
        query = query.in("role", roles);
      } else {
        query = query.in("id", ids);
      }

      const { data: staff, error } = await query;
      if (error) throw error;
      const rows = staff ?? [];
      if (rows.length === 0) return [];

      const userIds = rows.map((s) => s.user_id).filter((v): v is string => !!v);
      const [{ data: tokens }, { data: settings }] = await Promise.all([
        db.from("staff_push_tokens").select("staff_id, token, platform").in("staff_id", rows.map((s) => s.id)),
        userIds.length
          ? db.from("notification_settings").select("admin_user_id, whatsapp_number").in("admin_user_id", userIds)
          : Promise.resolve({ data: [] as Array<{ admin_user_id: string; whatsapp_number: string | null }> }),
      ]);

      const whatsappByUser = new Map(
        (settings ?? []).map((s) => [s.admin_user_id, s.whatsapp_number]),
      );

      return rows.map((s) => ({
        staffId: s.id,
        userId: s.user_id ?? null,
        firstName: s.first_name,
        role: s.role,
        email: s.email ?? null,
        // The mobile an operator is actually reached on, then the desk number.
        phone: (s.personal_mobile as string | null) ?? s.phone ?? null,
        whatsappNumber: (s.user_id ? whatsappByUser.get(s.user_id) : null) ?? null,
        pushTokens: (tokens ?? [])
          .filter((t) => t.staff_id === s.id)
          .map((t) => ({ token: t.token, platform: t.platform })),
      }));
    },

    async routes(): Promise<Route[]> {
      const { data, error } = await db
        .from("notification_routes")
        .select("event_type, channel, enabled");
      if (error) throw error;
      return data ?? [];
    },

    async prefs(staffIds: string[], eventType: string): Promise<Pref[]> {
      if (staffIds.length === 0) return [];
      const { data, error } = await db
        .from("staff_notification_prefs")
        .select("staff_id, event_type, channel, enabled")
        .eq("event_type", eventType)
        .in("staff_id", staffIds);
      if (error) throw error;
      return data ?? [];
    },

    async flags(): Promise<ChannelFlags> {
      const { data } = await db
        .from("system_settings")
        .select("key, value")
        .in("key", NOTIFY_CHANNELS.map((c) => `notify_channel_${c}`));
      const on = (c: NotifyChannel) =>
        data?.find((r) => r.key === `notify_channel_${c}`)?.value === "true";
      return { sms: on("sms"), whatsapp: on("whatsapp"), push: on("push"), email: on("email") };
    },

    async alreadySent(idempotencyKey: string | null): Promise<Set<string>> {
      if (!idempotencyKey) return new Set();
      const { data } = await db
        .from("notification_log")
        .select("channel, recipient")
        .eq("idempotency_key", idempotencyKey)
        .eq("status", "sent");
      return new Set((data ?? []).map((r) => `${r.channel}:${r.recipient}`));
    },

    async log(rows: LogRow[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await db.from("notification_log").insert(rows);
      // The log is the only evidence any of this happened, so a failure to write it is reported
      // rather than swallowed — but it must not throw away sends that already succeeded.
      if (error) console.error("notify-staff: notification_log insert failed:", error.message);
    },

    async pruneToken(token: string): Promise<void> {
      const { error } = await db.from("staff_push_tokens").delete().eq("token", token);
      if (error) console.error("notify-staff: could not prune dead token:", error.message);
    },
  };
}

function makeTransports(db: SupabaseClient, serviceRoleKey: string): Transports {
  /** twilio-sms / twilio-whatsapp both take {to, message} and both require a bearer token. */
  const viaTwilio = async (fn: "twilio-sms" | "twilio-whatsapp", to: string, text: string): Promise<SendResult> => {
    try {
      const { data, error } = await db.functions.invoke(fn, {
        body: { to, message: text, recipientType: "staff" },
        headers: { Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (error) return { ok: false, error: error.message };
      const payload = data as { success?: boolean; sid?: string; error?: string } | null;
      if (payload?.error) return { ok: false, error: payload.error };
      return { ok: true, providerMessageId: payload?.sid };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : `${fn} failed` };
    }
  };

  return {
    sms: (to, text) => viaTwilio("twilio-sms", to, text),
    whatsapp: (to, text) => viaTwilio("twilio-whatsapp", to, text),
    async email(to, subject, html) {
      const result = await sendEmail(to, subject, html);
      return { ok: result.success, error: result.error };
    },
    async push(tokens, event) {
      const sa = parseServiceAccount(Deno.env.get("FIREBASE_SERVICE_ACCOUNT"));
      if (!sa) {
        // Reached only if `configured.push` said true, i.e. a bug in this file rather than a
        // missing secret — so it is reported per token instead of silently dropping them.
        return tokens.map((token) => ({
          ok: false,
          token,
          invalid: false,
          error: "FIREBASE_SERVICE_ACCOUNT is not set",
        }));
      }
      return await sendPush(tokens, event, { serviceAccount: sa, siteUrl: SITE_URL });
    },
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    // ── who is calling ───────────────────────────────────────────────────────
    // The service role (an edge function or a pg_net trigger) or an admin's own JWT — and
    // nothing else, because an operator who could post here could text the whole company.
    // Shared with notify-admin: one rule, one set of tests. See _shared/admin-caller.ts.
    const verdict = await identifyNotifyCaller(
      db,
      req.headers.get("Authorization"),
      serviceRoleKey,
    );
    if (!verdict.ok) return json(verdict.status, { error: verdict.error });
    const caller = verdict.caller;

    // ── the event ────────────────────────────────────────────────────────────
    // Validated by `parseNotifyRequest` in the shared module rather than by four `if`s here:
    // the same guards used to be asserted by source scan, and mutation proved that worthless —
    // deleting the event-type check left the error STRING in place and the suite green.
    const parsed = parseNotifyRequest(await req.json().catch(() => null));
    if (!parsed.ok) {
      return json(400, { error: parsed.problem.error, code: parsed.problem.code });
    }
    const { event, audience } = parsed.request;

    // ── which transports could send at all ───────────────────────────────────
    const twilio = await twilioConfigured(db);
    let pushConfigured = false;
    let pushConfigError: string | null = null;
    try {
      pushConfigured = !!parseServiceAccount(Deno.env.get("FIREBASE_SERVICE_ACCOUNT"));
    } catch (e) {
      // A malformed secret is not "not configured": it is a typo in something nobody can read
      // back, so it is named in the response rather than hidden behind a skip.
      pushConfigError = e instanceof Error ? e.message : "FIREBASE_SERVICE_ACCOUNT is unusable";
    }

    const configured: ChannelConfigured = {
      sms: twilio.sms,
      whatsapp: twilio.whatsapp,
      push: pushConfigured,
      email: await emailConfigured(db),
    };

    const result = await dispatchNotifications(
      event,
      audience,
      { transports: makeTransports(db, serviceRoleKey), store: makeStore(db), configured, siteUrl: SITE_URL },
    );

    return json(200, {
      ...result,
      caller,
      configured,
      ...(pushConfigError ? { pushConfigError } : {}),
    });
  } catch (error) {
    console.error("notify-staff error:", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
