/**
 * contact-notify-outcome.ts — the answer `emergency-contact-notify` gives, and what a caller
 * must do with it.
 *
 * WHY THIS EXISTS. Before this module the function returned
 * `{success: true, notified: 0, reason: "no_contacts"}` at HTTP 200 for a member with NO
 * emergency contacts. A caller checking `success` could not tell "there was nobody to call"
 * from "the entire chain was reached" — a life-safety lie on the highest-priority path in the
 * product (GOALS.md G2: never leave anyone believing they are protected when they aren't).
 * Worse, the same branch also absorbed `contactsError`, so a *failed read* of
 * `emergency_contacts` — contacts that exist and could have been called — produced the
 * byte-identical payload as an empty table. Those are opposite facts.
 *
 * The outcome is now a discriminated union on `outcome`, and `success` means what its name
 * says. A caller that reads only `outcome` is correct; a caller that only checks `res.ok` is
 * also correct, because every not-notified outcome carries a non-2xx status.
 *
 * Pure and dependency-free so it is unit-testable under vitest — the Deno function itself
 * cannot be imported there (same pattern as escalation-outcome.ts / escalation-loop.ts).
 * See src/test/emergencyContactOutcome.test.ts and READINESS_MODEL.md §5.
 */

export type NotifyOutcome =
  /** ≥1 contact reached on ≥1 channel. The only outcome that is a success. */
  | "notified"
  /** Contacts exist; every channel failed for every one of them. */
  | "all_failed"
  /** The member has NO emergency contacts. Nobody could be called. */
  | "no_contacts"
  /** The read of emergency_contacts FAILED. Contacts may well exist. */
  | "contacts_unreadable";

export interface NotifyResult {
  outcome: NotifyOutcome;
  /** True only for `notified`. Kept so existing consumers get safer, never less safe. */
  success: boolean;
  /** Contacts reached on at least one channel. */
  notified: number;
  /** Contacts that were candidates. 0 for `no_contacts`; unknown (0) for `contacts_unreadable`. */
  total: number;
}

/**
 * HTTP status per outcome.
 *
 * 409 for `no_contacts` is deliberate. Not 200 — that is the bug. Not 500 — nothing failed;
 * the request was processed correctly and the answer is "there is nobody". Not 404 — the
 * member exists, and 404 is already this function's "member not found". 409 Conflict says the
 * request is well-formed but the resource's state makes it impossible to satisfy, so a caller
 * that only ever checks `res.ok` gets the right answer for free.
 *
 * 503 for `contacts_unreadable` marks it retryable: an empty table will still be empty in ten
 * seconds, a failed read might succeed.
 */
export const NOTIFY_OUTCOME_STATUS: Record<NotifyOutcome, number> = {
  notified: 200,
  all_failed: 502,
  no_contacts: 409,
  contacts_unreadable: 503,
};

/** Build the result for a run that actually had contacts to try. */
export function resultForAttempted(notified: number, total: number): NotifyResult {
  const outcome: NotifyOutcome = notified > 0 ? "notified" : "all_failed";
  return { outcome, success: outcome === "notified", notified, total };
}

/** The member has no emergency contacts. Nobody could be called. */
export function resultForNoContacts(): NotifyResult {
  return { outcome: "no_contacts", success: false, notified: 0, total: 0 };
}

/** The contacts read failed. Distinct from an empty table — see the module header. */
export function resultForUnreadable(): NotifyResult {
  return { outcome: "contacts_unreadable", success: false, notified: 0, total: 0 };
}

/**
 * What a caller must do about an outcome. `notified` is the only one that needs nothing;
 * every other outcome means a human has to be told, because nobody was reached.
 */
export function requiresLoudAlert(outcome: NotifyOutcome): boolean {
  return outcome !== "notified";
}

/**
 * Read a response body from `emergency-contact-notify`.
 *
 * The two ingest callers (`ev07b-sos-alert`, `ev07b-checkin`) previously awaited the fetch and
 * discarded the Response entirely — no `.json()`, no `.ok` — so the return shape above would
 * have changed nothing observable. This is what they call instead.
 *
 * An unparseable or shapeless body is NOT treated as success. A notification whose result
 * cannot be read is, for safety purposes, a notification that did not happen.
 */
export function classifyNotifyResponse(body: unknown): NotifyOutcome {
  const outcome = (body as { outcome?: unknown } | null)?.outcome;
  if (
    outcome === "notified" ||
    outcome === "all_failed" ||
    outcome === "no_contacts" ||
    outcome === "contacts_unreadable"
  ) {
    return outcome;
  }
  // No usable outcome field — an old deployed version, a proxy error page, a truncated body.
  // Never resolve that to `notified`: a notification whose result cannot be read is, for
  // safety purposes, a notification that did not happen. `all_failed` is the safe reading
  // because it is loud (requiresLoudAlert) without claiming to know why.
  return "all_failed";
}
