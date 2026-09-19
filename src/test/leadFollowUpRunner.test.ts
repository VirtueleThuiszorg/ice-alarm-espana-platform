import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  followUpMessage,
  leadsToRemind,
  type FollowUpLead,
} from "../../supabase/functions/_shared/lead-followup";

/**
 * ONE BELL, TO THE PERSON WHO OWNS THE LEAD, WHEN IT HAS GONE QUIET.
 *
 * THE WHOLE DESIGN IS ABOUT NOT BECOMING NOISE. A daily reminder about the same lead is a
 * notification people learn to dismiss, and somebody who has learned to dismiss one bell
 * dismisses the next — including the one about a payment that failed. So almost every assertion
 * here is about a lead that must NOT ring.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const NOW = new Date("2026-09-19T07:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const lead = (over: Partial<FollowUpLead> = {}): FollowUpLead => ({
  id: "lead-1",
  status: "contacted",
  do_not_contact: false,
  last_contacted_at: daysAgo(5),
  created_at: daysAgo(10),
  followup_bell_sent_at: null,
  assigned_to: "staff-1",
  first_name: "Rosa",
  ...over,
});

describe("who rings", () => {
  it("an open, owned lead nobody has written to for long enough", () => {
    expect(leadsToRemind([lead()], 3, NOW)).toEqual([
      { leadId: "lead-1", staffId: "staff-1", firstName: "Rosa" },
    ]);
  });

  it("including one nobody has ever written to, measured from when it arrived", () => {
    expect(leadsToRemind([lead({ last_contacted_at: null, created_at: daysAgo(4) })], 3, NOW))
      .toHaveLength(1);
  });
});

describe("who does NOT — which is most of this module", () => {
  it("somebody already belled about this same silence", () => {
    /*
      THE ONE THAT MAKES IT ONCE AND NOT DAILY. `followup_bell_sent_at` is cleared by the
      database trigger the moment anybody actually contacts the lead, so the sequence is:
      quiet → one bell → somebody writes → quiet again → one more bell.
    */
    expect(leadsToRemind([lead({ followup_bell_sent_at: daysAgo(1) })], 3, NOW)).toEqual([]);
  });

  it("somebody who said no", () => {
    expect(leadsToRemind([lead({ status: "not_interested", last_contacted_at: daysAgo(90) })], 3, NOW)).toEqual([]);
  });

  it("a lead marked do_not_contact", () => {
    // Reminding an operator to write to somebody the platform will then refuse to write to is
    // worse than saying nothing.
    expect(leadsToRemind([lead({ do_not_contact: true })], 3, NOW)).toEqual([]);
  });

  it("one that has already joined, or been given up on", () => {
    expect(leadsToRemind([lead({ status: "joined" })], 3, NOW)).toEqual([]);
    expect(leadsToRemind([lead({ status: "unreachable" })], 3, NOW)).toEqual([]);
  });

  it("and one nobody owns — that is the LIST's job, not a bell's", () => {
    /*
      An unowned lead going quiet is a real problem, and "Follow up today" shows it to whoever
      opens the page, which is the right way to surface work nobody has claimed. Belling every
      operator about every unowned lead is exactly the noise this module exists to avoid.
    */
    expect(leadsToRemind([lead({ assigned_to: null })], 3, NOW)).toEqual([]);
  });

  it("nor one written to yesterday", () => {
    expect(leadsToRemind([lead({ last_contacted_at: daysAgo(1) })], 3, NOW)).toEqual([]);
  });

  it("nor one whose dates are unreadable — it is skipped, not belled on a NaN", () => {
    expect(leadsToRemind([lead({ last_contacted_at: "not a date", created_at: "also not" })], 3, NOW)).toEqual([]);
  });
});

