/**
 * Rota helpers: the long-day classification, and the CSV export that has to line up with the
 * spreadsheet.
 *
 * Pure functions, no Supabase, no React — so the shapes that matter (which day counts as a long
 * day, what the export looks like) are unit-testable against the real 2026 data rather than
 * eyeballed on a screen. See ROTA_MODEL.md.
 */
import type { ShiftType } from "@/config/shifts";

export interface RotaShift {
  shift_date: string;
  shift_type: ShiftType;
  staff_id: string;
  notes?: string | null;
  staff?: { first_name: string; last_name: string } | null;
}

/* ────────────────────────────── long days ────────────────────────────── */

/**
 * Two shifts on one date are not one risk, they are two.
 *
 * ROTA_MODEL.md §2-A: over 2026 Travis has 30 afternoon+night dates, 24 morning+night, and 2
 * where he works all three. The brief flagged only the 30. They are genuinely different:
 *
 *   afternoon + night  15:00 -> 07:00   SIXTEEN HOURS CONTINUOUS, no break
 *   morning   + night  07:00 -> 15:00, then 23:00 -> 07:00. Also 16 hours, but with 8 off in
 *                      the middle — tiring, not the same as never going home
 *   all three          07:00 -> 07:00   TWENTY-FOUR HOURS CONTINUOUS
 *
 * Presenting them with one badge would tell an admin that a double shift is a double shift, and
 * the whole point is that one of these shapes is much worse than another.
 */
export type LongDayShape = "continuous-16h" | "split-16h" | "continuous-24h";

export interface LongDay {
  date: string;
  staffId: string;
  shape: LongDayShape;
  /** Hours actually on shift across the calendar day's shifts. */
  hours: number;
}

const HOURS_PER_SHIFT = 8;

/**
 * Every (date, person) in `shifts` that carries more than one shift, classified.
 *
 * Deliberately NOT "every date Travis is doubled": the rule is about a person working two
 * shifts, and hardcoding who that person is would break the day somebody covers for him.
 */
