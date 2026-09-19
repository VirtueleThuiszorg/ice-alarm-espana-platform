import { OPEN_LEAD_STATUSES, type LeadStatus } from "@/lib/leadStatus";

/**
 * WHICH LEADS ARE WAITING TO HEAR BACK FROM US.
 *
 * A lead goes quiet not because anybody decided to leave it, but because the operator who was
 * working it had four other things on that morning. "Follow up today" is the list of people who
 * were told somebody would be in touch and then were not.
 *
 * ── THE THREE RULES, AND WHY EACH ONE HAS TO BE THERE ───────────────────────
 *
 * OPEN ONLY. `joined` needs nothing, `unreachable` has already been tried, and
 * `not_interested` is the one that matters: a person who said no and is chased anyway is the
 * worst outcome this feature can produce.
 *
 * NOT SILENCED. `do_not_contact` is checked here as well as in the send path, because this list
 * is what a person works FROM. Leaving a silenced lead on it and refusing the send afterwards
 * would be a screen that asks somebody to do a thing it will then decline to do.
 *
 * QUIET FOR LONG ENOUGH. `last_contacted_at` is null for a lead nobody has ever written to,
 * which counts — those are the ones most likely to have been forgotten, not the least.
 */

/** `system_settings.lead_followup_days`, with the seeded default. */
export const DEFAULT_FOLLOWUP_DAYS = 3;

export interface FollowUpCandidate {
  status: string;
  do_not_contact?: boolean | null;
  last_contacted_at?: string | null;
  created_at: string;
}

/**
 * Is this lead waiting on us?
 *
 * THE CLOCK STARTS AT `created_at` WHEN NOTHING HAS BEEN SENT. Treating a never-contacted lead
 * as "not yet due" would hide exactly the ones that were forgotten on the day they arrived —
 * and a lead added by hand at a market stall on Saturday is due on Tuesday whether or not
 * anybody got round to opening it.
 */
export function needsFollowUp(
  lead: FollowUpCandidate,
  days: number,
  now: Date = new Date(),
): boolean {
  if (!(OPEN_LEAD_STATUSES as readonly string[]).includes(lead.status)) return false;
  if (lead.do_not_contact === true) return false;

  const since = lead.last_contacted_at ?? lead.created_at;
  const elapsed = now.getTime() - new Date(since).getTime();
  return elapsed >= days * 24 * 60 * 60 * 1000;
}

/** The cut-off a query compares against, so the filter and the runner ask the same question. */
export function followUpCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** The statuses a follow-up query restricts to. Exported so a query cannot restate them wrongly. */
export const FOLLOWUP_STATUSES: readonly LeadStatus[] = OPEN_LEAD_STATUSES;
