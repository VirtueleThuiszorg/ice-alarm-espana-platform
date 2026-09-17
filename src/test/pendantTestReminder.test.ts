/**
 * HOW LONG A PENDANT TEST STAYS GOOD FOR — the threshold, the boundary, and the row.
 *
 * `protectionChecklist.test.tsx` covers what a member SEES. This file covers the parts that decide
 * it: a setting that has to be readable by the person it governs, a default that has to point in
 * the safe direction, and a boundary that somebody chose on purpose.
 *
 * THE FAILURE THIS FILE EXISTS TO PREVENT is not a wrong sentence on a dashboard. It is the row
 * being INERT — present in `system_settings`, edited in the admin screen, and invisible to every
 * member because nobody added the key to the public whitelist. That has happened twice in this
 * repo already (four pricing keys until 20260908120000, the alert-history flag until
 * 20260910190000) and both times the symptom was a setting that appeared to work.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_PENDANT_TEST_REMINDER_DAYS,
  PENDANT_TEST_REMINDER_KEY,
  daysSincePendantTest,
  parsePendantTestReminderDays,
  pendantTestIsStale,
} from "../lib/pendantTestReminder";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MIGRATION = read("supabase/migrations/20260917130000_pendant_test_reminder.sql");
/** The statements, without the comments that quote keys and defaults in prose. */
const MIGRATION_SQL = MIGRATION.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const NOW = Date.parse("2026-09-17T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("reading the threshold", () => {
  it("takes a sensible stored value", () => {
    expect(parsePendantTestReminderDays("30")).toBe(30);
    expect(parsePendantTestReminderDays(" 120 ")).toBe(120);
    expect(parsePendantTestReminderDays(1)).toBe(1);
  });

  it("falls back to 90 for every way of not being a number of days", () => {
    /*
      THE DIRECTION OF THE FALLBACK IS THE POINT. An unreadable setting must not switch the prompt
      off — "we could not read the threshold" is not a reason to tell somebody their fourteen-
      month-old test is current. So every rejection lands on the default rather than on infinity.
    */
    for (const bad of [
      undefined,
      null,
      "",
      "   ",
      "soon",
      "30 days",
      {},
      [],
      true,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0,
      -1,
      "-30",
      89.5,
      "89.5",
      // A millisecond value pasted into a days field. Ten years is already past the point where
      // the prompt means anything, so the bound is there to catch a paste, not to state a policy.
      7_776_000_000,
    ]) {
      expect(parsePendantTestReminderDays(bad), JSON.stringify(bad) ?? String(bad)).toBe(90);
    }
    expect(DEFAULT_PENDANT_TEST_REMINDER_DAYS).toBe(90);
  });
});

describe("how long ago the test was", () => {
  it("counts whole days", () => {
    expect(daysSincePendantTest(daysAgo(0), NOW)).toBe(0);
    expect(daysSincePendantTest(daysAgo(1), NOW)).toBe(1);
    expect(daysSincePendantTest(daysAgo(365), NOW)).toBe(365);
  });

  it("is null — not zero, and not a large number — when there is no readable date", () => {
    // Zero would read as "tested today" and a large number as "long overdue". Both are inventions
    // about a member's pendant from an absent field.
    for (const bad of [null, undefined, "", "not a date"]) {
      expect(daysSincePendantTest(bad, NOW)).toBeNull();
    }
  });
});

