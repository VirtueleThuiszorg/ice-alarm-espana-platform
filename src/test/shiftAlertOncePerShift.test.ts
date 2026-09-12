/**
 * ONE ALERT PER PERSON PER SHIFT — and the reason the index alone was not enough.
 *
 * `shift_alert_log` has carried a partial unique index since it was created: at most one OPEN row
 * per (alert_type, staff, shift_date, shift_type). The index was doing its job. Nobody was
 * listening to it:
 *
 *     await supabase.from("shift_alert_log").insert({ ... });   // error discarded
 *     await fetch(`${baseUrl}/functions/v1/notify-admin`, ...);  // sent regardless
 *
 * The runner SELECTed for an open row, INSERTed, and notified — never reading the insert's
 * result. Two things follow, and both happened. Read-then-write is not atomic, so two runs could
 * each find nothing and each notify. And a row REFUSED by the index still produced a
 * notification, for ever, every two minutes, because the refusal was thrown away.
 *
 * So the fix is not another index. It is making the DATABASE's answer — did this row land? — the
 * thing that decides whether anybody is told.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const RUNNER = readFileSync(join(ROOT, "supabase/functions/staff-shift-monitor/index.ts"), "utf8");
/**
 * The runner's CODE, without its comments.
 *
 * `claimAlert`'s own doc quotes the two lines it replaced, so a search of the whole file for the
 * old shape finds the explanation of why it is gone. That is the comment doing its job, and it
 * must not fail the test that says the code is gone.
 */
