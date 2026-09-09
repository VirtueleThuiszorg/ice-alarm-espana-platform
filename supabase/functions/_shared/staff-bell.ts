/**
 * Telling a human that money went wrong.
 *
 * WHY TARGETED AND NOT A BROADCAST. `notification_log` supports both: a row with
 * `admin_user_id IS NULL` is a staff broadcast that everybody sees, and a row with a user id
 * belongs to that person. Money problems route to `/admin/orders` and `/admin/subscriptions`,
 * and the whole `/admin` tree is behind `requireStaff requireAdmin` — so a broadcast would put
 * a bell in front of every call-centre operator that lands them on `/unauthorized` when they
 * click it. Worse, a broadcast row is SHARED: the first person to mark it read clears it for
 * everyone, including the admin who had not seen it yet. So these are addressed to the people
 * who can act on them.
 *
 * IT NEVER THROWS. A webhook that 500s because a bell failed is a webhook Stripe retries, and
 * the retry re-runs whatever already succeeded. The failure is logged and reported in the
 * return value instead, so the caller can record "the money was refused AND nobody was told",
 * which is a different and worse fact than either alone.
 *
 * ── NOT A DUPLICATE OF `_shared/notify-staff.ts`, and the reason matters ────
 *
 * Another session landed a staff-notification ROUTER while this was in review, and two modules
 * that both "tell staff something" is exactly the duplicate parallel implementation the
 * engineering bar forbids — so it was checked rather than assumed. They cover DIFFERENT
 * CHANNELS:
 *
 *   notify-staff.ts   `NOTIFY_CHANNELS = ["sms", "whatsapp", "push", "email"]` — the four
 *                     OUTBOUND channels. Every one is gated on a production secret or a
 *                     `notify_channel_*` flag, and all three flags are OFF in production
 *                     (STATE.md, D7).
 *   this module       `notification_log` — the IN-APP bell. No secret, no flag; published to
 *                     `supabase_realtime`, so it is the only channel provable from this repo.
 *
 * The router has no in-app channel at all. So routing these alerts through it INSTEAD would
 * mean that today — with the flags off — a payment mismatch, a subscription that failed to
 * activate and a failed renewal would tell NOBODY. That is the failure this module exists to
 * prevent, so it stays.
 *
 * THE RIGHT END STATE is one call that raises the bell AND fans out to whichever outbound
 * channels are on, with the bell unconditional. That is a change to the router's contract (it
 * would need an always-on `in_app` channel), which belongs to whoever owns it — not something
 * to force from this side by deleting the only notifier that currently works.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Roles that can open the pages these notifications link to. */
const NOTIFIED_ROLES = ["admin", "super_admin"];

export interface AdminBell {
  /** Routed by `src/lib/notificationLink.ts`. Use "system" unless a better type exists. */
  eventType: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface BellResult {
  notified: number;
  error: string | null;
}

/**
 * Put one notification in front of every active admin.
 *
 * One row per person rather than one shared row, for the reason in the header: a bell that
 * disappears when a colleague reads it is a bell that did not reach you.
 */
export async function notifyAdmins(db: SupabaseClient, bell: AdminBell): Promise<BellResult> {
  try {
    const { data: admins, error: staffError } = await db
      .from("staff")
      .select("user_id, role")
      .eq("is_active", true)
      .in("role", NOTIFIED_ROLES);

    if (staffError) return { notified: 0, error: `staff lookup failed: ${staffError.message}` };

    // `staff.user_id` is NOT NULL in the schema, so this filter is belt to braces rather than
    // an expected case — but inserting a null admin_user_id would silently turn a targeted
    // notification into a broadcast, which is the exact thing this module exists to avoid.
    const recipients = (admins ?? [])
      .map((s: { user_id: string | null }) => s.user_id)
      .filter((id: string | null): id is string => Boolean(id));

    if (recipients.length === 0) {
      return { notified: 0, error: "no active admin has a user account to notify" };
    }

    const { error: insertError } = await db.from("notification_log").insert(
      recipients.map((userId) => ({
        admin_user_id: userId,
        event_type: bell.eventType,
        message: bell.message,
        entity_type: bell.entityType ?? null,
        entity_id: bell.entityId ?? null,
        status: "pending",
      })),
    );

    if (insertError) return { notified: 0, error: `insert failed: ${insertError.message}` };
    return { notified: recipients.length, error: null };
  } catch (e) {
    return { notified: 0, error: e instanceof Error ? e.message : "unknown error" };
  }
}
