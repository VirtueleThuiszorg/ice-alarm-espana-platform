/**
 * The arithmetic behind "My shifts": how many hours, grouped how, and which shift a moment in
 * time belongs to.
 *
 * Pure and separate from the page on purpose. Every number an operator reads on that screen is
 * something they may be paid on or plan childcare around, so each one is worth a test of its own
 * rather than an assertion about a rendered string — and the same maths is wanted twice, once for
 * "upcoming" and once for "hours in September".
 *
 * HOURS COME FROM `SHIFT_BOUNDS`, the same constant `sos-escalation-runner` and
 * `staff-shift-monitor` use to decide which shift is current (supabase/functions/_shared/
 * shift-time.ts, imported read-only — that module is not this change's to edit). A second copy
 * of "a morning is 07:00–15:00" living on the client is how the two ended up disagreeing about
 * shift boundaries in the first place.
 */

import {
  SHIFT_BOUNDS,
  getShiftContext,
  type ShiftType,
} from "../../supabase/functions/_shared/shift-time";

/** The shifts this file can reason about: what an operator's own `staff_shifts` rows carry. */
export interface ShiftLike {
  id?: string;
  shift_date: string;
  shift_type: ShiftType;
  start_time?: string | null;
  end_time?: string | null;
}

/** Canonical length of a shift type, in hours. The night shift wraps midnight. */
export function shiftHours(shiftType: ShiftType): number {
  const b = SHIFT_BOUNDS[shiftType];
  return b.end > b.start ? b.end - b.start : 24 - b.start + b.end;
}

/** Canonical hours across a set of shifts. */
export function totalHours(shifts: ShiftLike[]): number {
  return shifts.reduce((sum, s) => sum + shiftHours(s.shift_type), 0);
}

/**
 * The hours a ROW claims, from its own `start_time`/`end_time`, or null if it does not say.
 *
 * Kept beside `shiftHours` rather than replacing it: the canonical figure is the one the rota is
 * built and monitored on, but a hand-edited row can carry times that disagree with it, and
 * reporting a four-hour shift as eight hours is a payroll error rather than a display quirk.
 * `hoursDisagree` is what the page uses to say so out loud.
 */
export function rowHours(shift: ShiftLike): number | null {
  const parse = (t?: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
    return m ? Number(m[1]) + Number(m[2]) / 60 : null;
  };
  const start = parse(shift.start_time);
  const end = parse(shift.end_time);
  if (start === null || end === null) return null;
  return end > start ? end - start : 24 - start + end;
}

/** Does this row's own start/end disagree with the canonical length of its shift type? */
export function hoursDisagree(shift: ShiftLike): boolean {
  const actual = rowHours(shift);
  return actual !== null && Math.abs(actual - shiftHours(shift.shift_type)) > 1 / 60;
}

/** `2026-09-10` → `2026-09`. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/**
 * The Monday of the ISO week containing `isoDate`, as `YYYY-MM-DD`.
 *
 * Computed in UTC from the date parts, never from `new Date(isoDate)` in local time: the rota is
 * keyed on calendar dates, and a browser west of Greenwich parses a bare `YYYY-MM-DD` as the
 * previous evening, which moves Monday.
 */
export function weekStart(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const dow = at.getUTCDay(); // 0 = Sunday
  at.setUTCDate(at.getUTCDate() - ((dow + 6) % 7));
  return at.toISOString().slice(0, 10);
}

export interface ShiftGroup<T extends ShiftLike> {
  /** `YYYY-MM` for months, the Monday's `YYYY-MM-DD` for weeks. */
  key: string;
  shifts: T[];
  /** Canonical hours in this group. */
  hours: number;
}

function groupBy<T extends ShiftLike>(shifts: T[], keyOf: (s: T) => string): Array<ShiftGroup<T>> {
  const byKey = new Map<string, T[]>();
  for (const s of [...shifts].sort((a, b) => a.shift_date.localeCompare(b.shift_date))) {
    const k = keyOf(s);
    const bucket = byKey.get(k);
    if (bucket) bucket.push(s);
    else byKey.set(k, [s]);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({ key, shifts: group, hours: totalHours(group) }));
}

/** Shifts grouped by calendar month, oldest first. */
export function groupByMonth<T extends ShiftLike>(shifts: T[]): Array<ShiftGroup<T>> {
  return groupBy(shifts, (s) => monthKey(s.shift_date));
}

/** Shifts grouped by ISO week (Monday), oldest first. */
export function groupByWeek<T extends ShiftLike>(shifts: T[]): Array<ShiftGroup<T>> {
  return groupBy(shifts, (s) => weekStart(s.shift_date));
}

/** `2026-09-10` + `night` → `2026-09-10-night`. One key for a shift, used to match evidence to it. */
export function shiftKey(shiftDate: string, shiftType: ShiftType): string {
  return `${shiftDate}-${shiftType}`;
}

/**
 * Which shift a TIMESTAMP falls in, as a `shiftKey`.
 *
 * Uses `getShiftContext` — the same function `sos-escalation-runner` and `staff-shift-monitor`
 * call — so a handover note written at 01:00 is attributed to the night shift that began at 23:00
 * the day BEFORE, exactly as the escalation ladder would attribute an alert at that moment. A
 * local `getHours()` here would put it on the wrong day for eight hours out of twenty-four, and
 * would drift from the runners at every DST change.
 *
 * Returns null for a timestamp that cannot be read, so an unparseable row is never silently
 * attributed to some shift.
 */
export function shiftKeyOfTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const ctx = getShiftContext(ms);
  return shiftKey(ctx.shiftDate, ctx.shiftType);
}
