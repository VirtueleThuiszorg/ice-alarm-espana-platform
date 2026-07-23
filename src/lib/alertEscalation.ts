import { supabase } from "@/integrations/supabase/client";

/**
 * SINGLE MANUAL-ESCALATION PATH (STAGE_SOS_FIX.md WP-C).
 *
 * Before WP-C, escalating from the queue was a bare `status='escalated'`
 * write followed by a toast claiming "Admin has been notified" — while no
 * alert_escalations row was written and nothing was sent. Now escalation goes
 * through the sos-alert-escalate edge function, which records WHO escalated
 * and sends a real admin WhatsApp via notify-admin, reporting back whether at
 * least one send actually succeeded. Callers must only claim "admin notified"
 * when `notified` is true (GOALS G2 — never lie to the operator).
 *
 * This module owns the ONLY sos-alert-escalate invoke site (test-enforced).
 */

export type EscalateResult =
  | { ok: true; notified: boolean; notifiedCount: number }
  | { ok: false; error: string };

export async function escalateAlertViaFunction(
  alertId: string,
  client: Pick<typeof supabase, "functions"> = supabase,
): Promise<EscalateResult> {
  const { data, error } = await client.functions.invoke("sos-alert-escalate", {
    body: { alert_id: alertId },
  });

  if (error) {
    console.error("[alertEscalation] escalate failed:", error);
    return { ok: false, error: error.message ?? "Escalation failed" };
  }
  if (data?.error) {
    return { ok: false, error: String(data.error) };
  }
  return {
    ok: true,
    notified: Boolean(data?.notified),
    notifiedCount: Number(data?.notified_count ?? 0),
  };
}
