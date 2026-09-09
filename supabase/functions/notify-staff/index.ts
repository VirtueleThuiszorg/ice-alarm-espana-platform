import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { identifyNotifyCaller } from "../_shared/admin-caller.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  SITE_URL,
  configuredChannels,
  makeStore,
  makeTransports,
  serviceClient,
} from "../_shared/notify-staff-runtime.ts";
import { dispatchNotifications, parseNotifyRequest } from "../_shared/notify-staff.ts";

/**
 * notify-staff — the one door every staff notification goes through.
 *
 * WHO MAY CALL IT: the service role (an edge function, or a trigger through pg_net) and an
 * admin's own JWT (the "send a test notification" button). Nothing else — an operator who could
 * post here could text the whole company, and an anonymous caller could do it from a browser.
 * The rule itself lives in _shared/admin-caller.ts, shared with notify-admin.
 *
 * WHAT IT DOES NOT DECIDE: what fires. Emitters call this from where their event already
 * happens; the routing, the preferences and the logging live in `_shared/notify-staff.ts`, the
 * I/O in `_shared/notify-staff-runtime.ts`, and every decision — including every skip, with its
 * reason — becomes a `notification_log` row.
 *
 * Deliberately NOT on the SOS decision path: this sends notifications ABOUT alerts, and cannot
 * change who is called or in what order. The escalation ladder is untouched.
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
    const { configured, pushConfigError } = await configuredChannels(db);

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
