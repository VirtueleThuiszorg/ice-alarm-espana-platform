import { readinessGap, type ReadinessGap, type ReadinessRow } from "@/lib/readinessGap";

/**
 * THE ADMIN ATTENTION QUEUE — two axes, one worklist, both worked by phone.
 *
 * The queue began as "paid but not monitoring-ready": a member has paid, and one of the two
 * things that make them ready is missing (somebody to call, or a pendant proved to reach an
 * operator). Item 8 adds a SECOND axis that is not readiness at all — **a payment that failed**.
 *
 * WHY THOSE BELONG ON THE SAME SCREEN. P4 decided the behaviour: a failed renewal makes the
 * subscription `past_due`, monitoring CONTINUES, and staff are told. The reason staff must be
 * told is that somebody has to ring the member before Stripe's retries run out, or a life-safety
 * subscription lapses quietly — which is the same shape of work, on the same phone, from the
 * same list, as chasing a missing emergency contact. WIRING_REGISTER's absence row A2 recorded
 * that the only surface a `past_due` reached was a status badge on a page somebody would have to
 * already be looking at.
 *
 * READINESS IS NOT REDEFINED. A `past_due` member may be perfectly monitoring-ready, and a
 * not-ready member may be paying fine. So this keeps `ReadinessGap` exactly as it was — derived
 * from the view, never recomputed — and carries the payment problem as its own flag. A member
 * with both appears ONCE, because it is one phone call.
 *
 * ORDERING IS BY HOW LONG SOMEBODY HAS BEEN WAITING, across both axes, oldest first. For a
 * readiness row that is `paid_since`; for a payment row it is the renewal date the charge
 * failed against. Mixing them in one order is the point — a member overdue three weeks matters
 * more than one whose pendant was untested since yesterday.
 */

export interface AttentionRow {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  preferredLanguage: string | null;
  /** When the wait started: paid_since for readiness, the failed renewal date for payment. */
  waitingSince: string | null;
  daysWaiting: number | null;
  /** The readiness axis. "none" is legitimate here — a payment-only row is ready. */
  gap: ReadinessGap;
  /** The payment axis. */
  paymentPastDue: boolean;
}

/** What the readiness view gives us, per member. */
export interface ReadinessSource extends ReadinessRow {
  member_id: string | null;
  paid_since: string | null;
}

/** What a `past_due` subscription gives us. */
export interface PastDueSource {
  member_id: string | null;
  /** The date the failed charge was due. */
  renewal_date: string | null;
}

/** The member details both axes need to make a phone call. */
export interface MemberSource {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  preferred_language: string | null;
}

export function daysSince(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/**
 * Merge the two axes into one oldest-first worklist.
 *
 * PURE, AND THAT IS DELIBERATE. The page's query does the reading; this does the deciding, so
 * "a member in both lists appears once", "the older of the two dates wins" and "a member whose
 * row we could not read is not silently dropped" are all testable without a database.
 *
 * `members` is the gate on inclusion: a member id in either source with no member row is
 * dropped, because a row with no name and no phone number is not a call anybody can make.
 */
export function mergeAttentionRows(
  readiness: ReadinessSource[],
  pastDue: PastDueSource[],
  members: MemberSource[],
  now: number = Date.now(),
): AttentionRow[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const rows = new Map<string, AttentionRow>();

  for (const r of readiness) {
    const id = r.member_id;
    if (!id) continue;
    const m = byId.get(id);
    if (!m) continue;
    rows.set(id, {
      memberId: id,
      firstName: m.first_name,
      lastName: m.last_name,
      phone: m.phone,
      email: m.email,
      city: m.city,
      preferredLanguage: m.preferred_language,
      waitingSince: r.paid_since,
      daysWaiting: daysSince(r.paid_since, now),
      gap: readinessGap(r),
      paymentPastDue: false,
    });
  }

  for (const p of pastDue) {
    const id = p.member_id;
    if (!id) continue;
    const m = byId.get(id);
    if (!m) continue;

    const existing = rows.get(id);
    if (existing) {
      // ONE ROW, ONE CALL. A member who is both unready and overdue gets phoned once, and the
      // wait shown is the older of the two — otherwise adding the payment axis could make a
      // long-waiting member look newer than they are and drop them down the list.
      existing.paymentPastDue = true;
      const overdueDays = daysSince(p.renewal_date, now);
      if (
        overdueDays !== null &&
        (existing.daysWaiting === null || overdueDays > existing.daysWaiting)
      ) {
        existing.waitingSince = p.renewal_date;
        existing.daysWaiting = overdueDays;
      }
      continue;
    }

    rows.set(id, {
      memberId: id,
      firstName: m.first_name,
      lastName: m.last_name,
      phone: m.phone,
      email: m.email,
      city: m.city,
      preferredLanguage: m.preferred_language,
      waitingSince: p.renewal_date,
      daysWaiting: daysSince(p.renewal_date, now),
      // A payment-only row is monitoring-ready. Saying "no contacts" here would be inventing a
      // second problem, and saying "unknown" would put it in the not-a-state bucket.
      gap: "none",
      paymentPastDue: true,
    });
  }

  // Oldest wait first, across both axes. A null wait sorts LAST rather than first: we do not
  // know how long they have waited, and guessing "for ever" would push a member we know nothing
  // about above members we know have waited weeks.
  return [...rows.values()].sort((a, b) => {
    if (a.daysWaiting === b.daysWaiting) return 0;
    if (a.daysWaiting === null) return 1;
    if (b.daysWaiting === null) return -1;
    return b.daysWaiting - a.daysWaiting;
  });
}

/** The staff wording for the payment axis. The readiness wording stays in readinessGap.ts. */
export const ATTENTION_PAYMENT_STAFF = {
  key: "admin.readinessQueue.gapPayment",
  fallback: "Payment failed",
  work: {
    key: "admin.readinessQueue.workPayment",
    fallback:
      "Phone them and take a new card before Stripe stops retrying. Do NOT suspend the service.",
  },
} as const;

/** Is there anything on this row to phone about? */
export function isActionableRow(row: AttentionRow): boolean {
  return row.paymentPastDue || (row.gap !== "none" && row.gap !== "unknown");
}
