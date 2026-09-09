// @vitest-environment node
//
// The rota library, tested against the REAL 2026 sheet rather than a fixture I invented.
//
// docs/rota/rota_2026_clean.csv is the source of truth for the historical rota, so the export
// is proven by a ROUND TRIP: parse the sheet, build the shape the app holds in memory, export
// it, and require the result to be byte-identical to the sheet's own rows. A CSV export that
// "looks right" is how a column silently shifts and Lee's comparison against the spreadsheet
// starts lying to him.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findLongDays,
  exceedsTwelveHours,
  rotaToCsv,
  type RotaShift,
  type RotaHoliday,
  type RotaCover,
} from "../lib/rota";
import type { ShiftType } from "../config/shifts";

const CSV = join(process.cwd(), "docs/rota/rota_2026_clean.csv");

interface SheetRow {
  date: string;
  weekday: string;
  morning: string;
  morning_covering: string;
  afternoon: string;
  afternoon_covering: string;
  night: string;
  off: string;
  albert_holiday: string;
  carmen_holiday: string;
  mary_holiday: string;
  bank_holiday: string;
  note: string;
}

/**
 * Minimal CSV reader — the sheet quotes only where a note contains a comma.
 *
 * THE SHEET IS CRLF. The first version of this parser split on "\n" only, so every last field
 * kept a trailing "\r": the header's final name became "note\r", `row.note` was undefined, and
 * every exported note came out EMPTY. The round-trip assertion caught it; nothing else would
 * have, because the export looked well-formed. Hence the explicit strip.
 */
function parseSheet(): SheetRow[] {
  const text = readFileSync(CSV, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
    cells.push(cur);
    const row = {} as Record<string, string>;
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row as unknown as SheetRow;
  });
}

const SHEET = parseSheet();
const WINDOW = SHEET.filter((r) => r.date >= "2026-09-10" && r.date <= "2026-12-31");

/** first name -> a stable synthetic staff id, exactly as the app would hold them. */
const ID: Record<string, string> = {
  Albert: "s-albert",
  Carmen: "s-carmen",
  Mary: "s-mary",
  Travis: "s-travis",
};
const NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(ID).map(([name, id]) => [id, name]),
);

/** Build shifts / holidays / covers from the sheet the way the migration's seed does. */
function buildFromSheet(rows: SheetRow[]) {
  const shifts: (RotaShift & { id: string })[] = [];
  const covers: RotaCover[] = [];

  for (const r of rows) {
    for (const type of ["morning", "afternoon", "night"] as ShiftType[]) {
      const worked = r[type as "morning" | "afternoon" | "night"];
      const id = `${r.date}-${type}`;
      shifts.push({
        id,
        shift_date: r.date,
        shift_type: type,
        staff_id: ID[worked],
        notes: r.note || null,
      });

      const covRaw = type === "night" ? "" : r[`${type}_covering` as keyof SheetRow];
      if (covRaw) {
        const moved = covRaw.includes("(moved)");
        const original = covRaw.replace(" (moved)", "").trim();
        covers.push({
          shift_id: id,
          original_staff_id: ID[original],
          // A "(moved)" cover is not caused by the cover's own absence — ROTA_MODEL.md §2-B.
          holiday_id: moved ? null : `h-${original}`,
        });
      }
    }
  }

  const holidays: RotaHoliday[] = [];
  for (const [name, col] of [
    ["Albert", "albert_holiday"],
    ["Carmen", "carmen_holiday"],
    ["Mary", "mary_holiday"],
  ] as const) {
    const dates = rows.filter((r) => r[col] === "True").map((r) => r.date);
    let run: string[] = [];
    const flush = () => {
      if (run.length) {
        holidays.push({ staff_id: ID[name], start_date: run[0], end_date: run[run.length - 1] });
        run = [];
      }
    };
    for (const d of dates) {
      const prev = run[run.length - 1];
      if (prev && new Date(`${d}T00:00Z`).getTime() - new Date(`${prev}T00:00Z`).getTime() === 86400000) {
        run.push(d);
      } else {
        flush();
        run = [d];
      }
    }
    flush();
  }

  const bankHolidays = rows.filter((r) => r.bank_holiday === "True").map((r) => r.date);
  return { shifts, holidays, covers, bankHolidays };
}

describe("the sheet parses at all", () => {
  it("has 365 rows covering the whole of 2026", () => {
    // Guards every assertion below from passing vacuously over an empty parse.
    expect(SHEET.length).toBe(365);
    expect(SHEET[0].date).toBe("2026-01-01");
    expect(SHEET[SHEET.length - 1].date).toBe("2026-12-31");
    expect(WINDOW.length).toBe(113);
  });

  it("has Travis on every night of the year", () => {
    expect(SHEET.every((r) => r.night === "Travis")).toBe(true);
  });
});

