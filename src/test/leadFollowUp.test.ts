import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_FOLLOWUP_DAYS,
  FOLLOWUP_STATUSES,
  followUpCutoff,
  needsFollowUp,
} from "@/lib/leadFollowUp";
import { LEAD_STATUSES } from "@/lib/leadStatus";

/**
 * "FOLLOW UP TODAY" — the list of people who were told somebody would be in touch, and were not.
 *
 * A lead goes quiet not because anybody decided to leave it, but because the operator working it
 * had four other things on that morning. The assertions that matter are the EXCLUSIONS: a
 * person who said no and is chased anyway is the worst outcome this feature can produce.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const NOW = new Date("2026-09-19T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const lead = (over: Record<string, unknown> = {}) => ({
  status: "contacted",
  do_not_contact: false,
  last_contacted_at: daysAgo(5),
  created_at: daysAgo(10),
  ...over,
});

describe("who is due", () => {
  it("an open lead nobody has written to for long enough", () => {
    expect(needsFollowUp(lead(), 3, NOW)).toBe(true);
  });

  it("but not one written to yesterday", () => {
    expect(needsFollowUp(lead({ last_contacted_at: daysAgo(1) }), 3, NOW)).toBe(false);
  });

  it("exactly on the boundary counts — three days means three days", () => {
    expect(needsFollowUp(lead({ last_contacted_at: daysAgo(3) }), 3, NOW)).toBe(true);
  });

  it("a lead NOBODY HAS EVER WRITTEN TO is due from when it arrived", () => {
    /*
      Treating a never-contacted lead as "not yet due" would hide exactly the ones forgotten on
      the day they came in — which are the ones most likely to have been forgotten, not the
      least. A lead added at a market stall on Saturday is due on Tuesday whether or not anybody
      got round to opening it.
    */
    expect(needsFollowUp(lead({ last_contacted_at: null, created_at: daysAgo(4) }), 3, NOW)).toBe(true);
    expect(needsFollowUp(lead({ last_contacted_at: null, created_at: daysAgo(1) }), 3, NOW)).toBe(false);
  });
});

describe("who is NOT, and these are the assertions that matter", () => {
  it("somebody who said no is never chased", () => {
    // The worst outcome this feature can produce.
    expect(needsFollowUp(lead({ status: "not_interested", last_contacted_at: daysAgo(90) }), 3, NOW)).toBe(false);
  });

  it("nor is a lead marked do_not_contact, whatever its status", () => {
    /*
      CHECKED HERE AS WELL AS IN THE SEND PATH, because this list is what a person works FROM.
      Leaving a silenced lead on it and refusing the send afterwards would be a screen that asks
      somebody to do a thing it will then decline to do.
    */
    expect(needsFollowUp(lead({ do_not_contact: true, last_contacted_at: daysAgo(90) }), 3, NOW)).toBe(false);
  });

  it("nor somebody who has already joined, nor one already given up on", () => {
    expect(needsFollowUp(lead({ status: "joined" }), 3, NOW)).toBe(false);
    expect(needsFollowUp(lead({ status: "unreachable" }), 3, NOW)).toBe(false);
  });

  it("the open list is exactly the ladder minus its three endings", () => {
    // Derived from the ladder rather than restated, so a status added to one and not the other
    // is impossible rather than merely unlikely.
    const endings = LEAD_STATUSES.filter((s) => !FOLLOWUP_STATUSES.includes(s));
    expect([...endings]).toEqual(["joined", "not_interested", "unreachable"]);
  });
});

describe("the cut-off", () => {
  it("is computed in one place, so every caller asks the same question", () => {
    /*
      Three surfaces need "three days ago": the admin list, the call-centre list, and the runner
      that bells the assignee. Three places computing it is three places that disagree the first
      time one of them changes.
    */
    expect(followUpCutoff(3, NOW)).toBe("2026-09-16T12:00:00.000Z");
    expect(followUpCutoff(1, NOW)).toBe("2026-09-18T12:00:00.000Z");
  });

  it("and both lists use it rather than inlining a date", () => {
    for (const page of ["src/pages/admin/LeadsPage.tsx", "src/pages/call-centre/LeadsPage.tsx"]) {
      const src = read(page);
      expect(src, page).toContain("followUpCutoff(followUpDays)");
      expect(src, page).toContain("FOLLOWUP_STATUSES");
      // And the exclusion is in the QUERY, not only in the helper — a filter that fetched
      // silenced leads and hid them client-side would still show a count that included them.
      expect(src, page).toContain(".not('do_not_contact', 'is', true)");
    }
  });

  it("the default is the number the migration seeds", () => {
    expect(DEFAULT_FOLLOWUP_DAYS).toBe(3);
    const sql = read("supabase/migrations/20260919120000_lead_working_schema.sql");
    expect(sql).toContain("VALUES ('lead_followup_days', '3')");
  });
});

describe("the status filters offer the states that exist", () => {
  /*
    BOTH LISTS WERE WRONG, and neither would have looked it. The admin filter offered
    `qualified`, `converted` and `lost` — the three values migration 20260919120000 renamed — so
    three of its five options matched no row at all, and the two real states they became could
    not be filtered for. The call-centre one offered `qualified` and four of the seven real
    states were unreachable.
  */
  it.each([
    "src/pages/admin/LeadsPage.tsx",
    "src/pages/call-centre/LeadsPage.tsx",
  ])("%s drives its status filter from the ladder", (page) => {
    const src = read(page);
    expect(src).toContain("LEAD_STATUSES.map");
    for (const dead of ["qualified", "converted", "lost"]) {
      expect(src, `${page} still offers ${dead}`).not.toMatch(
        new RegExp(`<SelectItem value="${dead}"`),
      );
    }
  });
});

describe("the CSV", () => {
  const src = read("src/pages/admin/LeadsPage.tsx");

  it("exports what is on screen, not the whole table", () => {
    /*
      A CSV of every lead the business has ever had is a different object from a CSV of the
      thirty an admin is looking at: one is a working file, the other is the marketing list of
      every person who ever enquired, leaving the building on a laptop.
    */
    expect(src).toContain("exportToCsv(filteredLeads");
    expect(src).not.toMatch(/exportToCsv\(leads\b/);
  });

  it("carries the consent timestamp", () => {
    // A row in this file nobody agreed to be contacted about is a row whoever opens it needs to
    // know about.
    expect(src).toContain('header: "Consent recorded"');
  });

  it("and the last contact, which is what the file is usually for", () => {
    expect(src).toContain('header: "Last contacted"');
  });
});
