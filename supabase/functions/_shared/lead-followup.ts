/**
 * WHO TO REMIND, AND — MORE IMPORTANTLY — WHO NOT TO REMIND AGAIN.
 *
 * The runner behind "Follow up today". It bells the operator who owns a lead that has gone
 * quiet, ONCE, and then leaves them alone until something actually happens.
 *
 * ── THE WHOLE DESIGN IS ABOUT NOT BECOMING NOISE ────────────────────────────
 *
 * A daily reminder about the same lead is a notification people learn to dismiss, and a person
 * who has learned to dismiss one bell dismisses the next one too — including the one about a
 * payment that failed. `leads.followup_bell_sent_at` is the mark that stops it: set when the
 * bell rings, and CLEARED BY THE DATABASE TRIGGER the moment anybody actually contacts the lead.
 * So the sequence is: quiet for three days → one bell → somebody writes to them → quiet again →
 * one more bell. Never two in a row for the same silence.
 *
 * Pure and dependency-free, like every other decision module here.
 */

/** The statuses a lead is still being worked from. `joined`, `not_interested`, `unreachable` are endings. */
const OPEN = ["new", "contacted", "interested", "join_link_sent"] as const;

export interface FollowUpLead {
  id: string;
  status: string;
  do_not_contact: boolean | null;
  last_contacted_at: string | null;
  created_at: string;
  followup_bell_sent_at: string | null;
  assigned_to: string | null;
  first_name: string | null;
}

export interface FollowUpDecision {
  leadId: string;
  staffId: string;
  firstName: string;
}

/**
 * Which of these leads should ring a bell right now.
 *
 * FOUR REASONS TO SKIP, and every one of them is a lead somebody might otherwise be reminded
 * about wrongly:
 *
 *   NOT OPEN — `joined` needs nothing, `unreachable` has been tried, and `not_interested` must
 *   never be chased, which is the one that matters.
 *
 *   SILENCED — `do_not_contact`. Reminding an operator to write to somebody the platform will
 *   then refuse to write to is worse than saying nothing.
 *
 *   ALREADY BELLED — the mark above. This is what makes it once and not daily.
 *
 *   NOT ASSIGNED TO ANYBODY — a bell needs a person. An unowned lead going quiet is a real
 *   problem, and it is the LIST's problem: "Follow up today" shows it to whoever opens the page,
 *   which is the right way to surface work nobody has claimed. Belling every operator about
 *   every unowned lead would be exactly the noise this module exists to avoid.
 */
export function leadsToRemind(
  leads: FollowUpLead[],
  days: number,
  now: Date,
): FollowUpDecision[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const out: FollowUpDecision[] = [];

  for (const lead of leads) {
    if (!(OPEN as readonly string[]).includes(lead.status)) continue;
    if (lead.do_not_contact === true) continue;
    if (lead.followup_bell_sent_at) continue;
    if (!lead.assigned_to) continue;

    // A lead nobody has ever written to is measured from when it arrived — those are the ones
    // most likely to have been forgotten, not the least.
    const since = new Date(lead.last_contacted_at ?? lead.created_at).getTime();
    if (Number.isNaN(since) || since > cutoff) continue;

    out.push({
      leadId: lead.id,
      staffId: lead.assigned_to,
      firstName: (lead.first_name ?? "").trim(),
    });
  }

  return out;
}

/**
 * The sentence on the bell.
 *
 * IT SAYS HOW LONG, because "follow up with Rosa" is a task and "you have not spoken to Rosa for
 * four days" is a fact. The second one an operator can disagree with — they may have rung her
 * from their own phone — and a reminder somebody can tell is wrong is one they keep reading.
 */
export function followUpMessage(firstName: string, days: number): string {
  const name = firstName || "a lead";
  return `No contact with ${name} for ${days} days — worth a follow-up`;
}
