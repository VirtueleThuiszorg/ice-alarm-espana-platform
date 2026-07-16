/**
 * shift-time.ts — ONE source of truth for shift-of-day math, timezone-correct.
 *
 * HAZARD 2 fix (SOS_ESCALATION_SPEC.md §c item 3): `sos-escalation-runner` previously
 * derived the shift from `getUTCHours()` while `staff-shift-monitor` used Europe/Madrid.
 * Around shift boundaries they disagreed on which `shift_escalation_chain` row was "current",
 * so level-2/3 callouts could target the wrong shift's staff. Both now import this helper, so
 * their shift math is identical and DST-correct (CET ↔ CEST handled by the IANA zone via Intl).
 *
 * Pure module: uses only Web-standard `Intl` — no Deno or Node APIs — so it is importable by
 * both the edge runtime (Deno) and the vitest suite (see src/test/shiftTime.test.ts).
 */

export type ShiftType = "morning" | "afternoon" | "night";

export const DEFAULT_TZ = "Europe/Madrid";

/** Local shift windows (hour-of-day in the target timezone). */
export const SHIFT_BOUNDS: Record<ShiftType, { start: number; end: number }> = {
  morning: { start: 7, end: 15 },
  afternoon: { start: 15, end: 23 },
  night: { start: 23, end: 7 }, // wraps midnight
};

export interface ShiftContext {
  /** Which shift the instant falls in, in the target timezone. */
  shiftType: ShiftType;
  /**
   * The calendar date (YYYY-MM-DD) the shift is keyed on. For the night shift after midnight
   * (local hour < 7) this is the PREVIOUS day, matching how shift_escalation_chain rows are keyed.
   */
  shiftDate: string;
  /** Local hour (0–23) in the target timezone. */
  hour: number;
  /** Local minute (0–59) in the target timezone. */
  minute: number;
  /** Minutes elapsed since the current shift started (>= 0). */
  minutesSinceShiftStart: number;
}

interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number; // 0–59
}

/** Break a UTC-instant (ms since epoch) into local wall-clock parts for `tz`, DST-correct. */
function localParts(nowMs: number, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // 00–23, never "24" — avoids the midnight edge case of hour12:false
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Pure calendar date arithmetic on Y/M/D, anchored at UTC noon to sidestep any DST drift. */
function shiftDateString(p: LocalParts, subtractOneDay: boolean): string {
  let anchor = Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0);
  if (subtractOneDay) anchor -= 86_400_000;
  const d = new Date(anchor);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getShiftType(localHour: number): ShiftType {
  if (localHour >= 7 && localHour < 15) return "morning";
  if (localHour >= 15 && localHour < 23) return "afternoon";
  return "night";
}

/**
 * Resolve the full shift context for an instant, in `tz` (default Europe/Madrid).
 * This is the single function both safety runners call so their shift math cannot diverge.
 */
export function getShiftContext(nowMs: number, tz: string = DEFAULT_TZ): ShiftContext {
  const p = localParts(nowMs, tz);
  const shiftType = getShiftType(p.hour);

  // Night shift after midnight belongs to the previous calendar date.
  const isOvernightAfterMidnight = shiftType === "night" && p.hour < 7;
  const shiftDate = shiftDateString(p, isOvernightAfterMidnight);

  let minutesSinceShiftStart: number;
  if (isOvernightAfterMidnight) {
    // Night shift starts at 23:00 the previous day.
    minutesSinceShiftStart = (p.hour + 24 - 23) * 60 + p.minute;
  } else {
    minutesSinceShiftStart = (p.hour - SHIFT_BOUNDS[shiftType].start) * 60 + p.minute;
  }

  return { shiftType, shiftDate, hour: p.hour, minute: p.minute, minutesSinceShiftStart };
}
