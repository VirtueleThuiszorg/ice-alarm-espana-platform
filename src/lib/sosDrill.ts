import { supabase } from "@/integrations/supabase/client";

/**
 * SOS drill client (admin-only; the edge function enforces the role).
 *
 * Creates a SAFE test SOS alert for live drills of the emergency path:
 * ladder-suppressed (escalation_level_reached = 5 ⇒ the escalation runner has
 * no next rung ⇒ it NEVER places calls), attached to a dedicated clearly
 * labelled drill member, and fully claimable/resolvable through the normal
 * operator UI. See supabase/functions/sos-drill/index.ts for the full safety
 * argument.
 */

export type DrillResult =
  | { ok: true; alertId?: string; alertsDeleted?: number }
  | { ok: false; error: string };

export async function createDrillAlert(
  client: Pick<typeof supabase, "functions"> = supabase,
): Promise<DrillResult> {
  const { data, error } = await client.functions.invoke("sos-drill", {
    body: { action: "create" },
  });
  if (error) return { ok: false, error: error.message ?? "Drill create failed" };
  if (data?.error) return { ok: false, error: String(data.error) };
  return { ok: true, alertId: data?.alert_id };
}

export async function cleanupDrillAlerts(
  client: Pick<typeof supabase, "functions"> = supabase,
): Promise<DrillResult> {
  const { data, error } = await client.functions.invoke("sos-drill", {
    body: { action: "cleanup" },
  });
  if (error) return { ok: false, error: error.message ?? "Drill cleanup failed" };
  if (data?.error) return { ok: false, error: String(data.error) };
  return { ok: true, alertsDeleted: data?.alerts_deleted ?? 0 };
}