describe("the boundary, chosen on purpose", () => {
  it("is stale at EXACTLY the threshold, and not before", () => {
    /*
      The setting is the INTERVAL BETWEEN TESTS: once a whole interval has elapsed the next one is
      due. At 89 days a 90-day threshold says nothing; at 90 days it prompts, which is also when a
      person would say "it has been 90 days".
    */
    expect(pendantTestIsStale(daysAgo(89), 90, NOW)).toBe(false);
    expect(pendantTestIsStale(daysAgo(90), 90, NOW)).toBe(true);
    expect(pendantTestIsStale(daysAgo(91), 90, NOW)).toBe(true);
  });

  it("is the OPPOSITE edge to the heartbeat's, and that is deliberate", () => {
    /*
      `_shared/presence.ts` counts a heartbeat FRESH at exactly `HEARTBEAT_STALE_SECONDS`. That
      threshold is a tolerance for lateness, and its generous edge belongs on the side that avoids
      calling a present operator absent. This one is a schedule, and its generous edge belongs on
      the side that gets the pendant tested. Two modules, two boundaries, one reason each.
    */
    const presence = read("supabase/functions/_shared/presence.ts");
    expect(presence).toContain("beatMs >= nowMs - staleSeconds * 1000");
    const reminder = read("src/lib/pendantTestReminder.ts");
    expect(reminder).toContain("return age >= thresholdDays;");
  });

  it("NO DATE is never stale — that is a different sentence", () => {
    for (const bad of [null, undefined, "not a date"]) {
      expect(pendantTestIsStale(bad, 90, NOW)).toBe(false);
      expect(pendantTestIsStale(bad, 1, NOW)).toBe(false);
    }
  });

  it("a member who tested this morning is not chased", () => {
    expect(pendantTestIsStale(daysAgo(0), 90, NOW)).toBe(false);
  });
});

describe("one read, not two — what the perf gate caught", () => {
  /*
    The threshold started as its own `.eq("key", …)`. `e2e/perf/budgets.spec.ts` counts DISTINCT
    query shapes per table and treats three against one table as a read-once-per-row smell; the
    member dashboard already made two against `system_settings` (the company block's `.in(…)` and
    the alert-history flag's `.eq(…)`), so the third made three and the gate went red on the first
    CI run of this branch.

    The gate was right. Both settings say what a member is SHOWN, neither is about a member, and
    both are read by the portal on load — so one `.in(…)` answers both and the dashboard makes
    exactly as many settings round trips as it did before this feature existed.
  */
  it("both member-display settings come back from one query", () => {
    const shared = read("src/hooks/useMemberDisplaySettings.ts");
    expect(shared).toMatch(/\.in\("key", \[MEMBER_ALERT_HISTORY_KEY, PENDANT_TEST_REMINDER_KEY\]\)/);
    // One query key, so react-query serves every consumer from one cache entry.
    expect((shared.match(/queryKey:/g) ?? [])).toHaveLength(1);
  });

  it("neither hook issues a query of its own any more", () => {
    for (const hook of [
      "src/hooks/usePendantTestReminderDays.ts",
      "src/hooks/useMemberAlertHistory.ts",
    ]) {
      const src = read(hook);
      expect(src, `${hook} still queries directly`).not.toContain("supabase");
      expect(src, hook).not.toContain("useQuery");
    }
  });

  it("the two fallbacks point in opposite directions, on purpose", () => {
    /*
      Same read, opposite safe sides. Alert history OFF: showing a member a list of their own
      worst days because a read failed is the bad direction. The threshold 90, never "never
      stale": telling somebody their fourteen-month-old test is current is the bad direction here.
      Asserted because a later tidy-up that gave them one shared default would silently break one
      of them.
    */
    const shared = read("src/hooks/useMemberDisplaySettings.ts");
    expect(shared).toMatch(/alertHistoryEnabled: false/);
    expect(shared).toMatch(/pendantTestReminderDays: DEFAULT_PENDANT_TEST_REMINDER_DAYS/);
  });
});

