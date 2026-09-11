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
 *
 * `toMigrationRow` IS HERE FOR THE SAME REASON, and it was not, which made the sentence above
 * half true. The exclusion rule was tested on rows a test invented; the code that builds a real
 * row out of what PostgREST returns lived in the card's `queryFn`, where the only assertions
 * that could reach it were regexes over the file. A mapper that read the wrong column would
 * hand `santanderExportCsv` a `switch_pending` member labelled `legacy`, and every test here
 * would still pass while the office collected from somebody who had already paid Stripe.
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

/**
 * One row as `supabase.from("members").select(...)` returns it for this card.
 *
 * Deliberately loose: PostgREST hands back `unknown`-ish JSON, and the point of this function is
 * to be the ONE place that narrows it. Anything stricter here would move the casts back into the
 * component and take the decision with them.
 */
export interface MemberProgressRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  billing_source: string | null;
  legacy_billing_day: number | null;
  legacy_next_renewal: string | null;
  switch_expires_at: string | null;
  subscriptions?: SubscriptionEmbed[] | SubscriptionEmbed | null;
  crm_profiles?: ProfileEmbed[] | ProfileEmbed | null;
}

interface SubscriptionEmbed {
  plan_type: string | null;
  amount: number | null;
  billing_frequency: string | null;
  created_at: string;
}

interface ProfileEmbed {
  legacy_membership_type: string | null;
  legacy_payment_type: string | null;
}

/**
 * PostgREST returns an embedded one-to-one as an OBJECT and a one-to-many as an ARRAY, depending
 * on whether the foreign key carries a unique index — and that index is a property of the
 * database, not of this query, so the shape can change under us without this file being touched.
 *
 * Both are handled for both embeds. Getting it wrong on `crm_profiles` puts EVERY legacy member
 * in the "needs a plan" queue and blanks the plan column on the collection sheet; getting it
 * wrong on `subscriptions` blanks the amount, which is the figure the office types into the bank.
 */
function firstOf<T>(embed: T[] | T | null | undefined): T | null {
  if (embed === null || embed === undefined) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

/**
 * The row the whole screen decides from.
 *
 * `billingSource` is the field that matters: `santanderExportCsv` includes `legacy` and excludes
 * everything else, so this is where a member with a live Stripe link is either kept out of the
 * bank run or put back into it.
 */
export function toMigrationRow(
  r: MemberProgressRow,
  resolvePlan: (source: {
    label: string | null;
    paymentType: string | null;
    storedPlanType: string | null;
    storedBillingFrequency: string | null;
  }) => { confirmed: boolean },
): MigrationRow {
  const subs = Array.isArray(r.subscriptions)
    ? r.subscriptions
    : r.subscriptions
      ? [r.subscriptions]
      : [];
  /*
    NEWEST SUBSCRIPTION WINS. A member who was re-signed carries more than one row, and the older
    one can hold a price they stopped paying years ago. Sorting descending by `created_at` and
    taking the first is the difference between collecting this year's fee and last year's.
  */
  const newest = [...subs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const profile = firstOf(r.crm_profiles);

  return {
    id: r.id,
    name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    email: r.email ?? null,
    phone: r.phone ?? null,
    billingSource: r.billing_source ?? null,
    billingDay: r.legacy_billing_day ?? null,
    nextRenewal: r.legacy_next_renewal ?? null,
    switchExpiresAt: r.switch_expires_at ?? null,
    amount: newest?.amount ?? null,
    billingFrequency: (newest?.billing_frequency as "monthly" | "annual" | null) ?? null,
    legacyPlanLabel: profile?.legacy_membership_type ?? null,
    /*
      THE SAME DECISION the switch link and the runner make, from the same module — so the number
      on this card is the number of members the runner will refuse to price, and not a second
      opinion about them. Injected rather than imported so this file stays free of the edge
      function tree; the card passes `resolveLegacyPlan` itself.
    */
    planConfirmed: resolvePlan({
      label: profile?.legacy_membership_type ?? null,
      paymentType: profile?.legacy_payment_type ?? null,
      storedPlanType: newest?.plan_type ?? null,
      storedBillingFrequency: newest?.billing_frequency ?? null,
    }).confirmed,
  };
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
