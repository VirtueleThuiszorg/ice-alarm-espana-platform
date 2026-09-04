/**
 * member-update-outcome.ts — what a second-stage submission means, and who made it.
 *
 * WHY. Once the join wizard stops collecting emergency contacts (ONBOARDING_SPLIT.md), this
 * endpoint becomes the only route by which a member becomes monitoring-ready. It currently:
 *
 *   - SWALLOWS per-contact write failures (submit-member-update:159-161, :178-180) and returns
 *     {success: true, "Profile updated successfully"} anyway. Three contacts can all fail and
 *     the member is told they are done. Same class of lie as emergency-contact-notify's
 *     {success: true, notified: 0} — READINESS_MODEL.md §1-A.
 *   - marks the token used UNCONDITIONALLY (:186), so a submission that wrote nothing still
 *     burns the one-shot link and the member cannot retry.
 *   - treats an EMPTY submission as a success (:140 guards length > 0), so opening the link and
 *     submitting nothing is recorded as completing the second stage.
 *
 * Pure and dependency-free so it is unit-testable under vitest — the Deno function cannot be
 * imported there (same pattern as contact-notify-outcome.ts / escalation-outcome.ts).
 */

/** How the submission reached the endpoint. Derived from who authenticated, never claimed. */
export type SubmitRoute = "member_link" | "operator_assisted";

export type SubmitOutcome =
  /** Everything asked for was written. */
  | "recorded"
  /** Nothing was supplied for a field the token asked for. Token NOT burned. */
  | "nothing_submitted"
  /** At least one write failed. Token NOT burned, so the member can retry. */
  | "write_failed"
  | "token_missing"
  | "token_invalid"
  | "token_used"
  | "token_expired";

export interface SubmitResult {
  outcome: SubmitOutcome;
  /** True only for `recorded`. */
  success: boolean;
  /** Legacy field the member page keys on; mirrors `outcome` for the failure cases. */
  error?: SubmitOutcome;
  contactsWritten: number;
  medicalWritten: boolean;
  /** Should the caller mark the token used? Only ever true for `recorded`. */
  burnToken: boolean;
  route?: SubmitRoute;
}

/**
 * Which requested fields still have nothing behind them.
 *
 * `requested_fields` is what the token asked for. A submission that supplies none of it is not
 * a success no matter how cleanly it ran — that is defect 2-C. Fields the token did not ask for
 * are ignored: a token for `medical_information` alone must not fail because no contact came.
 */
export function unsatisfiedFields(
  requestedFields: string[],
  supplied: { contacts: number; medical: boolean },
): string[] {
  const missing: string[] = [];
  for (const field of requestedFields) {
    if (field === "emergency_contacts" && supplied.contacts === 0) missing.push(field);
    if (field === "medical_information" && !supplied.medical) missing.push(field);
  }
  return missing;
}

/**
 * Decide the outcome. `contactErrors` is the count of per-contact writes that FAILED — the
 * thing the old loop threw away.
 */
export function decideSubmitOutcome(input: {
  requestedFields: string[];
  contactsAttempted: number;
  contactErrors: number;
  medicalAttempted: boolean;
  medicalError: boolean;
  route: SubmitRoute;
}): SubmitResult {
  const contactsWritten = Math.max(0, input.contactsAttempted - input.contactErrors);
  const medicalWritten = input.medicalAttempted && !input.medicalError;

  // A failed write is never a success, and never burns the token — the member must be able to
  // come back to the same link and try again.
  if (input.contactErrors > 0 || input.medicalError) {
    return {
      outcome: "write_failed",
      success: false,
      error: "write_failed",
      contactsWritten,
      medicalWritten,
      burnToken: false,
      route: input.route,
    };
  }

  const missing = unsatisfiedFields(input.requestedFields, {
    contacts: contactsWritten,
    medical: medicalWritten,
  });

  if (missing.length > 0) {
    return {
      outcome: "nothing_submitted",
      success: false,
      error: "nothing_submitted",
      contactsWritten,
      medicalWritten,
      burnToken: false,
      route: input.route,
    };
  }

  return {
    outcome: "recorded",
    success: true,
    contactsWritten,
    medicalWritten,
    burnToken: true,
    route: input.route,
  };
}

/** A token-state refusal. Never burns anything and never claims a route. */
export function tokenRefusal(outcome: Extract<SubmitOutcome,
  "token_missing" | "token_invalid" | "token_used" | "token_expired">): SubmitResult {
  return {
    outcome,
    success: false,
    error: outcome,
    contactsWritten: 0,
    medicalWritten: false,
    burnToken: false,
  };
}
