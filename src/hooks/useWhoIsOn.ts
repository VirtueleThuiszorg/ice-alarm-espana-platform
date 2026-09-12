import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { INTERVALS, STALE_TIMES } from "@/config/constants";
import { heartbeatIsFresh } from "../../supabase/functions/_shared/presence";
import type { ShiftType } from "@/config/shifts";
import {
  SHIFT_BOUNDS,
  getShiftContext,
} from "../../supabase/functions/_shared/shift-time";

/**
 * WHO IS ON NOW, AND WHO IS ON NEXT — from the same three facts `staff-shift-monitor` uses.
 *
 * THE THREE FACTS, and they are not interchangeable. The monitor raises a no-show when the first
 * disagrees with the second, and a disconnection when the third goes stale, so a strip that
 * showed only one of them would say "covered" at a moment the runner is raising an alarm:
 *
 *   SCHEDULED   `staff_on_shift_now` — the view over `staff_shifts` the monitor reads for
 *               "who should be here". A rota row, nothing more.
 *   ON DUTY     `staff.is_on_call` — a DECLARATION. Somebody pressed the button.
 *   PRESENT     `staff_presence.is_online` + `last_heartbeat_at` — an OBSERVATION: a browser of
 *               theirs pinged recently. Never treated as duty (see useStaffHeartbeat).
 *
 * NOT A FOURTH QUERY. `staff_on_shift_now` is the monitor's own source and `useOnShiftNow`
 * already reads it; this hook adds duty and presence beside it rather than inventing a second
 * definition of "on shift". The one thing it computes for itself is who is on NEXT, which no
 * existing read answers — and it computes the boundary with `getShiftContext`, the same
 * DST-correct helper both safety runners call, so "next" here and "current" there cannot drift.
 *
 * WHO CAN SEE IT: presence is readable by admin, super_admin and call_centre_supervisor only
 * (RLS, 20260303123455). An operator gets an empty presence list, which is why this is a
 * supervisor strip and not a dashboard widget for everyone.
 */

export interface OnShiftPerson {
  staffId: string;
  name: string;
  shiftType: ShiftType;
  /** They are on the rota for this shift. */
  scheduled: boolean;
  /** They pressed "on duty". */
  onDuty: boolean;
  /** A browser of theirs has pinged inside the staleness window. */
  present: boolean;
  /** ISO timestamp of the last ping, or null if there has never been one. */
  lastHeartbeatAt: string | null;
}

export interface WhoIsOn {
  /** The shift in progress right now, in Europe/Madrid. */
  currentShift: ShiftType;
  /** The shift that starts next, and the date it is keyed on. */
  nextShift: ShiftType;
  nextShiftDate: string;
  /** Scheduled for the shift in progress, with duty and presence attached. */
  now: OnShiftPerson[];
  /** Scheduled for the next shift. Duty and presence are not asked of them yet. */
  next: Array<Pick<OnShiftPerson, "staffId" | "name" | "shiftType">>;
  /**
   * Nobody is scheduled for the shift in progress. Distinct from "scheduled but not here":
   * an empty rota slot is a planning failure, an absent person is an operational one.
   */
  noneScheduled: boolean;
  /** Scheduled, but neither on duty nor present. What the no-show alert is about. */
  unaccountedFor: OnShiftPerson[];
}

/**
 * How stale a heartbeat may be before presence stops counting.
 *
 * IT IS NOW THE SAME CONSTANT, not the same number written twice. This file used to declare its
 * own 90, with a comment saying it matched `staff-shift-monitor`'s and a test that read the
 * runner's source to check they had not drifted. Two constants that agree by test are still two
 * constants — the test only says they have not drifted YET — and the runner and this strip
 * answering "is this person here" differently is precisely the defect that filled a bell with
 * no-show alerts about somebody who was at his desk.
 *
 * `_shared/presence.ts` is importable from both the edge runtime and here, the way
 * `notifyMatrix.ts` already imports the router's event list across that boundary.
 */
export { HEARTBEAT_STALE_SECONDS } from "../../supabase/functions/_shared/presence";

/** The shift after `type`, in cycle order. */
function nextShiftType(type: ShiftType): ShiftType {
  return type === "morning" ? "afternoon" : type === "afternoon" ? "night" : "morning";
}

