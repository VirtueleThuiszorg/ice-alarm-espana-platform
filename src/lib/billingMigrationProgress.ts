/**
 * HOW FAR THROUGH THE MIGRATION WE ARE, and WHO THE BANK SHOULD STILL COLLECT FROM.
 *
 * The second is not a report. Somebody in the office runs the Santander collection by hand from
 * a list, and a member with an unpaid Stripe link must not be on it: if they then pay Stripe
 * they are charged twice in one month, by us, for the same monitoring, out of the account of
 * somebody in their eighties.
 *
 * So the export rule lives here, pure and tested, rather than inside a component where it would
 * be exercised only by somebody clicking a button. It is the single most expensive thing on that
 * screen to get wrong, and the cost lands on the member rather than on us.
 */

export interface MigrationRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  billingSource: string | null;
  billingDay: number | null;
  nextRenewal: string | null;
  switchExpiresAt: string | null;
  amount: number | null;
  billingFrequency: "monthly" | "annual" | null;
  /**
   * Karma's VERBATIM membership label (`crm_profiles.legacy_membership_type`) — 'Single',
   * 'Couple Annual', 'FOC — Ayuntamiento'.
   *
   * NOT `subscriptions.plan_type`, and that is the whole point. The CRM import stores
   * COALESCE(..., 'single') for every row whose label named no plan, so that column says
   * "single" about people nobody has ever established a plan for. On a sheet somebody collects
   * money from, a made-up answer is worse than a blank one.
   */
  legacyPlanLabel: string | null;
  /**
   * Whether a plan can be established for them at all (`_shared/legacy-plan.ts`).
   *
   * These are the members the runner will NOT send a switch link to — it bells the office
   * instead — so they need a queue of their own beside "needs a billing date". Without one the
   * migration simply stops for them, and stopping is invisible: they are `active`, monitored,
   * and Santander goes on collecting.
   */
  planConfirmed: boolean;
}

export interface MigrationSummary {
  legacy: number;
  switchPending: number;
  stripe: number;
  /** Legacy members with no Santander date — the runner can never reach them. */
  needsDate: number;
  /** Legacy members whose plan nobody has established — the runner will not price them. */
  needsPlan: number;
  /** Links that ran out and have not yet been swept back. Somebody has to ring these people. */
  lapsed: number;
  /** Still on Santander and renewing between today and the end of this month. */
  dueThisMonth: MigrationRow[];
}

export function summariseMigration(rows: MigrationRow[], today: Date): MigrationSummary {
  const endOfMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
  );
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())));
  const to = iso(endOfMonth);

  const legacyRows = rows.filter((r) => r.billingSource === "legacy");

  return {
    legacy: legacyRows.length,
    switchPending: rows.filter((r) => r.billingSource === "switch_pending").length,
    stripe: rows.filter((r) => r.billingSource === "stripe").length,
    needsDate: legacyRows.filter((r) => r.billingDay === null).length,
    needsPlan: legacyRows.filter((r) => !r.planConfirmed).length,
    /*
      A LAPSED LINK THAT IS STILL `switch_pending` is a member the daily sweep has not yet put
      back — so right now they are in neither collection. Counted separately from "link out"
      because the two need opposite things: one is waiting, the other needs a phone call.
    */
    lapsed: rows.filter(
      (r) =>
        r.billingSource === "switch_pending" &&
        r.switchExpiresAt !== null &&
        new Date(r.switchExpiresAt).getTime() <= today.getTime(),
    ).length,
    dueThisMonth: legacyRows
      .filter((r) => r.nextRenewal !== null && r.nextRenewal >= from && r.nextRenewal <= to)
      .sort((a, b) => (a.nextRenewal! < b.nextRenewal! ? -1 : 1)),
  };
}

/** One cell, escaped the way every spreadsheet agrees on. */
function cell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The list the office runs the bank collection from, for the month `today` falls in.
 *
 * THE ONE RULE THAT MATTERS: `switch_pending` IS EXCLUDED. A member with a Stripe link out has
 * left this collection from the moment the link was created, and including them is the double
 * charge this whole feature exists to prevent.
 *
 * A member with no billing date is included WITH AN EMPTY DATE rather than dropped. They are
 * still a paying client and the office still collects from them; dropping them from the list
 * would silently stop their payment, which is the worse error in the other direction. The blank
 * cell is a question for whoever runs it.
 *
 * `stripe` members are not in it at all — Stripe bills them now.
 */
export function santanderExportCsv(rows: MigrationRow[], today: Date): string {
  const header = [
    "member_id",
    "name",
    "email",
    "phone",
    "billing_day",
    "next_collection",
    // Karma's own words, beside the frequency. Lee's brief asks for "day, amount, plan", and the
    // plan is what tells the office a household of two apart from one person on the same sheet.
    "plan",
    "amount_eur",
    "frequency",
  ];

  const month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  const body = rows
    .filter((r) => r.billingSource === "legacy")
    .sort((a, b) => (a.billingDay ?? 99) - (b.billingDay ?? 99) || a.name.localeCompare(b.name))
    .map((r) =>
      [
        r.id,
        r.name,
        r.email,
        r.phone,
        r.billingDay,
        // Only this month's collection: a date in a later month on a sheet headed "this month"
        // is a payment somebody takes early.
        r.nextRenewal && r.nextRenewal.startsWith(month) ? r.nextRenewal : "",
        // Blank rather than guessed. A member whose Karma label named no plan is exactly the one
        // nobody should read a plan off this sheet for.
        r.legacyPlanLabel ?? "",
        r.amount === null ? "" : r.amount.toFixed(2),
        r.billingFrequency ?? "",
      ]
        .map(cell)
        .join(","),
    );

  return [header.join(","), ...body].join("\r\n");
}
