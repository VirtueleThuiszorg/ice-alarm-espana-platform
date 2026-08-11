/**
 * What an admin invite should do when a `partners` row already exists for the email.
 *
 * Extracted as a pure function so it can be tested by execution rather than by
 * reading the edge function — the gate it encodes is the one that decides whether a
 * partner can ever get an account, so it is worth asserting directly.
 *
 * Context (PARTNER_JOURNEY.md): `/partner` → `partner-apply` writes an APPLICATION —
 * `status='pending'`, no `user_id`, no credentials. Option C converts that
 * application into an account by admin invite. Before this, `partner-admin-invite`
 * rejected every existing row whose status was not already `invited`, so an
 * application could not be converted at all: the admin got "A partner with this
 * email already exists" and had no way forward.
 */

/** The four `partner_status` values (`20260122101043` + `20260303160000`). */
export type PartnerStatus = "invited" | "pending" | "active" | "suspended";

export type InviteDecision =
  /** No row for this email — create one as `invited`. */
  | { action: "create" }
  /** Already `invited` and never completed — refresh the details and re-send. */
  | { action: "reinvite" }
  /** A `pending` application — convert it, stamping the review. */
  | { action: "convert" }
  /** A real partner already exists, or is suspended. Refuse. */
  | { action: "reject"; reason: string };

export function decidePartnerInvite(
  existingStatus: PartnerStatus | null | undefined,
): InviteDecision {
  if (existingStatus == null) return { action: "create" };

  switch (existingStatus) {
    case "invited":
      return { action: "reinvite" };

    case "pending":
      // The application path. This is the case Option C turns on.
      return { action: "convert" };

    case "active":
      // Converting an active partner would reset a working account back to
      // `invited` and strip its ability to log in. Never do that from here.
      return {
        action: "reject",
        reason: "This partner already has an active account.",
      };

    case "suspended":
      // Re-inviting a suspended partner would launder a deliberate suspension
      // into a fresh account. Reinstatement is a separate, explicit act.
      return {
        action: "reject",
        reason:
          "This partner is suspended. Reinstate the account instead of re-inviting it.",
      };

    default: {
      // An unrecognised status must refuse rather than fall through to a write.
      // `partner_status` gained a fourth value once already (`invited`), and the
      // silent fall-through is exactly how that kind of addition turns into a bug.
      const unreachable: never = existingStatus;
      return {
        action: "reject",
        reason: `Unrecognised partner status: ${String(unreachable)}`,
      };
    }
  }
}