describe("the row, and the reason it would otherwise be inert", () => {
  it("seeds the key at 90 without resetting a value somebody has changed", () => {
    expect(MIGRATION_SQL).toContain("INSERT INTO public.system_settings (key, value)");
    expect(MIGRATION_SQL).toMatch(/VALUES \('pendant_test_reminder_days', '90'\)/);
    expect(MIGRATION_SQL).toContain("ON CONFLICT (key) DO NOTHING");
  });

  it("the key the migration writes is the key the client reads", () => {
    // Two strings that must agree and live in different languages. This is the cheapest place to
    // find out that they stopped agreeing.
    expect(PENDANT_TEST_REMINDER_KEY).toBe("pendant_test_reminder_days");
    expect(MIGRATION_SQL).toContain(`'${PENDANT_TEST_REMINDER_KEY}'`);
    expect(read("src/hooks/useMemberDisplaySettings.ts")).toContain("PENDANT_TEST_REMINDER_KEY");
  });

  it("adds the key to the PUBLIC whitelist, or a member cannot read it at all", () => {
    /*
      A member is `authenticated` with no staff row. A key outside the whitelist reads back as
      nothing, the client falls back to 90, and an admin editing the number changes nothing —
      silently, for ever. That is the exact state four pricing keys were in until 20260908120000.
    */
    expect(MIGRATION_SQL).toContain(
      'CREATE POLICY "Anyone can read the public settings whitelist"',
    );
    expect(MIGRATION_SQL).toContain("'pendant_test_reminder_days'");
  });

  it("carries the previous eight keys forward — the policy is replaced, not patched", () => {
    /*
      A policy cannot be altered in place, so every addition rewrites the list. Dropping a key on
      the way past would take a public page or the /join payment flow down without touching a line
      of TypeScript, which is why they are named here rather than counted.
    */
    for (const key of [
      "settings_company_name",
      "settings_emergency_phone",
      "settings_support_email",
      "settings_address",
      "settings_active_payment_gateway",
      "registration_fee_enabled",
      "registration_fee_discount",
      "member_alert_history_enabled",
    ]) {
      expect(MIGRATION_SQL, key).toContain(`'${key}'`);
    }
  });

  it("lets in nothing credential-shaped", () => {
    // The whitelist's own rule, checked at the point a key is added rather than only in the RLS
    // harness: the question is "is this genuinely public", never "does somebody need it".
    const keys = [...MIGRATION_SQL.matchAll(/^\s*'([a-z_]+)',?$/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const key of keys) {
      expect(key, key).not.toMatch(/secret|token|password|api_key|_key$/);
    }
  });

  it("says how to reverse it", () => {
    expect(MIGRATION).toContain("TO REVERSE");
    expect(MIGRATION).toContain("20260910190000");
  });

  it("is proved by the isolation harness, which names the keys rather than counting them", () => {
    // `scripts/rls/isolation.sql` asserts the EXACT set an anonymous caller can read. Without the
    // seed line it would assert "the whitelisted keys that happen to exist", which a widened
    // policy passes.
    const harness = read("scripts/rls/isolation.sql");
    expect(harness).toContain("('pendant_test_reminder_days',     '90')");
    expect(harness).toContain("anonymous reads EXACTLY the nine whitelisted settings keys");
  });
});

describe("the sentence the member ends up reading", () => {
  it("has a title and a body in all three locales, with the same placeholder", () => {
    for (const locale of ["en", "es", "nl"]) {
      const table = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as {
        protection: { pendant: Record<string, string> };
      };
      const pendant = table.protection.pendant;
      for (const key of ["ok", "stale", "staleAction"]) {
        expect(pendant[key], `${locale} ${key}`).toBeTruthy();
      }
      // The date is interpolated, so both sentences must actually contain the placeholder — a
      // translation that drops it loses the date silently rather than failing.
      expect(pendant.ok, `${locale} ok`).toContain("{{date}}");
      expect(pendant.stale, `${locale} stale`).toContain("{{date}}");
      // …and the action is a verb phrase, not the word "stale" leaking into the UI.
      expect(pendant.staleAction.toLowerCase(), locale).not.toContain("stale");
    }
  });

  it("is formatted through the one locale map, not a second inline ternary", () => {
    /*
      The dashboard's greeting had that ternary inline and `nl` fell through to English, so a Dutch
      member read an English date under a Dutch greeting. The fix moved the map; this keeps the
      second surface from re-creating it.
    */
    const checklist = read("src/components/client/ProtectionChecklist.tsx");
    expect(checklist).toContain("formatMemberDayMonth");
    expect(checklist).not.toMatch(/language === ['"]es['"]/);
    const dashboard = read("src/pages/client/ClientDashboard.tsx");
    expect(dashboard).toContain("memberDateLocale(i18n.language)");
    expect(dashboard).not.toMatch(/language === ['"]es['"] \?/);
  });
});