/**
 * The date the NEXT shift is keyed on.
 *
 * Only one boundary moves the date: the night shift is followed by the next calendar day's
 * morning. Everything else stays on the current shift date — including the small hours, where
 * `getShiftContext` has already resolved `shiftDate` back to the day the night began.
 */
function nextShiftDate(shiftDate: string, current: ShiftType): string {
  if (current !== "night") return shiftDate;
  const [y, m, d] = shiftDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function useWhoIsOn(enabled = true) {
  return useQuery<WhoIsOn>({
    enabled,
    queryKey: ["who-is-on"],
    queryFn: async () => {
      const ctx = getShiftContext(Date.now());
      const upcoming = nextShiftType(ctx.shiftType);
      const upcomingDate = nextShiftDate(ctx.shiftDate, ctx.shiftType);

      const [scheduledNow, scheduledNext, duty, presence] = await Promise.all([
        supabase.from("staff_on_shift_now").select("staff_id, first_name, last_name, shift_type"),
        supabase
          .from("staff_shifts")
          .select("staff_id, shift_type, staff:staff_id(first_name, last_name)")
          .eq("shift_date", upcomingDate)
          .eq("shift_type", upcoming),
        supabase.from("staff").select("id, is_on_call").eq("is_on_call", true),
        supabase.from("staff_presence").select("staff_id, is_online, last_heartbeat_at"),
      ]);

      for (const r of [scheduledNow, scheduledNext, duty, presence]) {
        if (r.error) throw r.error;
      }

      const onDutyIds = new Set((duty.data ?? []).map((s) => s.id));
      const nowMs = Date.now();
      const presenceById = new Map(
        (presence.data ?? []).map((p) => [
          p.staff_id as string,
          {
            // `is_online` alone is not enough: the runner only clears it when it next runs, so a
            // browser closed two minutes ago still reads as online until then. The freshness
            // rule is the shared one, so this strip and the alert cannot disagree about the same
            // heartbeat.
            present:
              !!p.is_online && heartbeatIsFresh(p.last_heartbeat_at as string | null, nowMs),
            lastHeartbeatAt: (p.last_heartbeat_at as string | null) ?? null,
          },
        ]),
      );

      const now: OnShiftPerson[] = (scheduledNow.data ?? []).map((row) => {
        const seen = presenceById.get(row.staff_id as string);
        return {
          staffId: row.staff_id as string,
          name: `${row.first_name} ${row.last_name}`.trim(),
          shiftType: row.shift_type as ShiftType,
          scheduled: true,
          onDuty: onDutyIds.has(row.staff_id as string),
          present: !!seen?.present,
          lastHeartbeatAt: seen?.lastHeartbeatAt ?? null,
        };
      });

      // Cast through `unknown` for the embedded join, exactly as `useStaffShifts` does:
      // `staff_shifts` has two foreign keys into `staff` (staff_id and created_by), so the
      // generated types cannot infer the embed and hand back an error type instead.
      const nextRows = (scheduledNext.data ?? []) as unknown as Array<{
        staff_id: string;
        shift_type: ShiftType;
        staff: { first_name: string; last_name: string } | null;
      }>;
      const next = nextRows.map((row) => {
        const staff = row.staff;
        return {
          staffId: row.staff_id,
          name: staff ? `${staff.first_name} ${staff.last_name}`.trim() : "—",
          shiftType: row.shift_type,
        };
      });

      return {
        currentShift: ctx.shiftType,
        nextShift: upcoming,
        nextShiftDate: upcomingDate,
        now,
        next,
        noneScheduled: now.length === 0,
        unaccountedFor: now.filter((p) => !p.onDuty && !p.present),
      };
    },
    staleTime: STALE_TIMES.REALTIME,
    refetchInterval: INTERVALS.DEVICE_QUEUE_REFRESH,
  });
}

/** When the shift in progress ends, as `HH:MM` local — read off SHIFT_BOUNDS, not hardcoded. */
export function shiftEndLabel(type: ShiftType): string {
  return `${String(SHIFT_BOUNDS[type].end).padStart(2, "0")}:00`;
}
