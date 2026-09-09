/**
 * WHO MAY RAISE AN ADMIN NOTIFICATION.
 *
 * `notify-admin` had no caller check at all. It is not listed in `supabase/config.toml`, so
 * `verify_jwt` defaults to true — which stops an anonymous caller and nobody else. Any signed-in
 * user, a member on the client surface included, could POST
 *
 *     { event_type: "escalation.call_failed", payload: { member_name: "<anything>" } }
 *
 * and Twilio would put that text on every admin's WhatsApp, logged as a genuine safety alert.
 * Two harms, and the second is the worse one: an admin who learns that the SOS-ladder alert can
 * be faked stops trusting the one message that must never be ignored.
 *
 * SO THERE ARE EXACTLY TWO KINDS OF CALLER:
 *
 *   * `service_role` — an edge function or a pg_net trigger, holding the service-role key. This
 *     is how the ten internal callers reach it.
 *   * `admin` — an admin or super_admin's own JWT, which is how the "send a test notification"
 *     button and the paid-sales feed reach it from the browser.
 *
 * An operator is deliberately NOT enough. Somebody who can post here can text the whole company.
 *
 * WHY IT IS SHARED: `notify-staff` needs the identical two-caller rule, and the check that
 * exists in six other functions has been copied six times with small differences (`.single()`
 * vs `.maybeSingle()`, `authError` checked or not). One implementation, one set of tests.
 */

/**
 * Only the two calls the guard makes, written out rather than importing `SupabaseClient`.
 *
 * Two reasons, and the second is the one that matters: a remote `https://esm.sh/...` import is
 * unresolvable to `tsc` in the SPA's project (this file is imported by its tests), and a
 * structural type makes the guard drivable from a plain object — so the tests below can hand it
 * a member's JWT and an operator's staff row without a database.
 */
export interface CallerLookup {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string } | null } | null;
      error: { message: string } | null;
    }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          maybeSingle(): Promise<{ data: { role: string } | null; error: unknown }>;
        };
      };
    };
  };
}

export type CallerKind = "service_role" | "admin";

export type CallerVerdict =
  | { ok: true; caller: CallerKind; userId: string | null }
  | { ok: false; status: 401 | 403; error: string };

/** The roles that may raise a notification to every admin. */
export const NOTIFY_CALLER_ROLES = ["admin", "super_admin"] as const;

/**
 * Identify the caller behind an `Authorization` header.
 *
 * The service-role comparison is first and is an exact string match: an internal caller must
 * never depend on a round trip to the auth server, because the loud safety alerts are raised by
 * runners at the moment something is already going wrong.
 */
export async function identifyNotifyCaller(
  db: CallerLookup,
  authHeader: string | null,
  serviceRoleKey: string,
): Promise<CallerVerdict> {
  const bearer = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  // This is also what stops an UNSET secret from authorising everybody. If
  // SUPABASE_SERVICE_ROLE_KEY were missing from the function's environment, the only bearer that
  // could equal it is the empty one — and the empty one is refused here, before the comparison.
  // (A `serviceRoleKey && …` clause below would say the same thing twice: no test could tell the
  // two versions apart, and a guard nothing can distinguish from its own absence is decoration.)
  if (!bearer) return { ok: false, status: 401, error: "Unauthorized" };

  // EXACT match, never a prefix and never `.includes()`: a caller holding any string that merely
  // contains — or is contained by — the key would be promoted to the service role, which is the
  // one identity that skips the role check entirely.
  if (bearer === serviceRoleKey) {
    return { ok: true, caller: "service_role", userId: null };
  }

  const { data: userData, error: authError } = await db.auth.getUser(bearer);
  if (authError || !userData?.user) return { ok: false, status: 401, error: "Invalid token" };

  const { data: staff } = await db
    .from("staff")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!staff || !(NOTIFY_CALLER_ROLES as readonly string[]).includes(staff.role)) {
    return { ok: false, status: 403, error: "Admin access required" };
  }

  return { ok: true, caller: "admin", userId: userData.user.id };
}
