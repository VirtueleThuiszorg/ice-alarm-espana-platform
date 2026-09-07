/**
 * WHICH CONDITION IS MISSING — named once, so three surfaces cannot invent three answers.
 *
 * D4 made monitoring readiness two conditions instead of one:
 *   1. at least one emergency contact
 *   2. the pendant has been tested in the member's own home with an operator answering
 *
 * The brief then asks all three readiness surfaces to say WHICH one is missing — the queue
 * ("two row kinds, both worked by phone"), the member header notice, and the operator card
 * zero-state. *"Not ready"* without a reason is not actionable, and three screens each deriving
 * the reason from raw columns is three chances to phrase it differently or get it wrong.
 *
 * DERIVED FROM THE VIEW, NEVER RECOMPUTED FROM SOURCE TABLES. READINESS_MODEL.md §2: the view
 * is the answer and the surfaces read it. This module turns the view's two columns into the one
 * word each screen needs; it does not re-derive readiness itself.
 */

export type ReadinessGap =
  /** Nobody can be called for them. */
  | "contacts"
  /** Somebody can be called, but nobody has ever proved the pendant reaches an operator. */
  | "pendant"
  /** Both. */
  | "both"
  /** Ready. */
  | "none"
  /** The row could not be read. NOT the same as ready, and not the same as any gap. */
  | "unknown";

export interface ReadinessRow {
  emergency_contact_count: number | null;
  device_tested_at: string | null;
}

/**
 * `null` in, `"unknown"` out — and that is the whole reason this takes a nullable row.
 *
 * A missing row is not a ready member and not an unready one. The failure mode this readiness
 * model exists to prevent is a false all-clear (READINESS_MODEL.md §1-A), and its mirror image —
 * a false alarm on every page load while the read is in flight — is what teaches members and
 * operators to ignore the notice. So "we do not know" is a value, carried through, rather than
 * collapsed into either answer.
 */
export function readinessGap(row: ReadinessRow | null | undefined): ReadinessGap {
  if (!row) return "unknown";
  // A null count is not zero. The view uses count(), which cannot be null for an existing row —
  // so a null here means the column was not selected, and answering "no contacts" to that would
  // be inventing a fact from a missing projection.
  if (row.emergency_contact_count === null || row.emergency_contact_count === undefined) {
    return "unknown";
  }
  const hasContacts = row.emergency_contact_count > 0;
  const tested = !!row.device_tested_at;
  if (hasContacts && tested) return "none";
  if (!hasContacts && !tested) return "both";
  return hasContacts ? "pendant" : "contacts";
}

/** Is there something to chase? `unknown` is deliberately NOT actionable. */
export function isActionableGap(gap: ReadinessGap): boolean {
  return gap === "contacts" || gap === "pendant" || gap === "both";
}

/**
 * The staff wording. Short enough for a table cell, and it names the WORK rather than the state:
 * both row kinds are worked by phone, and the difference is what the call is for.
 */
export const READINESS_GAP_STAFF: Record<
  Exclude<ReadinessGap, "none">,
  { key: string; fallback: string; work: { key: string; fallback: string } }
> = {
  contacts: {
    key: "admin.readinessQueue.gapContacts",
    fallback: "No contacts",
    work: {
      key: "admin.readinessQueue.workContacts",
      fallback: "Phone them and record at least one emergency contact.",
    },
  },
  pendant: {
    key: "admin.readinessQueue.gapPendant",
    fallback: "Pendant not tested",
    work: {
      key: "admin.readinessQueue.workPendant",
      fallback: "Phone them, have them press the pendant, and record the test call.",
    },
  },
  both: {
    key: "admin.readinessQueue.gapBoth",
    fallback: "No contacts · pendant not tested",
    work: {
      key: "admin.readinessQueue.workBoth",
      fallback: "One call does both: record a contact, then have them press the pendant.",
    },
  },
  unknown: {
    key: "admin.readinessQueue.gapUnknown",
    fallback: "Could not be read",
    work: {
      key: "admin.readinessQueue.workUnknown",
      fallback: "This is not a state. Do not treat it as ready or unready — retry, then escalate.",
    },
  },
};
