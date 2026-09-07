import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  notifyFulfilment,
  type FulfilmentTransition,
  type NotifyDb,
} from "../_shared/notify-fulfilment.ts";

/**
 * The HTTP edge for WP3's dispatcher. All the deciding is in `_shared/notify-fulfilment.ts`,
 * which is where the tests drive it; this is transport, validation and nothing else.
 *
 * SERVICE ROLE, DELIBERATELY, and it is the one place in this feature that has it.
 * `member_notification_log` has no `authenticated` write path at all (20260907100200) — a client
 * that could write it could fabricate a delivery record, and on a life-safety product the record
 * of what was sent to whom is evidence. So the log is written here, under the service role,
 * behind `verify_jwt`.
 *
 * WHY IT IS CALLED RATHER THAN TRIGGERED. A database trigger cannot make an HTTP request without
 * pg_net, which this project cannot install on the harness (`scripts/rls/run.sh` skips the two
 * pg_net/pg_cron migrations for exactly that reason). So the state edge calls this, and the
 * edges are the three places that move a fulfilment state: `useFulfilmentState`,
 * `linkDeviceToPendantOrder` and `markOrderProgrammed`.
 *
 * The `paid` edge is the exception: it belongs to the payment webhook, and per the brief no PR
 * touching `stripe-webhook` merges. That hook is a separate PR left open for Lee.
 *
 * IT NEVER FAILS THE CALLER. A notification that could not be sent must not undo a fulfilment
 * state that was. The response carries every decision so the caller can surface them, and the
 * status is 200 even when every channel skipped — because "skipped, and here is why for each of
 * six combinations" is a successful dispatch, not an error.
 */

const TRANSITIONS: FulfilmentTransition[] = [
  "allocated",
  "programmed",
  "dispatched",
  "delivered",
  "tested",
  "cancelled",
];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => null);
    const orderId = body?.order_id;
    const transition = body?.transition;

    if (typeof orderId !== "string" || !orderId) {
      return json({ error: "order_id is required" }, 400);
    }
    // Validated against the list rather than cast: an unknown transition would produce an event
    // key no template matches, and every channel would then read `skipped_no_template` — a
    // caller's typo disguised as a content gap.
    if (!TRANSITIONS.includes(transition)) {
      return json(
        { error: `transition must be one of: ${TRANSITIONS.join(", ")}` },
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await notifyFulfilment(
      supabase as unknown as NotifyDb,
      orderId,
      transition as FulfilmentTransition,
    );

    // A fatal means we could not work out who to tell, which IS an error — it is the one case
    // where an empty decision list is not "nothing needed sending".
    if (result.fatal) return json(result, 422);

    return json(result);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
