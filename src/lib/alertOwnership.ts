import { supabase } from "@/integrations/supabase/client";

/**
 * SINGLE SOURCE OF TRUTH for alert ownership (STAGE_SOS_FIX.md WP-A).
 *
 * Before WP-A the queue claimed with `claimed_by` (direct write, no guard) while
 * the SOS takeover accepted with `accepted_by_staff_id` (guarded) — so the two
 * surfaces could disagree about who owns an alert, and a queue-claimed SOS never
 * appeared as active on the SOS page.
 *
 * Now: `accepted_by_staff_id` is the CANONICAL ownership field for every alert
 * type, and this module owns the ONLY write path to it (enforced by
 * src/test/alertOwnership.test.ts's source-scan invariant). `claimed_by` /
 * `claimed_at` are written as a legacy MIRROR for one release — the admin
 * AlertsTab/AlertsPage joins, the SLA dashboard's response times, and
 * ShiftHistory all still read them. Dropping the mirror is a follow-up
 * (reversible migration) once those readers move to the canonical field.
 */

/** Alert types handled by the SOS takeover screen (was duplicated in useSOSTakeover). */
export const SOS_ALERT_TYPES = ["sos_button", "fall_detected"] as const;
export type SosAlertType = (typeof SOS_ALERT_TYPES)[number];

export function isSosAlertType(alertType: string | null | undefined): boolean {
  return (SOS_ALERT_TYPES as readonly string[]).includes(alertType ?? "");
}

export type AcceptAlertResult =
  | { ok: true; alert: Record<string, unknown> }
  | { ok: false; reason: "already_accepted" | "error" };

/**
 * Atomically take ownership of an alert.
 *
 * Guarded (`accepted_by_staff_id IS NULL`), so two operators — on the SAME or
 * DIFFERENT screens — can never both win: the second caller gets
 * `already_accepted` instead of silently overwriting the first.
 *
 * Writes, in one UPDATE:
 *  - accepted_by_staff_id + accepted_at  (canonical ownership)
 *  - claimed_by + claimed_at             (legacy mirror, keeps SLA/history/admin joins working)
 *  - status = 'in_progress'
 *
 * `client` is injectable for tests only; production callers use the default.
 */
export async function acceptAlertOwnership(
  alertId: string,
  staffId: string,
  client: Pick<typeof supabase, "from"> = supabase,
): Promise<AcceptAlertResult> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("alerts")
    .update({
      accepted_by_staff_id: staffId,
      accepted_at: now,
      claimed_by: staffId,
      claimed_at: now,
      status: "in_progress",
    })
    .eq("id", alertId)
    .is("accepted_by_staff_id", null) // concurrency guard — only if unowned
    .select()
    .maybeSingle();

  if (error) {
    console.error("[alertOwnership] accept failed:", error);
    return { ok: false, reason: "error" };
  }
  if (!data) {
    // Guard matched no row: someone else already owns it (or it no longer exists).
    return { ok: false, reason: "already_accepted" };
  }
  return { ok: true, alert: data as Record<string, unknown> };
}

/**
 * Pure derivations used by the SOS takeover page to partition alerts.
 * Extracted from useSOSTakeover so the "queue claim → SOS page sees it as
 * active" contract is directly unit-testable against the exact fields
 * acceptAlertOwnership writes.
 */
export function deriveActiveAlert<T extends { accepted_by_staff_id: string | null }>(
  alerts: T[],
  staffId: string | null,
): T | null {
  if (!staffId) return null;
  return alerts.find((a) => a.accepted_by_staff_id === staffId) || null;
}

export function derivePendingAlerts<T extends { accepted_by_staff_id: string | null }>(
  alerts: T[],
): T[] {
  return alerts.filter((a) => !a.accepted_by_staff_id);
}
