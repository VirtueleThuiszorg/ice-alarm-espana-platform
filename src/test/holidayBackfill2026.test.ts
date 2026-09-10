// @vitest-environment node
//
// The 2026 holiday backfill, checked against the sheet it claims to come from.
//
// WHAT THIS CAN AND CANNOT PROVE. It reads the migration's SQL and re-derives every range from
// docs/rota/rota_2026_clean.csv, so a mistyped date, a dropped range or an off-by-one on a
// boundary fails here. It does NOT execute the SQL — there is no Postgres in this suite — so the
// runtime behaviour (idempotence, the reviewer lookup, the assertion firing) is proven two other
// ways: the structural guards are asserted below by reading the statements, and the migration
// carries its OWN assertion that raises on production if the imported days do not come to
// 12/19/14. A migration that lies about what it imported cannot commit.
//
// WHY THE CSV IS THE SOURCE OF TRUTH. The sheet is what Lee reconciles against, and the
// September import (20260909120000) already derives its own rows from the same file. Hand-copying
// nineteen dates into SQL is exactly the step where a day goes missing, and the person it goes
// missing from is the one told in December that they have days they do not.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260910120000_holidays_2026_backfill_before_cut.sql";
const SEED = "supabase/migrations/20260909120000_rota_2026_seed_and_generator.sql";
const CSV = "docs/rota/rota_2026_clean.csv";

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** The date the rota import starts. Everything before it is this migration's business. */
const CUT = "2026-09-10";

/** Entitlement: 30 días naturales a year, ET art. 38. */
const ENTITLEMENT = 30;

const EMAIL_BY_COLUMN: Record<string, string> = {
  albert_holiday: "asoares@icealarm.es",
  carmen_holiday: "cnicolas@icealarm.es",
  mary_holiday: "mbonner@icealarm.es",
};

