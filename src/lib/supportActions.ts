/**
 * THE `?action=` VALUES THAT OPEN A PREFILLED SUPPORT REQUEST — one list, not five.
 *
 * `SupportPage` reads `?action=` and opens the "new message" dialog with a subject already
 * filled in. That is a real, working route: a member who cannot do a thing themselves gets a
 * conversation with a human instead of a dead end.
 *
 * WHAT WAS WRONG WITH IT. The subjects lived in a `Record<string, string>` inside
 * `SupportPage`, and four other pages built the URL by hand:
 *
 *     navigate("/dashboard/support?action=report_issue")
 *
 * A typo in any of them — `report-issue`, `reportIssue`, a renamed key — does not fail. The
 * lookup misses and the dialog opens titled "Support Request", so the member sends a message
 * that looks fine and lands on a staff member's screen with the wrong subject and no clue what
 * they were trying to do. It is the same shape of defect as the four disagreeing copies of
 * `medical_information`'s columns: one fact, written down in several places, drifting.
 *
 * So the list is here, the subject keys hang off it, and `supportActionPath()` is the only way
 * to build the URL. `src/test/supportActions.test.ts` asserts that no `?action=` string
 * anywhere in `src/` names a key this list does not carry.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. `SupportPage` still opens a generic request for an
 * unrecognised value rather than ignoring it. A member following a year-old link from an email
 * should get a conversation, not a page that appears to do nothing. The ratchet is on what this
 * codebase can emit, which is the half that drifts.
 */

export interface SupportActionSpec {
  /** The `?action=` value. */
  key: string;
  /** i18n key for the subject line the dialog opens with. */
  subjectKey: string;
  /** Fallback subject, in English, for a locale that has not got the key yet. */
  subjectFallback: string;
}

export const SUPPORT_ACTIONS = [
  {
    key: "report_issue",
    subjectKey: "support.reportIssueSubject",
    subjectFallback: "Device Issue Report",
  },
  {
    key: "request_replacement",
    subjectKey: "support.requestReplacementSubject",
    subjectFallback: "Device Replacement Request",
  },
  {
    key: "upgrade_plan",
    subjectKey: "support.upgradePlanSubject",
    subjectFallback: "Plan Upgrade Request",
  },
  {
    key: "update_payment",
    subjectKey: "support.updatePaymentSubject",
    subjectFallback: "Payment Method Update",
  },
  // ── added with the Membership page (WP4 4d) ──
  // Each of these is a thing a member can ask for and CANNOT do themselves, because there is no
  // member-initiated checkout for an existing account (PENDING_FOR_LEE.md D-12). Sending them
  // to a human is the honest route, not a placeholder for one.
  {
    key: "start_membership",
    subjectKey: "support.startMembershipSubject",
    subjectFallback: "Start my membership",
  },
  {
    key: "restart_membership",
    subjectKey: "support.restartMembershipSubject",
    subjectFallback: "Restart my membership",
  },
  {
    key: "add_pendant",
    subjectKey: "support.addPendantSubject",
    subjectFallback: "Add a pendant",
  },
  {
    key: "change_to_couple",
    subjectKey: "support.changeToCoupleSubject",
    subjectFallback: "Change to a couple plan",
  },
] as const satisfies readonly SupportActionSpec[];

/**
 * The `?action=` values, as a union.
 *
 * `as const satisfies` above rather than an annotation: an explicit `: readonly
 * SupportActionSpec[]` widens `key` back to `string` and this type becomes useless. That is not
 * hypothetical — it is exactly how the medical-fields ratchet in `medicalFields.ts` was
 * decorative on its first attempt.
 */
export type SupportActionKey = (typeof SUPPORT_ACTIONS)[number]["key"];

/** The only supported way to build the URL. */
export function supportActionPath(key: SupportActionKey): string {
  return `/dashboard/support?action=${key}`;
}

/** The subject spec for a raw `?action=` value, or `null` when it names nothing. */
export function supportActionSpec(raw: string | null | undefined): SupportActionSpec | null {
  if (!raw) return null;
  return SUPPORT_ACTIONS.find((a) => a.key === raw) ?? null;
}
