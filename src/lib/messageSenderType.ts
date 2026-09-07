/**
 * WHO SENT A MESSAGE — and the one value that decides whether a member can read it.
 *
 * `20260907100400_messaging_schema.sql` widened `messages.sender_type` to include
 * `staff_internal`, and added the policy that gives it meaning:
 *
 *     CREATE POLICY "Members never read internal staff notes"
 *       ON public.messages AS RESTRICTIVE FOR SELECT TO authenticated
 *       USING (sender_type <> 'staff_internal' OR public.is_staff(auth.uid()));
 *
 * RESTRICTIVE, so it is AND-ed with every other policy — the member policy is scoped by
 * conversation and says nothing about sender_type, so without this an internal note written in a
 * member's own conversation would be visible to them.
 *
 * ── WHICH IS EXACTLY WHAT WAS HAPPENING ────────────────────────────────────────────────────
 *
 * The internal-note feature predates that migration and **wrote `sender_type: "system"`**. Both
 * staff surfaces did — `call-centre/MessagesPage` and `admin/MessagesPage` — and the admin one
 * carries the placeholder *"Write an internal note (only visible to staff)…"*.
 *
 * `system` is not `staff_internal`. The RESTRICTIVE policy does not cover it, the member's thread
 * selects `*` from their conversation with no sender_type filter, and it renders every row. So an
 * operator's note — the harness's own example is *"Family disputes the invoice — do not discuss
 * with member"* — appeared in the member's own message thread, with `[Internal Note]` still on
 * the front of it.
 *
 * ── WHY A CONSTANT AND NOT A STRING ────────────────────────────────────────────────────────
 *
 * Two writers had the same literal and both were wrong. A third would have been too. The value
 * that decides who can read a message is not a thing to retype.
 *
 * ROWS ALREADY WRITTEN AS `system` ARE STILL VISIBLE. That is data, not code —
 * `PENDING_FOR_LEE.md` S13 carries the query and the one-line update.
 */

/** The sender_type an internal staff note must carry to be unreadable by the member. */
export const STAFF_INTERNAL_SENDER_TYPE = "staff_internal";

/** An ordinary staff reply, which the member is meant to read. */
export const STAFF_SENDER_TYPE = "staff";

/** The sender_type for a staff-composed message, given whether it is an internal note. */
export function staffSenderType(isInternalNote: boolean): string {
  return isInternalNote ? STAFF_INTERNAL_SENDER_TYPE : STAFF_SENDER_TYPE;
}