interface Range {
  email: string;
  start: string;
  end: string;
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

const days = (r: Range) => dayNumber(r.end) - dayNumber(r.start) + 1;

/** The sheet, as rows of column -> value. */
function csvRows(): Array<Record<string, string>> {
  const lines = read(CSV).trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    // No quoted commas in the columns this test reads; the note column is last and unused here.
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

/** Consecutive true-days collapsed into inclusive ranges, per person, before the cut. */
function expectedRanges(): Range[] {
  const rows = csvRows();
  const out: Range[] = [];
  for (const [column, email] of Object.entries(EMAIL_BY_COLUMN)) {
    const marked = rows
      .filter((r) => r[column].toLowerCase() === "true" && r.date < CUT)
      .map((r) => r.date)
      .sort();
    for (const date of marked) {
      const last = out[out.length - 1];
      if (last && last.email === email && dayNumber(date) - dayNumber(last.end) === 1) {
        last.end = date;
      } else {
        out.push({ email, start: date, end: date });
      }
    }
  }
  return out.sort((a, b) => a.email.localeCompare(b.email) || a.start.localeCompare(b.start));
}

/** The `(email, start, end)` tuples the migration actually inserts. */
function migrationRanges(): Range[] {
  const sql = read(MIGRATION);
  const block = sql.slice(sql.indexOf("INSERT INTO _hol_backfill"));
  const stop = block.indexOf(";");
  return [
    ...block
      .slice(0, stop)
      .matchAll(/\('([^']+)',\s*'(\d{4}-\d{2}-\d{2})'::date,\s*'(\d{4}-\d{2}-\d{2})'::date\)/g),
  ]
    .map((m) => ({ email: m[1], start: m[2], end: m[3] }))
    .sort((a, b) => a.email.localeCompare(b.email) || a.start.localeCompare(b.start));
}

/** The ranges the SEPTEMBER import already put in, so the year can be totalled. */
function seededRanges(): Range[] {
  const sql = read(SEED);
  const block = sql.slice(sql.indexOf("INSERT INTO _rota_holiday_seed"));
  const stop = block.indexOf(";");
  return [
    ...block
      .slice(0, stop)
      .matchAll(/\('([^']+)',\s*'(\d{4}-\d{2}-\d{2})'::date,\s*'(\d{4}-\d{2}-\d{2})'::date/g),
  ].map((m) => ({ email: m[1], start: m[2], end: m[3] }));
}

const totalByEmail = (ranges: Range[]) => {
  const out: Record<string, number> = {};
  for (const r of ranges) out[r.email] = (out[r.email] ?? 0) + days(r);
  return out;
};

describe("the ranges come from the sheet, not from a hand-copied list", () => {
  const expected = expectedRanges();
  const actual = migrationRanges();

  it("parses both sides at all", () => {
    // Guards every assertion below: a rename of `_hol_backfill` or of a CSV column would
    // otherwise compare two empty lists and pass.
    expect(expected.length).toBeGreaterThan(0);
    expect(actual.length).toBeGreaterThan(0);
  });

  it("imports exactly the pre-cut ranges the CSV holds", () => {
    expect(actual).toEqual(expected);
  });

  it("imports nothing on or after 2026-09-10 — that window is the rota seed's", () => {
    // Two migrations inserting the same absence would double-count the days against a balance.
    for (const r of actual) {
      expect(r.start < CUT, `${r.email} ${r.start}`).toBe(true);
      expect(r.end < CUT, `${r.email} ${r.end}`).toBe(true);
    }
  });

  it("comes to the 12 / 19 / 14 days the migration asserts on production", () => {
    expect(totalByEmail(actual)).toEqual({
      "asoares@icealarm.es": 12,
      "cnicolas@icealarm.es": 19,
      "mbonner@icealarm.es": 14,
    });
    // And the migration's own assertion pins the same three numbers, so the SQL cannot drift
    // from this test without one of the two going red.
    const sql = read(MIGRATION);
    expect(sql).toMatch(/\('asoares@icealarm\.es',\s*12\)/);
    expect(sql).toMatch(/\('cnicolas@icealarm\.es',\s*19\)/);
    expect(sql).toMatch(/\('mbonner@icealarm\.es',\s*14\)/);
  });

  it("does not overlap the ranges the September import already inserted", () => {
    // Ranges, not days: two rows that overlap by one day would each count that day.
    for (const a of actual) {
      for (const b of seededRanges().filter((s) => s.email === a.email)) {
        const overlaps = a.start <= b.end && b.start <= a.end;
        expect(overlaps, `${a.email}: ${a.start}..${a.end} overlaps ${b.start}..${b.end}`).toBe(
          false,
        );
      }
    }
  });
});

describe("the balances this produces are the ones Lee gave", () => {
  const year = totalByEmail([...migrationRanges(), ...seededRanges()]);

  it("Mary 18 used, Carmen 28, Albert 16 — the sheet's whole-year totals", () => {
    expect(year["mbonner@icealarm.es"]).toBe(18);
    expect(year["cnicolas@icealarm.es"]).toBe(28);
    expect(year["asoares@icealarm.es"]).toBe(16);
  });

  it("leaving 12 / 2 / 14 against a 30-day entitlement", () => {
    expect(ENTITLEMENT - year["mbonner@icealarm.es"]).toBe(12);
    expect(ENTITLEMENT - year["cnicolas@icealarm.es"]).toBe(2);
    expect(ENTITLEMENT - year["asoares@icealarm.es"]).toBe(14);
  });

  it("counts días naturales, so a range spanning a weekend counts the weekend", () => {
    // ET art. 38 is calendar days. Carmen's 17–25 May is nine days including two weekends, not
    // five working ones — the difference across the year is what makes 28 rather than 20.
    const may = migrationRanges().find((r) => r.start === "2026-05-17");
    expect(may).toBeTruthy();
    expect(days(may!)).toBe(9);
    // `total_days` is a GENERATED column (end − start + 1), so the migration must not insert it.
    const sql = read(MIGRATION);
    const insert = sql.slice(sql.indexOf("INSERT INTO public.staff_holidays"));
    expect(insert.slice(0, insert.indexOf(";"))).not.toContain("total_days");
  });
});

describe("running it twice changes nothing", () => {
  const sql = read(MIGRATION);

  it("guards the holiday insert on the person and the exact range", () => {
    const insert = sql.slice(sql.indexOf("INSERT INTO public.staff_holidays"));
    const stmt = insert.slice(0, insert.indexOf(";"));
    expect(stmt).toContain("NOT EXISTS");
    expect(stmt).toContain("ex.staff_id = s.id");
    expect(stmt).toContain("ex.start_date = h.start_date");
    expect(stmt).toContain("ex.end_date = h.end_date");
  });

  it("only writes an entitlement that is not already 30", () => {
    const update = sql.slice(sql.indexOf("UPDATE public.staff s"));
    expect(update.slice(0, update.indexOf(";"))).toMatch(/annual_holiday_days,\s*0\)\s*<>\s*30/);
  });

  it("only writes an audit row for somebody who does not already have one", () => {
    const audit = sql.slice(sql.indexOf("INSERT INTO public.activity_logs"));
    const stmt = audit.slice(0, audit.indexOf(";"));
    expect(stmt).toContain("NOT EXISTS");
    expect(stmt).toContain("al.action = 'holiday_backfill_2026'");
  });
});

describe("what the migration must not do", () => {
  const sql = read(MIGRATION);

  it("names no human, resolving the reviewer by role instead", () => {
    // CLAUDE.md forbids per-entity one-off code, and an address in a migration rots.
    expect(sql).toMatch(/role = 'super_admin'/);
    expect(sql).not.toMatch(/lwakeman@|reviewed_by = '[0-9a-f]{8}-/);
  });

  it("marks every imported row as imported, so it is never mistaken for a request", () => {
    expect(sql).toContain("'imported from 2026 rota sheet'");
    expect(sql).toMatch(/'imported from 2026 rota sheet',\s*'approved'/);
  });

  it("offers no pay-out of any kind — days are taken, never paid instead", () => {
    // Lee's ruling. Checked against the STATEMENTS, not the prose: the header comment says the
    // rule out loud, and a test that forbade the words would forbid saying so.
    const statements = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(statements).not.toMatch(/pay[_ -]?out|payout|compensat|in_lieu/);
  });

  it("does not touch the shifts or the covers", () => {
    // The rota seed owns those. Inventing a cover for an absence from March would be inventing
    // history that nobody worked.
    expect(sql).not.toMatch(/INSERT INTO public\.staff_shifts/);
    expect(sql).not.toMatch(/INSERT INTO public\.staff_shift_covers/);
    expect(sql).not.toMatch(/UPDATE public\.staff_shifts/);
  });

  it("no-ops instead of failing where the operator rows do not exist", () => {
    // CI applies migrations to a database with no staff, and that is not an error.
    expect(sql).toMatch(/IF v_known = 0 THEN/);
    expect(sql).toMatch(/no matching staff rows/);
  });

  it("says how to undo it", () => {
    expect(sql).toMatch(/DELETE FROM public\.staff_holidays WHERE reason = 'imported from 2026 rota sheet'/);
  });
});
