/**
 * WHO GETS WRITTEN TO TODAY, AND WHAT THEY ARE SENT — the whole of the billing migration's
 * pacing, and none of its I/O.
 *
 * 431 members move over months rather than in a burst, and the date each one moves on is their
 * own: the day Santander takes their money. The runner wakes once a day, asks this module which
 * members are due, and does what it says.
 *
 * ── WHY THE CADENCE IS NOT ONE RULE ───────────────────────────────────────────
 *
 * A MONTHLY member is charged again in a few weeks whatever happens, so the cost of a badly
 * timed link is one month at worst. They get the link a few days before their Santander day —
 * close enough that "your payment is due on the 15th" is true, far enough that a member who
 * needs to ring their son has the weekend.
 *
 * An ANNUAL member is charged once. Getting it wrong costs them a YEAR, so they are given
 * notice rather than a surprise: a letter 14 days out, a reminder at 7, and at 3 days a bell for
 * staff to ring them. Lee's rule, and the reason it is worth the extra machinery: an annual
 * member who misses the switch does not get another chance for twelve months.
 *
 * ── NEVER TWICE, AND WHY IT IS A KEY RATHER THAN A CHECK ──────────────────────
 *
 * The runner is a daily cron. It will be re-run by hand, it will overlap itself the day the
 * schedule changes, and one day it will crash halfway through 431 members and be run again. A
 * "have we sent this already?" SELECT before each send is a race with all three.
 *
 * So every send carries a DEDUPE KEY naming the member, the renewal it is about and what kind of
 * message it is — and the database holds a unique index on it. Sending twice is not prevented by
 * remembering; it is impossible. `ON CONFLICT DO NOTHING` makes the entire run idempotent by
 * construction, which is the only property that makes "just run it again" a safe instruction.
 *
 * The key is scoped to the RENEWAL DATE, not to the month: an annual member's notice at 14 days
 * and their reminder at 7 are different kinds against the same renewal, and next year's renewal
 * is a different key entirely.
 */

export type RunnerActionKind =
  /** A monthly member, a few days before Santander takes it: send the switch link. */
  | "switch_link"
  /** An annual member, 14 days out: tell them what is coming and offer the link. */
  | "annual_notice"
  /** An annual member, 7 days out and still not switched. */
  | "annual_reminder"
  /** An annual member, 3 days out. Not a message to them — a bell for somebody to ring them. */
  | "staff_bell";

export interface RunnerSettings {
  /** Off by default. A migration that starts itself on deploy is a migration nobody chose. */
  enabled: boolean;
  /** Days before a MONTHLY member's Santander date to send the link. */
  monthlyLeadDays: number;
  /** Days before an ANNUAL member's renewal for the first notice. */
  annualNoticeDays: number;
  /** …and the reminder. */
  annualReminderDays: number;
  /** …and the day staff are told to ring them. */
  annualEscalateDays: number;
  /** Work out what WOULD be sent and send nothing. The preview on the settings screen. */
  dryRun: boolean;
}

export const DEFAULT_RUNNER_SETTINGS: RunnerSettings = {
  enabled: false,
  monthlyLeadDays: 3,
  annualNoticeDays: 14,
  annualReminderDays: 7,
  annualEscalateDays: 3,
  dryRun: false,
};

/** The columns the decision reads. Deliberately tiny: everything else is the edge function's. */
export interface RunnerCandidate {
  id: string;
  billing_source: string | null;
  legacy_next_renewal: string | null;
  /** From the member's own subscription row — what Karma billed them. */
  billing_frequency: "monthly" | "annual" | null;
}

/** Whole days from `today` to `renewal`. Negative once the renewal has passed. */
export function daysUntil(renewalIso: string, today: Date): number | null {
  const m = renewalIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const renewal = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const from = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((renewal - from) / 86_400_000);
}

/**
 * What today's run owes this member, or null.
 *
 * EXACTLY ON THE DAY, not "within N days". A `<=` here would send the monthly link every day for
 * three days running — three texts about money to the same 80-year-old, each looking like the
 * last one failed. The dedupe key would stop the second and third being RECORDED, but the rule
 * should be right on its own: the key is a guarantee, not a substitute for the decision.
 *
 * A member with no renewal date on file is nobody's to write to. They are in the "needs a
 * billing date" queue instead, which is a person's job, and guessing here would put a link in
 * front of somebody on a day nobody chose.
 */
