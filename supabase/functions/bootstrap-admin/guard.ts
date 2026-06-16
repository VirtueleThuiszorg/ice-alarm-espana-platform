/**
 * First-admin bootstrap guard (shared, pure, testable).
 * ------------------------------------------------------------------
 * Used by the one-time `bootstrap-admin` edge function. The atomic enforcement lives in
 * the SQL function `public.bootstrap_first_admin` (see migration); this is the fast
 * pre-check that yields a clean 409 and input validation.
 *
 * SECURITY POSTURE: FAIL CLOSED. Unlike the Isabella gate (which fails open on infra
 * error to avoid halting automation), bootstrap must REFUSE on any uncertainty — creating
 * a super_admin when one might already exist is a privilege-escalation risk.
 *
 * Dependency-free (no Deno / no https imports) so it runs in the edge function AND is
 * unit-testable under vitest.
 */

/** Minimal structural type for the count query this guard runs. */
export interface StaffBootstrapClient {
  from(table: string): {
    select(
      columns: string,
      options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
    ): {
      eq(column: string, value: string): Promise<{ count: number | null; error: unknown }>;
    };
  };
}

export type BootstrapDecision =
  | { allowed: true; reason: "no_super_admin" }
  | { allowed: false; reason: "super_admin_exists" | "lookup_error" };

/**
 * May the first-admin bootstrap proceed? Allowed ONLY when zero super_admins exist.
 * Any lookup error/throw -> refused (fail closed).
 */
export async function canBootstrapFirstAdmin(
  client: StaffBootstrapClient,
): Promise<BootstrapDecision> {
  try {
    const { count, error } = await client
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");

    if (error) {
      console.error(
        "[bootstrap-admin] super_admin lookup failed — refusing (fail closed):",
        (error as { message?: string })?.message ?? error,
      );
      return { allowed: false, reason: "lookup_error" };
    }

    if ((count ?? 0) > 0) {
      return { allowed: false, reason: "super_admin_exists" };
    }

    return { allowed: true, reason: "no_super_admin" };
  } catch (e) {
    console.error(
      "[bootstrap-admin] super_admin lookup threw — refusing (fail closed):",
      e instanceof Error ? e.message : e,
    );
    return { allowed: false, reason: "lookup_error" };
  }
}

export interface BootstrapInput {
  user_id?: unknown;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
}

export interface BootstrapValue {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate the bootstrap request body. Returns the normalized value or an error. */
export function validateBootstrapInput(
  input: BootstrapInput,
): { ok: true; value: BootstrapValue } | { ok: false; error: string } {
  const { user_id, email, first_name, last_name } = input;

  if (typeof user_id !== "string" || !UUID_RE.test(user_id)) {
    return { ok: false, error: "user_id must be a valid auth user UUID" };
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return { ok: false, error: "a valid email is required" };
  }
  if (typeof first_name !== "string" || first_name.trim() === "") {
    return { ok: false, error: "first_name is required" };
  }
  if (typeof last_name !== "string" || last_name.trim() === "") {
    return { ok: false, error: "last_name is required" };
  }

  return {
    ok: true,
    value: {
      user_id,
      email: email.trim(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
    },
  };
}
