import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { calculateNextCallDate, nextCallDateString } from "@/lib/courtesySchedule";

const SHARED_RULE = "supabase/functions/_shared/courtesy-schedule.ts";

/**
 * The rule that decides when a vulnerable person is rung next.
 *
 * Every month-end case here is one the two previous copies answered DIFFERENTLY: the member's
 * record (date-fns `addMonths`, clamping) said 28 February and the generator (`setMonth`,
 * overflowing) wrote 3 March. The assertions below are the clamping answer, which is the one
 * that keeps a monthly call inside the month it belongs to.
 */
describe("the courtesy-call schedule", () => {
  describe("fixed-length frequencies count days", () => {
    it.each([
      ["daily", "2026-01-31", "2026-02-01"],
      ["weekly", "2026-01-31", "2026-02-07"],
      ["bi-weekly", "2026-01-31", "2026-02-14"],
    ])("%s from %s is %s", (frequency, from, expected) => {
      expect(nextCallDateString(frequency, new Date(`${from}T09:00:00`))).toBe(expected);
    });
  });

  describe("monthly clamps to the end of the target month", () => {
    it("31 January is 28 February, not 3 March", () => {
      expect(nextCallDateString("monthly", new Date("2026-01-31T09:00:00"))).toBe("2026-02-28");
    });

    it("31 January in a leap year is 29 February", () => {
      expect(nextCallDateString("monthly", new Date("2028-01-31T09:00:00"))).toBe("2028-02-29");
    });

    it("30 January is also 28 February — every day that February lacks lands on the last one", () => {
      expect(nextCallDateString("monthly", new Date("2026-01-30T09:00:00"))).toBe("2026-02-28");
    });

    it("31 March is 30 April", () => {
      expect(nextCallDateString("monthly", new Date("2026-03-31T09:00:00"))).toBe("2026-04-30");
    });

    it("a day that exists in both months is untouched", () => {
      expect(nextCallDateString("monthly", new Date("2026-03-15T09:00:00"))).toBe("2026-04-15");
    });

    it("December rolls the year over", () => {
      expect(nextCallDateString("monthly", new Date("2026-12-31T09:00:00"))).toBe("2027-01-31");
    });
  });

  describe("quarterly is three calendar months, clamped the same way", () => {
    it("30 November is 28 February", () => {
      expect(nextCallDateString("quarterly", new Date("2026-11-30T09:00:00"))).toBe("2027-02-28");
    });

    it("15 January is 15 April", () => {
      expect(nextCallDateString("quarterly", new Date("2026-01-15T09:00:00"))).toBe("2026-04-15");
    });
  });

  describe("an unknown frequency is monthly", () => {
    it.each(["", "fortnightly", "every other Tuesday"])("%o is treated as monthly", (frequency) => {
      expect(nextCallDateString(frequency, new Date("2026-01-31T09:00:00"))).toBe("2026-02-28");
    });
  });

  /**
   * Both previous copies serialised with `toISOString().split("T")[0]`, which converts to UTC
   * first. Spain is UTC+1 (+2 in summer), so a call scheduled just after midnight came out as the
   * PREVIOUS day — the record said one date and the staff member had chosen another.
   */
  it("uses the local date, so a call just after midnight is not written as yesterday", () => {
    const justAfterMidnightInSpain = new Date("2026-03-15T00:30:00");
    expect(nextCallDateString("monthly", justAfterMidnightInSpain)).toBe("2026-04-15");
  });

  it("keeps the time of day, so a caller may schedule from an exact moment", () => {
    const next = calculateNextCallDate("monthly", new Date("2026-01-31T14:25:00"));
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(25);
  });

  it("does not mutate the date it was given", () => {
    const base = new Date("2026-01-31T09:00:00");
    calculateNextCallDate("monthly", base);
    expect(base.toISOString()).toBe(new Date("2026-01-31T09:00:00").toISOString());
  });
});

describe("there is exactly one implementation", () => {
  /**
   * THE SHAPE, not the name. The two copies were called the same thing this time, but the next
   * one will be `nextDue` or `bumpCallDate` in whichever file needs it. What gives it away is
   * month arithmetic in a file that also knows about the courtesy frequency — you cannot compute
   * a next-call date without reading `courtesy_call_frequency`, and you cannot get the month
   * right without `setMonth` or `addMonths`. Exactly one file may hold both.
   */
  const filesThatKnowTheFrequency = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          // `test` is skipped for the same reason the phone sweep skips it: this very file names
          // both markers, so it would report itself for ever.
          if (name === "node_modules" || name === "test" || name === ".git") continue;
          walk(p);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        const rel = path.relative(process.cwd(), p).replace(/\\/g, "/");
        if (readFileSync(p, "utf8").includes("courtesy_call_frequency")) found.push(rel);
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    walk(path.resolve(process.cwd(), "supabase/functions"));
    return found.sort();
  };

  it("the sweep is looking at files at all", () => {
    // It found the generator, the member's record card and the generated DB types before this
    // change; an empty sweep would pass the assertion below for ever.
    expect(filesThatKnowTheFrequency().length).toBeGreaterThan(1);
  });

  it("nobody computes a next-call date outside the shared rule", () => {
    const offenders = filesThatKnowTheFrequency().filter((rel) => {
      if (rel === SHARED_RULE) return false;
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8");
      return /\.setMonth\(|\baddMonths\(/.test(source);
    });
    expect(
      offenders,
      `these do their own month arithmetic instead of calling calculateNextCallDate: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the shared rule is the file that actually does the arithmetic", () => {
    expect(readFileSync(path.resolve(process.cwd(), SHARED_RULE), "utf8")).toContain(".setMonth(");
  });
});
