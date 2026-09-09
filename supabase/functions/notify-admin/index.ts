import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { identifyNotifyCaller } from "../_shared/admin-caller.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  legacyResults,
  linkFor,
  madridTimestamp,
  messageFor,
  splitFormatted,
  type NotifyPayload,
} from "../_shared/notify-admin-messages.ts";
import {
  SITE_URL,
  configuredChannels,
  makeStore,
  makeTransports,
  serviceClient,
} from "../_shared/notify-staff-runtime.ts";
import { dispatchNotifications, isNotifyEventType } from "../_shared/notify-staff.ts";

/**
 * notify-admin — NOW AN ADAPTER OVER THE ONE ROUTER.
 *
 * WHAT IT WAS. 250 lines that read `notification_settings` (one row per admin, a boolean COLUMN
 * PER EVENT), formatted a message, POSTed it to Twilio itself, and wrote a `notification_log`
 * row by hand. WhatsApp only. Its schema had already failed in the way a column-per-event
 * schema does: it reads `settings.whatsapp_ev07b_alerts`, a column NO MIGRATION EVER CREATED, so
 * `undefined` made `shouldSend` false and the EV07B WhatsApp alert has never sent — silently,
 * since it shipped.
 *
 * WHAT IT IS. The same twelve messages, byte for byte, handed to `dispatchNotifications`. So it
 * gains SMS, push, email, the bell, per-staff preferences, idempotency and a logged reason for
 * every skip — and loses its own copy of "who gets told".
 *
 * WHY IT IS NOT DELETED. Ten internal callers point here (the SOS escalation runner, the two
 * EV07B functions, the shift monitor, post-payment, partner-register, the emergency-contact
 * helper) plus two admin screens. Every one keeps working, unchanged, including the response
 * shape the "send a test" button reads. Retiring the endpoint is a separate change to twelve
 * call sites; this one is about where the decision is made.
 *
 * THE FOUR LOUD EVENTS STILL CANNOT BE SILENCED. `system.runner_failure` and the three
 * `escalation.*` events were sent here with `shouldSend = true`, deliberately ungated. The
 * router's `ALWAYS_LOUD` bypasses the routes and preferences tables for exactly those four, so
 * that is preserved rather than re-implemented.
 *
 * NOT ON THE SOS DECISION PATH: this notifies ABOUT alerts and escalations. It cannot change who
 * is called or in what order.
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { db, serviceRoleKey } = serviceClient();

    // ── who is calling ───────────────────────────────────────────────────────
    // There was NO check here. This function is not in supabase/config.toml, so `verify_jwt`
    // defaults to true — which stops an anonymous caller and nobody else, and any signed-in user
    // could put text of their choosing on every admin's WhatsApp as a safety alert.
    const verdict = await identifyNotifyCaller(
      db,
      req.headers.get("Authorization"),
      serviceRoleKey,
    );
    if (!verdict.ok) return json(verdict.status, { error: verdict.error });

    const body = (await req.json().catch(() => null)) as NotifyPayload | null;
    if (!body || typeof body !== "object") {
      return json(400, { error: "A JSON body is required" });
    }

    const { event_type, entity_type, entity_id } = body;
    const payload = body.payload ?? {};

    const message = messageFor(event_type, payload, madridTimestamp());
    if (!message || !isNotifyEventType(event_type)) {
      // The `switch` this replaces had `default: console.log(...); continue`, which skipped the
      // event once per configured admin and answered `{success: true, results: []}` — a success
      // for a notification nobody could have received.
      return json(400, { error: `Unknown event_type: ${event_type}`, code: "UNKNOWN_EVENT_TYPE" });
    }

    // First line is the title, the rest is the body, because the router renders `title\nbody` —
    // so the WhatsApp text is the SAME STRING these formatters have always produced.
    const { title, body: messageBody } = splitFormatted(message);

    const { configured, pushConfigError } = await configuredChannels(db);

    const result = await dispatchNotifications(
      {
        type: event_type,
        title,
        body: messageBody,
        // A real path, derived from the payload — not the "➡️ Admin: …" line inside the text,
        // which is prose. A push notification's tap needs somewhere to go.
        link: linkFor(event_type, payload),
        ...(entity_type && entity_id ? { entity: { type: entity_type, id: entity_id } } : {}),
      },
      // Every admin, by role. `notification_settings` had one row per admin and a WhatsApp
      // number on it; the router resolves recipients from `staff` and still prefers that
      // configured number for WhatsApp, so Lee's number keeps receiving.
      { roles: ["admin", "super_admin"] },
      { transports: makeTransports(db, serviceRoleKey), store: makeStore(db), configured, siteUrl: SITE_URL },
    );

    return json(200, {
      success: true,
      // The shape NotificationSettings' test button and PaidSalesFeed already read.
      results: legacyResults(result.outcomes),
      // ...and the router's full answer beside it, for anything written from now on.
      dispatch: result,
      configured,
      ...(pushConfigError ? { pushConfigError } : {}),
    });
  } catch (error) {
    console.error("notify-admin error:", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
