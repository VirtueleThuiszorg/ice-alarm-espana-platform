/**
 * THE RUBRIC, AS CODE.
 *
 * Lee's rubric has to be "applied identically" to every row and must not round
 * up. Written out as a function, that is enforceable rather than promised: the
 * same inputs always give the same score, and a reviewer can argue with the
 * inputs instead of guessing at a judgement.
 *
 *   10   reaches destination · right person notified on a channel live today ·
 *        failure shown to user · automated proof that goes red if it breaks
 *   7–9  reaches destination and tested · notification missing, or on a channel
 *        not yet live (email/WhatsApp)
 *   4–6  reaches destination · nobody told · no test
 *   1–3  fails, fails silently, or lands where nobody looks
 *   0    dead control
 *
 * THE TWO RULES THAT KEEP IT HONEST:
 *
 *   1. A row cannot score above 6 without a NAMED proof. "There is a test file
 *      that mentions this table" is not a proof — the goal says so explicitly,
 *      and 104 of 171 wires have no test naming them at all. `proof` is a test
 *      that exercises client → destination → visible somewhere, filled in by
 *      hand only after reading it.
 *   2. Only the bell counts as "a channel live today". Email, SMS and WhatsApp
 *      all have real code and all return "not configured" without a production
 *      secret this repo cannot read, so claiming they are live would be
 *      inventing the very fact the register exists to establish.
 */

/** The only channel whose liveness is provable from the repo. */
const LIVE_CHANNELS = new Set(["bell"]);
/** Real code paths gated on a production secret. */
const PENDING_CHANNELS = new Set(["email", "sms", "whatsapp"]);
/** Audiences where no notification is owed, so their absence is not a fault. */
const NO_NOTIFICATION_OWED = new Set(["self", "external"]);

export function scoreRow(row) {
  const { dead, reaches = true, told = "nobody", failureVisible, proof } = row;

  // 0 — dead control: it cannot fire, whatever it claims.
  if (dead) return { score: 0, band: "dead control" };

  // 1–3 — does not arrive. 3 if the user is at least told it failed, 1 if not.
  if (!reaches) {
    return failureVisible
      ? { score: 3, band: "fails, and says so" }
      : { score: 1, band: "fails silently" };
  }

  const proven = !!proof;
  const live = LIVE_CHANNELS.has(told);
  const pending = PENDING_CHANNELS.has(told);
  const owed = !NO_NOTIFICATION_OWED.has(told);

  // 4–6 — arrives, but nothing proves it and nobody is told.
  //       +1 for a visible failure, +1 where no notification was owed in the
  //       first place (the actor is the audience), because a save the admin
  //       watched succeed is genuinely better wired than a lead nobody receives
  //       — but neither can reach 7 without a proof.
  if (!proven) {
    let s = 4;
    if (failureVisible) s += 1;
    if (!owed) s += 1;
    return { score: Math.min(s, 6), band: "arrives, unproven" };
  }

  // 10 — everything: live channel, visible failure, automated proof.
  if (live && failureVisible) return { score: 10, band: "fully wired" };

  // 7–9 — proven and arriving; the shortfall is which channel, or the failure.
  if (live) return { score: 9, band: "notified live, failure not shown" };
  if (pending) return { score: 8, band: "proven; channel not live today" };
  if (!owed) return { score: 7, band: "proven; no notification owed" };
  return { score: 7, band: "proven; nobody told" };
}

/** Distribution as a printable histogram, 0–10, no gaps hidden. */
export function distribution(rows) {
  const counts = new Array(11).fill(0);
  for (const r of rows) counts[r.score] += 1;
  return counts;
}
