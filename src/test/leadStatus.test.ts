import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { LEAD_STATUSES, OPEN_LEAD_STATUSES, isOpenLead } from "@/lib/leadStatus";

/**
 * THE LADDER THE UI OFFERS AND THE LADDER THE DATABASE ACCEPTS ARE THE SAME LADDER.
 *
 * A status button that writes a value the CHECK constraint refuses is an error toast with
 * nothing an operator can do about it — and a constraint value the UI never offers is a state
 * a lead can only be put into by hand in the SQL editor. Both are invisible until somebody
 * presses the wrong button in front of a customer.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const MIGRATION = "supabase/migrations/20260919120000_lead_working_schema.sql";

describe("the ladder", () => {
  it("is the brief's, in order", () => {
    expect([...LEAD_STATUSES]).toEqual([
      "new", "contacted", "interested", "join_link_sent",
      "joined", "not_interested", "unreachable",
    ]);
  });

  it("matches the CHECK constraint exactly — no extra, no missing", () => {
    /*
      READ OFF THE MIGRATION, not restated. A seventh status added to one side only is the
      failure this exists for, and it would pass any test that listed the values twice.
    */
    const sql = read(MIGRATION);
    const clause = sql.slice(sql.indexOf("ADD CONSTRAINT leads_status_ladder"));
    const inDb = [...clause.slice(0, clause.indexOf(")")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inDb.length, "the constraint was not found in the migration").toBeGreaterThan(0);
    expect([...inDb].sort()).toEqual([...LEAD_STATUSES].sort());
  });

  it("has three endings, and they are the three that must never be chased", () => {
    // `joined` needs nothing. `unreachable` has already been tried. `not_interested` is the one
    // that matters: a person who said no and is messaged anyway is the worst outcome here.
    const endings = LEAD_STATUSES.filter((s) => !OPEN_LEAD_STATUSES.includes(s));
    expect([...endings]).toEqual(["joined", "not_interested", "unreachable"]);
    expect(isOpenLead("not_interested")).toBe(false);
    expect(isOpenLead("contacted")).toBe(true);
  });

  it("is a list and not a state machine, on purpose", () => {
    /*
      A lead does not move in one direction: somebody says "not now, ring me in the spring" and
      an operator has to be able to put them back. A machine forbidding that would be worked
      around by leaving every lead on `contacted`, which is worse than no ladder at all.
    */
    const src = read("src/lib/leadStatus.ts");
    expect(src).not.toMatch(/TRANSITIONS|canTransition|nextStatus/);
  });

  it("the three legacy values are gone from the constraint, not kept alongside", () => {
    // Two names for one thing means the day somebody filters on `not_interested` and misses the
    // `lost` rows is the day a person who asked not to be contacted gets contacted.
    const sql = read(MIGRATION);
    const clause = sql.slice(sql.indexOf("ADD CONSTRAINT leads_status_ladder"));
    const list = clause.slice(0, clause.indexOf(")"));
    for (const legacy of ["qualified", "lost", "converted"]) {
      expect(list, `${legacy} is still accepted`).not.toContain(`'${legacy}'`);
    }
    // And they were RENAMED rather than dropped, so no row was orphaned by the constraint.
    expect(sql).toContain("WHERE status = 'qualified'");
    expect(sql).toContain("WHERE status = 'lost'");
    expect(sql).toContain("WHERE status = 'converted'");
  });
});

describe("what the UI offers", () => {
  it("every status on the ladder, minus the one it is already on", () => {
    const src = read("src/components/leads/LeadIntroduceSection.tsx");
    expect(src).toContain("LEAD_STATUSES.filter((s) => s !== lead.status)");
  });

  it("and the buttons record who moved it", () => {
    // The brief's "Status buttons record who/when". `status_changed_by` is filled by the
    // database's own default path; the timestamp is set here so a reader can see it moved.
    const src = read("src/components/leads/LeadIntroduceSection.tsx");
    expect(src).toContain("status_changed_at");
  });
});

describe("a silenced lead", () => {
  it("has every channel button disabled on screen as well as refused on the server", () => {
    /*
      BOTH, and the order matters: the server is the rule and the screen is the courtesy. A
      disabled button alone would be a UI check somebody could bypass; a server check alone
      would let an operator press send four times and read four refusals.
    */
    const src = read("src/components/leads/LeadIntroduceSection.tsx");
    expect(src).toContain("const silenced = lead.do_not_contact === true");
    expect(src).toContain("disabled={silenced || busy !== null}");
    const shared = read("supabase/functions/_shared/lead-message.ts");
    expect(shared).toContain("skipped_do_not_contact");
  });
});

describe("the timeline", () => {
  it("shows the skips, not only the sends", () => {
    /*
      With all three channels off in production, a timeline of successful sends only would read
      as "nobody has ever contacted this person" — while the operator who pressed send four
      times remembers doing it. The skips are the interesting rows.
    */
    const src = read("src/components/leads/LeadTimeline.tsx");
    expect(src).not.toMatch(/\.eq\("outcome", "sent"\)/);
    expect(src).toContain("leads.outcome.");
  });
});