export function findLongDays(shifts: RotaShift[]): LongDay[] {
  const byDayAndPerson = new Map<string, Set<ShiftType>>();

  for (const s of shifts) {
    const key = `${s.shift_date}|${s.staff_id}`;
    const set = byDayAndPerson.get(key) ?? new Set<ShiftType>();
    set.add(s.shift_type);
    byDayAndPerson.set(key, set);
  }

  const out: LongDay[] = [];
  for (const [key, types] of byDayAndPerson) {
    if (types.size < 2) continue;
    const [date, staffId] = key.split("|");
    const hours = types.size * HOURS_PER_SHIFT;

    let shape: LongDayShape;
    if (types.size === 3) {
      shape = "continuous-24h";
    } else if (types.has("afternoon") && types.has("night")) {
      shape = "continuous-16h";
    } else {
      // morning+night (the 8-hour gap), or the theoretically-possible morning+afternoon, which
      // is also continuous but only 16h and has never occurred in the sheet.
      shape = types.has("morning") && types.has("afternoon") ? "continuous-16h" : "split-16h";
    }
    out.push({ date, staffId, shape, hours });
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** True when this (date, person) works more than the 12 hours the brief asked us to warn about. */
export function exceedsTwelveHours(day: LongDay): boolean {
  return day.hours > 12;
}

/* ────────────────────────────── CSV export ───────────────────────────── */

export interface RotaHoliday {
  staff_id: string;
  start_date: string;
  end_date: string;
}

export interface RotaCover {
  shift_id: string;
  original_staff_id: string;
  holiday_id: string | null;
}

export interface RotaExportInput {
  from: string;
  to: string;
  shifts: (RotaShift & { id: string })[];
  holidays: RotaHoliday[];
  covers: RotaCover[];
  bankHolidays: string[];
  /** staff_id -> first name, for the person columns. */
  names: Record<string, string>;
}

/** ISO date -> the three-letter weekday the sheet uses. */
function weekday(iso: string): string {
  // Noon avoids the DST edge where a midnight UTC date reads as the previous day locally.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = new Date(`${from}T12:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function csvCell(value: string): string {
  // The sheet's notes contain commas and the odd quote. Quote whenever it could otherwise
  // change the column count, and double any embedded quote — the two ways a CSV export silently
  // corrupts the file it is meant to be compared against.
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The rota as CSV, in the SAME column order as docs/rota/rota_2026_clean.csv, so Lee can diff
 * an export against the spreadsheet directly.
 *
 * The per-person holiday columns are DERIVED, not hardcoded: one column per person who has a
 * holiday row inside the exported range, ordered by first name. For 2026-09-10..12-31 that
 * produces exactly `albert_holiday`, `carmen_holiday`, `mary_holiday` as the sheet has them —
 * and if Travis ever books a day off, a `travis_holiday` column appears rather than the day
 * vanishing from the export. Hardcoding three first names would have been the per-entity
 * one-off code CLAUDE.md forbids, and would have quietly dropped a fourth person's holiday.
 */
export function rotaToCsv(input: RotaExportInput): string {
  const { from, to, shifts, holidays, covers, bankHolidays, names } = input;

  const coverByShift = new Map(covers.map((c) => [c.shift_id, c]));
  const banks = new Set(bankHolidays);

  const holidayPeople = [...new Set(holidays.map((h) => h.staff_id))].sort((a, b) =>
    (names[a] ?? a).localeCompare(names[b] ?? b),
  );

  const header = [
    "date",
    "weekday",
    "morning",
    "morning_covering",
    "afternoon",
    "afternoon_covering",
    "night",
    "off",
    ...holidayPeople.map((id) => `${(names[id] ?? id).toLowerCase()}_holiday`),
    "bank_holiday",
    "note",
  ];

  const onHoliday = (staffId: string, date: string) =>
    holidays.some((h) => h.staff_id === staffId && date >= h.start_date && date <= h.end_date);

  // Everyone who appears in a cycle slot anywhere in the range — the candidates for "off".
  const cycleStaff = new Set(
    shifts.filter((s) => s.shift_type !== "night").map((s) => s.staff_id),
  );

  const rows = eachDate(from, to).map((date) => {
    const onDate = shifts.filter((s) => s.shift_date === date);
    const slot = (type: ShiftType) => onDate.find((s) => s.shift_type === type);

    const cell = (type: ShiftType): [string, string] => {
      const s = slot(type);
      if (!s) return ["", ""];
      const worked = names[s.staff_id] ?? "";
      const cover = coverByShift.get(s.id);
      if (!cover) return [worked, ""];
      const original = names[cover.original_staff_id] ?? "";
      // The sheet writes "(moved)" where the person vacated their own shift rather than being
      // absent — the two rows ROTA_MODEL.md §2-B is about. holiday_id NULL is exactly that case.
      return [worked, cover.holiday_id ? original : `${original} (moved)`];
    };

    const [morning, morningCovering] = cell("morning");
    const [afternoon, afternoonCovering] = cell("afternoon");
    const [night] = cell("night");

    // `off` is the person whose CYCLE POSITION is off today, which is not the same as
    // "everybody who is not working", and not the same as "everybody not on holiday" either.
    // Both simpler rules were wrong against the sheet:
    //
    //   2026-09-10  Mary is on holiday and Carmen covers her morning. Not-working is
    //               {Albert, Mary}; the sheet's `off` is Albert alone.
    //   2026-09-16  Albert is on holiday on a day the cycle already had him OFF. The sheet's
    //               `off` is Albert — so excluding everyone on holiday drops him wrongly
    //               (ROTA_MODEL.md §2-B: a holiday day is not always an uncovered shift).
    //
    // The distinction the sheet actually draws is whether the absence was COVERED. So: off is
    // the cycle people who are neither working nor had a shift taken off them today.
    const working = new Set(onDate.map((s) => s.staff_id));
    const coveredAway = new Set(
      onDate.map((s) => coverByShift.get(s.id)?.original_staff_id).filter(Boolean) as string[],
    );
    const off = [...cycleStaff]
      .filter((id) => !working.has(id) && !coveredAway.has(id))
      .map((id) => names[id] ?? "")
      .sort()
      .join(" / ");

    const note = onDate.find((s) => s.notes)?.notes ?? "";

    return [
      date,
      weekday(date),
      morning,
      morningCovering,
      afternoon,
      afternoonCovering,
      night,
      off,
      ...holidayPeople.map((id) => (onHoliday(id, date) ? "True" : "False")),
      banks.has(date) ? "True" : "False",
      note,
    ].map(csvCell);
  });

  // CRLF, deliberately. docs/rota/rota_2026_clean.csv is CRLF, and this export exists so Lee
  // can diff it against that file — a LF export would differ on every single line. It is also
  // what Excel expects, which is where this file gets opened.
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n";
}
