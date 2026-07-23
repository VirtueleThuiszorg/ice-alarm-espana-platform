import { supabase } from "@/integrations/supabase/client";

/**
 * SINGLE RESOLVE PATH for alerts (STAGE_SOS_FIX.md WP-B).
 *
 * Before WP-B the call-centre queue, the admin alerts page and the two device
 * panels resolved alerts with direct `status='resolved'` table writes — which,
 * for an SOS, skipped the `sos-alert-resolve` edge function's close-out
 * (Twilio conference teardown, contact notification, courtesy-call
 * scheduling). Now every resolve goes through the edge function; it is
 * alert-type-aware server-side (SOS alerts require notes and get the full
 * close-out; non-SOS alerts get a plain resolve + a no-op teardown).
 *
 * This module owns the ONLY `sos-alert-resolve` invoke site (enforced by
 * src/test/alertResolution.test.ts).
 */

export interface ResolveAlertOptions {
  notes?: string;
  isFalseAlarm?: boolean;
  resolutionType?: string;
}

export type ResolveAlertResult = { ok: true } | { ok: false; error: string };

export async function resolveAlertViaFunction(
  alertId: string,
  { notes, isFalseAlarm, resolutionType }: ResolveAlertOptions = {},
  client: Pick<typeof supabase, "functions"> = supabase,
): Promise<ResolveAlertResult> {
  const { data, error } = await client.functions.invoke("sos-alert-resolve", {
    body: {
      alert_id: alertId,
      resolution_notes: notes ?? "",
      is_false_alarm: isFalseAlarm ?? false,
      resolution_type: resolutionType,
    },
  });

  if (error) {
    console.error("[alertResolution] resolve failed:", error);
    return { ok: false, error: error.message ?? "Resolve failed" };
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    return { ok: false, error: String((data as { error: string }).error) };
  }
  return { ok: true };
}