const RUNNER_CODE = RUNNER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20260912100000_shift_alert_once_per_shift.sql"),
  "utf8",
);
/** The statements, without the comments that quote the index this deliberately does not touch. */
const MIGRATION_SQL = MIGRATION.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("the claim, not the read, is what decides", () => {
  it("inserts with ON CONFLICT DO NOTHING and asks whether the row landed", () => {
    // `ignoreDuplicates` is PostgREST's ON CONFLICT DO NOTHING; `.select()` makes it answer.
    expect(RUNNER).toContain("ignoreDuplicates: true");
    expect(RUNNER).toMatch(/\.upsert\(row, \{ ignoreDuplicates: true \}\)\s*\n\s*\.select\("id"\)/);
    expect(RUNNER).toContain("return (data ?? []).length > 0;");
  });

  it("no longer reads first and inserts second", () => {
    // The read-then-write pair, which is not atomic and whose insert result was discarded.
    expect(RUNNER_CODE).not.toMatch(/\.from\("shift_alert_log"\)\s*\n\s*\.select\("id"\)/);
    expect(RUNNER_CODE).not.toMatch(/await supabase\.from\("shift_alert_log"\)\.insert\(/);
    // …and the comment that explains their absence is still there.
    expect(RUNNER).toContain("error discarded");
  });

  it("sends nothing when the claim fails", () => {
    /*
      A failed claim must not notify. The row IS the dedupe — without it there is nothing to stop
      the next run doing this again in two minutes, so silence is the safe direction.
    */
    expect(RUNNER).toContain("alert_claim_failed");
    expect(RUNNER).toMatch(/if \(!raisedNoShow\) continue;/);
  });

  it("claims every alert type, not just the one that flooded", () => {
    /*
      The identical read-then-write pair sat in CHECK 2 (no coverage) and CHECK 3 (disconnected).
      Leaving them would leave the same defect in two places next to the one being fixed, waiting
      for the same night.

      THE COUNT IS DERIVED, not written down. It used to be the literal 4, and adding the
      `no_show_escalated` rung turned this red for the right reason expressed the wrong way — the
      number was standing in for "every type goes through the claim", so it should be counted from
      the types rather than repeated beside them. Now a new alert type that forgets to claim fails
      here, and one that claims properly does not.
    */
    const types = [
      "no_show",
      "no_coverage",
      "disconnected",
      "not_on_duty",
      "no_show_escalated",
    ];
    for (const type of types) {
      expect(RUNNER, type).toContain(`alert_type: "${type}"`);
    }
    expect(RUNNER.match(/await claimAlert\(/g) ?? []).toHaveLength(types.length);
  });

  it("guards the nudge the same way", () => {
    // Otherwise "you are online, press On duty" would fire every two minutes for eight hours —
    // the flood again, wearing a politer message.
    expect(RUNNER).toMatch(/const raised = await claimAlert\(supabase, \{\s*\n\s*alert_type: "not_on_duty"/);
    expect(RUNNER).toMatch(/if \(raised\) \{/);
  });
});

describe("five runs, one alert — the arithmetic the claim guarantees", () => {
  /**
   * The runner's rule, extracted: a notification goes out only when the claim returns true, and
   * the claim returns true only when the database accepted a new row.
   */
  const claim = (openKeys: Set<string>, key: string) => {
    if (openKeys.has(key)) return false; // the unique index refuses it
    openKeys.add(key);
    return true;
  };

  it("notifies once across five runs of an absent operator", () => {
    const open = new Set<string>();
    const key = "no_show|travis|2026-09-11|night";
    const sent = [1, 2, 3, 4, 5].filter(() => claim(open, key));
    expect(sent).toHaveLength(1);
  });

  it("notifies again in the SAME shift only after the row is resolved", () => {
    /*
      Which is why resolving on arrival matters beyond tidiness: while a row is open the index
      refuses a new one, so a genuine absence later in the same shift would be swallowed by a row
      about something already over.
    */
    const open = new Set<string>();
    const key = "no_show|travis|2026-09-11|night";
    expect(claim(open, key)).toBe(true);
    expect(claim(open, key)).toBe(false);
    open.delete(key); // resolved: they turned up
    expect(claim(open, key)).toBe(true);
  });

  it("keys separately per person and per shift, so one alert never masks another", () => {
    const open = new Set<string>();
    expect(claim(open, "no_show|travis|2026-09-11|night")).toBe(true);
    expect(claim(open, "no_show|carmen|2026-09-11|night")).toBe(true);
    expect(claim(open, "no_show|travis|2026-09-12|night")).toBe(true);
    expect(claim(open, "not_on_duty|travis|2026-09-11|night")).toBe(true);
    expect(open.size).toBe(4);
  });
});

describe("an alert that is over says so", () => {
  it("closes both the no-show and the nudge when the person goes on duty", () => {
    expect(RUNNER).toMatch(/for \(const type of \["no_show", "not_on_duty"\]\)/);
    expect(RUNNER).toContain('"signed_in"');
  });

  it("sends the retraction only when a row actually moved", () => {
    // `resolveAlert` returns whether an UPDATE matched, so the bell is sent once rather than
    // every two minutes for the rest of the shift.
    expect(RUNNER).toMatch(/if \(closed && type === "no_show"\)/);
    expect(RUNNER).toContain("shift.signed_in_after_alert");
    expect(RUNNER).toContain("resolvedOnArrival");
  });

  it("only ever resolves rows that are still open", () => {
    expect(RUNNER).toMatch(/\.is\("resolved_at", null\)\s*\n\s*\.select\("id"\)/);
  });
});

describe("the migration", () => {
  it("adds no second dedupe index", () => {
    /*
      The one from 20260303123455 already gives the property. A second on the bare columns would
      be the same constraint written twice: two to maintain, two to keep in step, and a
      CONCURRENTLY rebuild one day that silently covers only one.
    */
    expect(MIGRATION_SQL).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(MIGRATION).toContain("shift_alert_log_dedup_idx");
  });

  it("records WHY a row closed, which resolved_at cannot say", () => {
    expect(MIGRATION_SQL).toMatch(/ADD COLUMN IF NOT EXISTS resolution TEXT/);
    expect(MIGRATION).toMatch(/COMMENT ON COLUMN public\.shift_alert_log\.resolution/);
  });

  it("allows the nudge's alert type without dropping the other three", () => {
    const check = /CHECK \(alert_type IN \('no_show', 'no_coverage', 'disconnected', 'not_on_duty'\)\)/;
    expect(MIGRATION_SQL).toMatch(check);
  });

  it("retracts every open row, and says the reversal does not reopen them", () => {
    expect(MIGRATION_SQL).toMatch(/UPDATE public\.shift_alert_log[\s\S]*?resolution\s*=\s*'false_positive_pre_fix'[\s\S]*?WHERE resolved_at IS NULL/);
    expect(MIGRATION).toContain("REVERSAL");
    expect(MIGRATION).toMatch(/NOT reopened by a reversal/);
  });

  it("sets resolved_at to now, not to when the row was created", () => {
    // The row WAS open until this ran. Back-dating it would put a false duration in any report.
    expect(MIGRATION_SQL).toMatch(/SET resolved_at = now\(\)/);
    expect(MIGRATION_SQL).not.toMatch(/resolved_at = created_at/);
  });
});

describe("the two new event types are registered everywhere they must be", () => {
  it("are in the router's list, so a notification for them is not refused", () => {
    const router = readFileSync(
      join(ROOT, "supabase/functions/_shared/notify-staff.ts"),
      "utf8",
    );
    expect(router).toContain('"shift.not_on_duty"');
    expect(router).toContain('"shift.signed_in_after_alert"');
  });

  it("have a spec, which the build already requires — and three translations, which it does not", () => {
    const matrix = readFileSync(join(ROOT, "src/lib/notifyMatrix.ts"), "utf8");
    expect(matrix).toContain('event: "shift.not_on_duty"');
    expect(matrix).toContain('event: "shift.signed_in_after_alert"');

    for (const locale of ["en", "es", "nl"]) {
      const file = JSON.parse(
        readFileSync(join(ROOT, `src/i18n/locales/${locale}.json`), "utf8"),
      ) as { notifications: { event: Record<string, { title: string; body: string }> } };
      for (const key of ["shift_not_on_duty", "shift_signed_in_after_alert"]) {
        expect(file.notifications.event[key]?.title, `${locale} ${key}`).toBeTruthy();
        expect(file.notifications.event[key]?.body, `${locale} ${key}`).toBeTruthy();
      }
    }
  });

  it("go through notify-staff with the shape it actually parses", () => {
    // `parseNotifyRequest` wants `{ event: {type, title, body}, audience: {roles|staffIds} }`.
    // An `event_type`/`payload` body — notify-admin's shape — is refused with UNKNOWN_EVENT_TYPE.
    expect(RUNNER).toMatch(/event: \{\s*\n\s*type: "shift\.not_on_duty"/);
    expect(RUNNER).toMatch(/audience: \{ staffIds: \[scheduled\.staff_id\] \}/);
    expect(RUNNER).toMatch(/audience: \{ roles: \["call_centre_supervisor", "admin", "super_admin"\] \}/);
  });
});