export function plannedActionFor(
  member: RunnerCandidate,
  settings: RunnerSettings,
  today: Date,
): RunnerActionKind | null {
  if (!settings.enabled) return null;
  // `legacy` only. A member already mid-switch has a link out — a second one is a second way to
  // be charged for the same month — and a `stripe` member is finished.
  if (member.billing_source !== "legacy") return null;
  if (!member.legacy_next_renewal) return null;

  const days = daysUntil(member.legacy_next_renewal, today);
  if (days === null || days < 0) return null;

  if (member.billing_frequency === "annual") {
    if (days === settings.annualNoticeDays) return "annual_notice";
    if (days === settings.annualReminderDays) return "annual_reminder";
    if (days === settings.annualEscalateDays) return "staff_bell";
    return null;
  }

  // Monthly, and anything the record does not call annual: a monthly schedule is the one that
  // comes round again, so it is the safe default for an unclear row.
  return days === settings.monthlyLeadDays ? "switch_link" : null;
}

/**
 * The key that makes a second send impossible rather than merely unlikely.
 *
 * Scoped to the RENEWAL, not to the month or to the day: an annual member's notice and reminder
 * are different kinds against the same renewal, and next year's is a different key. Re-running
 * the runner, overlapping runs, and a crash halfway through all resolve to the same insert.
 */
export function sendKey(memberId: string, renewalIso: string, kind: RunnerActionKind): string {
  return `billing-switch:${memberId}:${renewalIso}:${kind}`;
}

/** Whether this action writes to the MEMBER, or only rings the office. */
export function isMemberFacing(kind: RunnerActionKind): boolean {
  return kind !== "staff_bell";
}

export interface PlannedSend {
  member: RunnerCandidate;
  kind: RunnerActionKind;
  key: string;
  renewal: string;
  daysUntilRenewal: number;
}

/**
 * The whole of today's work, in one pass.
 *
 * Returned rather than performed so the settings screen's DRY RUN is the same computation as the
 * real run and not a second description of it. A preview that is written separately is a
 * preview that will one day disagree with what happens.
 */
export function planTodaysRun(
  members: RunnerCandidate[],
  settings: RunnerSettings,
  today: Date,
): PlannedSend[] {
  const out: PlannedSend[] = [];
  for (const member of members) {
    const kind = plannedActionFor(member, settings, today);
    if (!kind || !member.legacy_next_renewal) continue;
    out.push({
      member,
      kind,
      key: sendKey(member.id, member.legacy_next_renewal, kind),
      renewal: member.legacy_next_renewal,
      daysUntilRenewal: daysUntil(member.legacy_next_renewal, today) ?? 0,
    });
  }
  return out;
}

/** Settings as they are stored — strings in `system_settings`, so parsing is part of the rule. */
export const RUNNER_SETTING_KEYS = {
  enabled: "billing_migration_enabled",
  monthlyLeadDays: "billing_migration_monthly_lead_days",
  annualNoticeDays: "billing_migration_annual_notice_days",
  annualReminderDays: "billing_migration_annual_reminder_days",
  annualEscalateDays: "billing_migration_annual_escalate_days",
} as const;

/**
 * Read the settings out of `system_settings` rows.
 *
 * ANYTHING UNREADABLE FALLS BACK TO THE DEFAULT, and `enabled` falls back to FALSE. This decides
 * whether 431 elderly people are written to about money; the safe answer to "I cannot tell what
 * the setting says" is to send nothing and let somebody look.
 */
export function parseRunnerSettings(
  rows: Array<{ key: string; value: string | null }>,
  dryRun = false,
): RunnerSettings {
  const value = (key: string) => rows.find((r) => r.key === key)?.value ?? null;
  const days = (key: string, fallback: number) => {
    const raw = (value(key) ?? "").trim();
    /*
      THE EMPTY STRING IS NOT ZERO, and `Number("")` is — which made a missing row silently mean
      "send on the day itself" rather than "use the default". Caught by a test, and worth the
      explicit check: 0 IS a legal choice here, so it cannot be filtered out by a falsy guard
      either. The two cases have to be told apart on purpose.
    */
    if (raw === "") return fallback;
    const n = Number(raw);
    // 60 days is the ceiling: anything beyond that is a typo, not a lead time.
    return Number.isInteger(n) && n >= 0 && n <= 60 ? n : fallback;
  };

  return {
    enabled: value(RUNNER_SETTING_KEYS.enabled) === "true",
    monthlyLeadDays: days(RUNNER_SETTING_KEYS.monthlyLeadDays, DEFAULT_RUNNER_SETTINGS.monthlyLeadDays),
    annualNoticeDays: days(RUNNER_SETTING_KEYS.annualNoticeDays, DEFAULT_RUNNER_SETTINGS.annualNoticeDays),
    annualReminderDays: days(RUNNER_SETTING_KEYS.annualReminderDays, DEFAULT_RUNNER_SETTINGS.annualReminderDays),
    annualEscalateDays: days(RUNNER_SETTING_KEYS.annualEscalateDays, DEFAULT_RUNNER_SETTINGS.annualEscalateDays),
    dryRun,
  };
}