describe("the message", () => {
  it("says how long, not just 'follow up'", () => {
    /*
      "Follow up with Rosa" is a task. "No contact with Rosa for 4 days" is a FACT — and an
      operator can disagree with a fact: they may have rung her from their own phone. A reminder
      somebody can tell is wrong is one they keep reading.
    */
    expect(followUpMessage("Rosa", 4)).toBe("No contact with Rosa for 4 days — worth a follow-up");
  });

  it("is still a sentence with no name", () => {
    expect(followUpMessage("", 3)).toBe("No contact with a lead for 3 days — worth a follow-up");
  });
});

describe("the runner", () => {
  const fn = read("supabase/functions/lead-followup-runner/index.ts");

  it("marks the lead only AFTER the bell is written", () => {
    /*
      The other order — mark, then bell — loses the reminder entirely if the insert fails, and
      the lead would never be considered again, because the mark is only cleared by an actual
      contact.
    */
    const bellAt = fn.indexOf('from("notification_log")');
    const markAt = fn.indexOf("followup_bell_sent_at: new Date()");
    expect(bellAt).toBeGreaterThan(0);
    expect(markAt).toBeGreaterThan(bellAt);
  });

  it("leaves a lead unmarked when its owner has no login", () => {
    // Otherwise that lead is silently skipped for ever, because the mark is only cleared by a
    // contact that nobody has been reminded to make.
    expect(fn).toContain("if (!userId) continue;");
  });

  it("tells 'nothing was due' apart from 'the runner did not run'", () => {
    // They look identical from outside, and the second is the failure that goes unnoticed for a
    // month.
    expect(fn).toMatch(/examined: leads\?\.length \?\? 0, reminded: 0/);
  });

  it("bells the OWNER, never a broadcast", () => {
    expect(fn).toContain("admin_user_id: userId");
    expect(fn).not.toMatch(/admin_user_id:\s*null/);
  });
});

describe("the schedule", () => {
  const sql = read("supabase/migrations/20260919160000_lead_followup_cron.sql");

  it("is once a day", () => {
    // Every send is marked, so a second run would be harmless — but a schedule that fires twice
    // is one somebody later reads as permission to fire hourly.
    expect(sql).toContain("'0 7 * * *'");
  });

  it("reads the key from Vault, never from a GUC", () => {
    /*
      `current_setting()` without `missing_ok` THROWS when the parameter is unset, and two crons
      scheduled that way produced ~694 errors a day until 20260723120000 corrected them.
    */
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).not.toContain("current_setting('app.settings");
    expect(sql).toContain("RAISE WARNING");
  });

  it("unschedules before scheduling, so re-applying does not error", () => {
    expect(sql).toContain("cron.unschedule('lead-followup-runner')");
  });

  it("carries NO table, policy or RLS — which is what makes skipping it free", () => {
    /*
      `scripts/rls/run.sh` cannot install pg_cron, so it skips this file — and a skipped file
      takes its whole contents with it. That is exactly why the schedule is not in the schema
      migration: it would have taken `lead_communications` and its policies out of the harness.
    */
    /*
      COMMENTS STRIPPED FIRST. The header above says, in so many words, that this file contains
      "ZERO CREATE TABLE, ZERO CREATE POLICY" — so an assertion over the raw text forbids the
      sentence explaining the property along with any violation of it. That is the tenth time
      this repo has caught a check matching the prose about a defect rather than the defect.
    */
    const code = sql.replace(/--[^\n]*/g, "");
    for (const forbidden of [/CREATE\s+TABLE/i, /CREATE\s+POLICY/i, /ENABLE\s+ROW\s+LEVEL/i]) {
      expect(code).not.toMatch(forbidden);
    }
    // And the strip has not simply emptied the file.
    expect(code).toContain("cron.schedule");
  });

  it("and the harness knows to skip it", () => {
    // A pg_cron file NOT on the skip list fails every migration after it, so the whole suite
    // reports NO VERDICT.
    expect(read("scripts/rls/run.sh")).toContain("20260919160000_lead_followup_cron.sql");
  });
});