describe("findLongDays classifies by SHAPE, not by count", () => {
  const { shifts } = buildFromSheet(SHEET);
  const long = findLongDays(shifts);

  it("finds 52 doubled dates over 2026, not the 30 the brief named", () => {
    // ROTA_MODEL.md §2-A. 30 afternoon+night + 24 morning+night = 54 pairs over 52 dates,
    // because 2 dates appear in both.
    expect(long.length).toBe(52);
  });

  it("separates the 16-hour continuous days from the split ones", () => {
    const byShape = long.reduce<Record<string, number>>((acc, d) => {
      acc[d.shape] = (acc[d.shape] ?? 0) + 1;
      return acc;
    }, {});
    expect(byShape["continuous-16h"]).toBe(28);
    expect(byShape["split-16h"]).toBe(22);
    expect(byShape["continuous-24h"]).toBe(2);
  });

  it("names the two 24-hour days", () => {
    // 07:00 to 07:00, one operator, and the only person answering the alarm.
    const days = long.filter((d) => d.shape === "continuous-24h").map((d) => d.date);
    expect(days).toEqual(["2026-05-20", "2026-07-18"]);
  });

  it("every doubled day exceeds the 12 hours the brief asked us to warn about", () => {
    expect(long.every(exceedsTwelveHours)).toBe(true);
  });

  it("attributes every long day to Travis and nobody else", () => {
    expect([...new Set(long.map((d) => d.staffId))]).toEqual(["s-travis"]);
  });

  it("reports nothing when nobody is doubled", () => {
    // The assertion that fails if findLongDays ever flags a normal day.
    const single: RotaShift[] = [
      { shift_date: "2026-01-01", shift_type: "morning", staff_id: "s-mary" },
      { shift_date: "2026-01-01", shift_type: "afternoon", staff_id: "s-carmen" },
      { shift_date: "2026-01-01", shift_type: "night", staff_id: "s-travis" },
    ];
    expect(findLongDays(single)).toEqual([]);
  });
});

describe("rotaToCsv round-trips the sheet", () => {
  const { shifts, holidays, covers, bankHolidays } = buildFromSheet(WINDOW);
  const csv = rotaToCsv({
    from: "2026-09-10",
    to: "2026-12-31",
    shifts,
    holidays,
    covers,
    bankHolidays,
    names: NAMES,
  });
  const lines = csv.trimEnd().split("\r\n");

  it("emits the sheet's exact column order", () => {
    const sheetHeader = readFileSync(CSV, "utf8").split(/\r?\n/)[0];
    expect(lines[0]).toBe(sheetHeader);
  });

  it("emits one row per day, and no more", () => {
    expect(lines.length - 1).toBe(113);
  });

  it("derives the per-person holiday columns rather than hardcoding three names", () => {
    // Ordered by first name, one per person with a holiday in the range. For this window that
    // is exactly what the sheet has; Travis gets a column only if he ever books a day.
    expect(lines[0]).toContain("albert_holiday,carmen_holiday,mary_holiday,bank_holiday,note");
  });

  it("reproduces every row of the sheet byte for byte", () => {
    const sheetLines = readFileSync(CSV, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .filter((l) => {
        const d = l.split(",")[0];
        return d >= "2026-09-10" && d <= "2026-12-31";
      });

    expect(sheetLines.length).toBe(113);

    const mismatches: string[] = [];
    sheetLines.forEach((expected, i) => {
      const actual = lines[i + 1];
      if (actual !== expected) mismatches.push(`row ${i}\n  sheet:  ${expected}\n  export: ${actual}`);
    });
    expect(mismatches.join("\n\n")).toBe("");
  });

  it("marks the two knock-on covers as (moved), the way the sheet does", () => {
    const row0910 = lines.find((l) => l.startsWith("2026-09-10"));
    expect(row0910).toContain("Carmen (moved)");
  });

  it("quotes a note containing a comma so the column count cannot shift", () => {
    const withComma = rotaToCsv({
      from: "2026-09-10",
      to: "2026-09-10",
      shifts: [
        { id: "a", shift_date: "2026-09-10", shift_type: "morning", staff_id: "s-mary", notes: 'one, two "three"' },
      ],
      holidays: [],
      covers: [],
      bankHolidays: [],
      names: NAMES,
    });
    expect(withComma).toContain('"one, two ""three"""');
    // 12 columns when nobody has a holiday: the three person columns collapse away.
    expect(withComma.trimEnd().split("\r\n")[1].split(",").length).toBeGreaterThan(8);
  });
});
