/**
 * THE ROUTER'S I/O HALF — one implementation, two doors.
 *
 * `_shared/notify-staff.ts` is pure: it decides and it logs, with storage and transports
 * injected. This is what gets injected — the Supabase reads, the Twilio invocations, the FCM
 * send, and the "does this channel have credentials" question.
 *
 * IT LIVES HERE BECAUSE THERE ARE NOW TWO CALLERS. `notify-staff` is the HTTP door for emitters
 * and triggers; `notify-admin` is the old door that ten internal callers and two admin screens
 * already point at, and its WhatsApp path moved onto the router rather than beside it. Copying
 * `makeStore` into the second one would be the seventh copy of "who gets told" — the exact thing
 * this router was built to end.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { twilioConfigured } from "./twilio-configured.ts";

import { sendEmail } from "./email.ts";
import { isMissingColumn, isMissingRelation } from "./pg-errors.ts";
import { resolveServiceAccount, sendPush } from "./fcm.ts";
import {
  NOTIFY_CHANNELS,
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
} from "./notify-staff.ts";

const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://icealarm.es").replace(/\/+$/, "");

/* The Twilio readiness check now lives in its own module, so `send-payment-link` can ask the
   question without importing this one. Imported AND re-exported: `makeTransports` below still
   calls it, and every existing caller of this module is unchanged. */
export { twilioConfigured };

/** Is email live? The provider switch says which transport, and each needs its own secret. */
export async function emailConfigured(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from("email_settings").select("provider").limit(1).maybeSingle();
  const provider = (data?.provider as string | undefined) ?? "gmail";
  return provider === "resend"
    ? !!Deno.env.get("RESEND_API_KEY")
    : !!Deno.env.get("GMAIL_APP_PASSWORD");
}


export function makeStore(db: SupabaseClient): Store {
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
      if (isMissingRelation(error)) {
        // Not applied yet. No routes means no route is on — and the four always-loud events
        // bypass this gate entirely, so the alarms still sound. Said out loud, once, because a
        // deployment routing nothing anywhere is worth seeing in the logs.
        console.warn("notify-staff: notification_routes does not exist yet — every route reads as off");
        return [];
      }
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
      if (isMissingRelation(error)) {
        console.warn("notify-staff: staff_notification_prefs does not exist yet — every preference reads as off");
        return [];
      }
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
      const { data, error } = await db
        .from("notification_log")
        .select("channel, recipient")
        .eq("idempotency_key", idempotencyKey)
        .eq("status", "sent");
      // An empty set is the SAFE failure here, and it is the one this returns for any error:
      // "I cannot tell whether this was already sent" must mean "send it", because a duplicate
      // notification is an annoyance where a suppressed one is the defect this whole feature
      // exists to remove. Pre-migration there is no `idempotency_key` column at all.
      if (error) return new Set();
      return new Set((data ?? []).map((r) => `${r.channel}:${r.recipient}`));
    },

    async log(rows: LogRow[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await db.from("notification_log").insert(rows);
      if (!error) return;

      /*
        THE BELL MUST SURVIVE THE MIGRATION NOT BEING APPLIED.

        `channel`, `recipient` and `idempotency_key` are added by 20260909121500. Until it runs,
        PostgREST rejects the WHOLE insert for an unknown column — so not one row lands, and the
        bell (which reads this table, and is the only channel needing no secret) goes silent
        along with everything else. One retry without the three new columns keeps every row,
        which is exactly the shape notify-admin wrote before this router existed.
      */
      if (isMissingColumn(error)) {
        const legacy = rows.map(({ channel, recipient, idempotency_key, ...rest }) => {
          // The channel is not lost, it moves into the text: a reader looking at an old-shaped
          // row still needs to know whether it was a bell entry or an SMS attempt.
          void recipient;
          void idempotency_key;
          return channel === "bell" ? rest : { ...rest, message: `[${channel}] ${rest.message}` };
        });
        const retry = await db.from("notification_log").insert(legacy);
        console.warn(
          "notify-staff: notification_log is pre-migration — logged without channel/recipient/idempotency_key",
        );
        if (retry.error) {
          console.error("notify-staff: notification_log insert failed:", retry.error.message);
        }
        return;
      }

      // The log is the only evidence any of this happened, so a failure to write it is reported
      // rather than swallowed — but it must not throw away sends that already succeeded.
      console.error("notify-staff: notification_log insert failed:", error.message);
    },

    async pruneToken(token: string): Promise<void> {
      const { error } = await db.from("staff_push_tokens").delete().eq("token", token);
      if (error) console.error("notify-staff: could not prune dead token:", error.message);
    },
  };
}

export function makeTransports(db: SupabaseClient, serviceRoleKey: string): Transports {
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
      // The Edge secret first, then `system_settings` — see resolveServiceAccount. Read per
      // dispatch rather than cached at module scope, so pasting the JSON into Admin → Settings
      // takes effect on the next notification instead of on the next cold start.
      const sa = await resolveServiceAccount({
        env: Deno.env.get("FIREBASE_SERVICE_ACCOUNT"),
        db: db as unknown as Parameters<typeof resolveServiceAccount>[0]["db"],
      });
      if (!sa) {
        // Reached only if `configured.push` said true, i.e. a bug in this file rather than a
        // missing secret — so it is reported per token instead of silently dropping them.
        return tokens.map((token) => ({
          ok: false,
          token,
          invalid: false,
          error: "no Firebase service account — set the Edge secret or paste it in Admin → Settings",
        }));
      }
      return await sendPush(tokens, event, { serviceAccount: sa, siteUrl: SITE_URL });
    },
  };
}


/** The client every caller here uses: service role, because the router reads across all staff. */
export function serviceClient(): { db: SupabaseClient; serviceRoleKey: string } {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return { db: createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey), serviceRoleKey };
}

/**
 * Which transports could send at all — gate 1's second half, answered once per request.
 *
 * A MALFORMED FIREBASE SECRET IS NOT "NOT CONFIGURED". It is a typo in something nobody can read
 * back, so it is returned separately and named in the response rather than hidden behind a skip
 * nobody investigates.
 */
export async function configuredChannels(
  db: SupabaseClient,
): Promise<{ configured: ChannelConfigured; pushConfigError: string | null }> {
  const twilio = await twilioConfigured(db);
  let pushConfigured = false;
  let pushConfigError: string | null = null;
  try {
    pushConfigured = !!(await resolveServiceAccount({
      env: Deno.env.get("FIREBASE_SERVICE_ACCOUNT"),
      db: db as unknown as Parameters<typeof resolveServiceAccount>[0]["db"],
    }));
  } catch (e) {
    // A MALFORMED account is not "not configured": that is a typo in something nobody can read
    // back, so it is named in the response instead of hidden behind a skip nobody investigates.
    pushConfigError = e instanceof Error ? e.message : "the Firebase service account is unusable";
  }
  return {
    configured: {
      sms: twilio.sms,
      whatsapp: twilio.whatsapp,
      push: pushConfigured,
      email: await emailConfigured(db),
    },
    pushConfigError,
  };
}

export { SITE_URL };
