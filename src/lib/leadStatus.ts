/**
 * THE LEAD STATUS LADDER, in one place.
 *
 *   new → contacted → interested → join_link_sent → joined | not_interested | unreachable
 *
 * It is a plain list rather than a state machine on purpose. A lead does not move in one
 * direction: somebody says "not now, ring me in the spring", and an operator has to be able to
 * put them back. A machine that forbade that would be worked around by leaving every lead on
 * `contacted`, which is worse than no ladder at all.
 *
 * `leads_status_ladder` in migration 20260919120000 is the same list, and `leadStatus.test.ts`
 * holds the two together — a value the UI can set that the database refuses is an error toast
 * with nothing an operator can do about it.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "interested",
  "join_link_sent",
  "joined",
  "not_interested",
  "unreachable",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * The ones a lead is still being worked from. Used by the follow-up filter and by the parts of
 * the UI that ask "is this finished?".
 *
 * `joined`, `not_interested` and `unreachable` are ENDINGS. A lead in one of them is never
 * chased automatically — most of all `not_interested`.
 */
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "join_link_sent",
];

export function isOpenLead(status: string): boolean {
  return (OPEN_LEAD_STATUSES as readonly string[]).includes(status);
}
