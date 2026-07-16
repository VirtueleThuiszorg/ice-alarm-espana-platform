// @vitest-environment node
//
// HAZARD 2 — timezone correctness of the shared shift math (SOS_ESCALATION_SPEC.md §c item 3).
//
// The escalation runner and the shift monitor now both derive their shift from ONE helper,
// getShiftContext(), computed in Europe/Madrid. These tests prove it is DST-correct across the
// CET↔CEST transitions — the exact failure the old `getUTCHours()` code produced (it would read the
// same UTC hour in summer and winter, mis-classifying the shift by an hour half the year).

import { describe, it, expect } from "vitest";
import { getShiftContext, getShiftType } from "../../supabase/functions/_shared/shift-time";

const MADRID = "Europe/Madrid";
const iso = (s: string) => new Date(s).getTime();

describe("getShiftContext — DST-correct Madrid shift math", () => {
  it("applies the WINTER offset (CET, UTC+1)", () => {
    // 05:00 UTC in January → 06:00 Madrid → night shift.
    const ctx = getShiftContext(iso("2026-01-15T05:00:00Z"), MADRID);
    expect(ctx.hour).toBe(6);
    expect(ctx.shiftType).toBe("night");
  });

  it("applies the SUMMER offset (CEST, UTC+2) — the crux of the bug", () => {
    // 05:00 UTC in July → 07:00 Madrid → MORNING start. The old UTC code read hour 5 (night) in
    // BOTH seasons; this assertion fails unless the Madrid+DST conversion is applied.
    const ctx = getShiftContext(iso("2026-07-15T05:00:00Z"), MADRID);
    expect(ctx.hour).toBe(7);
    expect(ctx.shiftType).toBe("morning");
    expect(ctx.minutesSinceShiftStart).toBe(0);
  });

  it("maps the same 07:00 local start from different UTC hours across seasons", () => {
    const winter = getShiftContext(iso("2026-01-15T06:00:00Z"), MADRID); // 07:00 CET
    const summer = getShiftContext(iso("2026-07-15T05:00:00Z"), MADRID); // 07:00 CEST
    expect(winter.hour).toBe(7);
    expect(summer.hour).toBe(7);
    expect(winter.shiftType).toBe("morning");
    expect(summer.shiftType).toBe("morning");
  });

  it("keys the overnight night-shift on the PREVIOUS calendar day", () => {
    // 01:30 UTC July → 03:30 Madrid (CEST) → night, hour < 7 → shift belongs to the day before.
    const ctx = getShiftContext(iso("2026-07-15T01:30:00Z"), MADRID);
    expect(ctx.hour).toBe(3);
    expect(ctx.shiftType).toBe("night");
    expect(ctx.shiftDate).toBe("2026-07-14");
    expect(ctx.minutesSinceShiftStart).toBe((3 + 24 - 23) * 60 + 30); // 270
  });

  it("handles the SPRING-FORWARD gap (02:00→03:00, no 02:xx hour) without error", () => {
    // 2026 Madrid springs forward 2026-03-29 01:00 UTC.
    const before = getShiftContext(iso("2026-03-29T00:59:00Z"), MADRID); // 01:59 CET
    const after = getShiftContext(iso("2026-03-29T01:30:00Z"), MADRID); // 03:30 CEST (02:xx skipped)
    expect(before.hour).toBe(1);
    expect(after.hour).toBe(3); // the non-existent 02:xx hour is skipped, as the wall clock does
    expect(before.shiftType).toBe("night");
    expect(after.shiftType).toBe("night");
  });

  it("handles the FALL-BACK repeated hour (03:00→02:00) consistently", () => {
    // 2026 Madrid falls back 2026-10-25 01:00 UTC. The 02:xx wall-clock hour occurs twice.
    const first = getShiftContext(iso("2026-10-25T00:30:00Z"), MADRID); // 02:30 CEST
    const second = getShiftContext(iso("2026-10-25T01:30:00Z"), MADRID); // 02:30 CET (repeat)
    expect(first.hour).toBe(2);
    expect(second.hour).toBe(2);
    expect(first.shiftType).toBe("night");
    expect(second.shiftType).toBe("night");
  });

  it("classifies shift boundaries exactly (07/15/23)", () => {
    expect(getShiftType(6)).toBe("night");
    expect(getShiftType(7)).toBe("morning");
    expect(getShiftType(14)).toBe("morning");
    expect(getShiftType(15)).toBe("afternoon");
    expect(getShiftType(22)).toBe("afternoon");
    expect(getShiftType(23)).toBe("night");
    expect(getShiftType(0)).toBe("night");
  });

  it("never returns a negative minutesSinceShiftStart across a full day", () => {
    for (let h = 0; h < 24; h++) {
      const ctx = getShiftContext(iso(`2026-07-10T${String(h).padStart(2, "0")}:00:00Z`), MADRID);
      expect(ctx.minutesSinceShiftStart).toBeGreaterThanOrEqual(0);
    }
  });
});
