import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES, INTERVALS } from "@/config/constants";
import type { ShiftType } from "@/config/shifts";
import { toast } from "sonner";

export interface StaffShift {
  id: string;
  staff_id: string;
  shift_date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  is_confirmed: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  staff?: { first_name: string; last_name: string };
}

export interface OnShiftNow {
  id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  shift_date: string;
}

// All shifts for a date range (admin rota view)
export function useStaffShifts(startDate: string, endDate: string) {
  return useQuery<StaffShift[]>({
    queryKey: ["staff-shifts", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .select("*, staff:staff_id(first_name, last_name)")
        .gte("shift_date", startDate)
        .lte("shift_date", endDate)
        .order("shift_date")
        .order("start_time");
      if (error) throw error;
      return (data || []) as unknown as StaffShift[];
    },
    staleTime: STALE_TIMES.SHORT,
  });
}

// Staff's own upcoming shifts
export function useMyShifts(staffId: string | undefined, days = 14) {
  return useQuery<StaffShift[]>({
    queryKey: ["my-shifts", staffId, days],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const futureDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("staff_shifts")
        .select("*")
        .eq("staff_id", staffId!)
        .gte("shift_date", today)
        .lte("shift_date", futureDate)
        .order("shift_date")
        .order("start_time");
      if (error) throw error;
      return (data || []) as StaffShift[];
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.SHORT,
  });
}

/**
 * A staff member's OWN shifts between two dates.
 *
 * `useMyShifts` above answers "the next N days" and is what the dashboard widget wants. The
 * My-shifts page needs a named range in both directions — eight weeks ahead on one tab, a chosen
 * month behind on another — and a `days` count cannot express a past month at all. Same table,
 * same `staff_id` filter, so RLS ("Staff view own shifts") is doing the same work in both.
 */
export function useMyShiftRange(
  staffId: string | undefined,
  startDate: string,
  endDate: string,
) {
  return useQuery<StaffShift[]>({
    queryKey: ["my-shift-range", staffId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .select("*")
        .eq("staff_id", staffId!)
        .gte("shift_date", startDate)
        .lte("shift_date", endDate)
        .order("shift_date")
        .order("start_time");
      if (error) throw error;
      return (data || []) as StaffShift[];
    },
    enabled: !!staffId && !!startDate && !!endDate,
    staleTime: STALE_TIMES.SHORT,
  });
}

/**
 * WHAT A PAST SHIFT LEFT BEHIND — the handover notes this person wrote, with their timestamps.
 *
 * The Past tab must not tell an operator they "worked" a shift on the platform's word alone. Two
 * things can actually be shown:
 *
 *   1. `staff_shifts.is_confirmed` — they confirmed the shift.
 *   2. Work recorded during it. `shift_notes` is the one such table an operator may READ under
 *      RLS ("Staff can view shift notes"); `staff_activity_log` and `shift_alert_log` are both
 *      admin-only, and `staff_presence` holds ONE upserted row per person — current presence,
 *      with no history — so neither can evidence a shift that has already happened.
 *
 * Notes carry `created_at` and no shift key, so they are attributed with
 * `shiftKeyOfTimestamp` — `getShiftContext`, the same shift maths the escalation runners use.
 * A wide date window is fetched and bucketed on the client because a note at 01:00 belongs to the
 * previous day's night shift, and a `shift_date`-shaped filter cannot see that.
 */
export function useMyShiftEvidence(
  staffId: string | undefined,
  fromDate: string,
  toDate: string,
) {
  return useQuery<Array<{ id: string; created_at: string | null }>>({
    queryKey: ["my-shift-evidence", staffId, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_notes")
        .select("id, created_at")
        .eq("staff_id", staffId!)
        // A day either side, so a night shift's small hours are inside the window.
        .gte("created_at", `${fromDate}T00:00:00Z`)
        .lte("created_at", `${toDate}T23:59:59Z`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!staffId && !!fromDate && !!toDate,
    staleTime: STALE_TIMES.MEDIUM,
  });
}

// Who is on shift right now
export function useOnShiftNow() {
  return useQuery<OnShiftNow[]>({
    queryKey: ["on-shift-now"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_on_shift_now")
        .select("*");
      if (error) throw error;
      return (data || []) as OnShiftNow[];
    },
    staleTime: STALE_TIMES.REALTIME,
    refetchInterval: INTERVALS.DEVICE_QUEUE_REFRESH,
  });
}

// CRUD mutations
export function useShiftMutations() {
  const queryClient = useQueryClient();

  const createShift = useMutation({
    mutationFn: async (shift: {
      staff_id: string;
      shift_date: string;
      shift_type: ShiftType;
      start_time: string;
      end_time: string;
      notes?: string;
      created_by?: string;
    }) => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .insert(shift)
        .select()
        .single();
      if (error) throw error;

      // Insert AI event for Isabella
      await supabase.from("ai_events").insert({
        event_type: "shift.assigned",
        entity_type: "staff_shift",
        entity_id: data.id,
        payload: {
          staff_id: shift.staff_id,
          shift_date: shift.shift_date,
          shift_type: shift.shift_type,
          start_time: shift.start_time,
          end_time: shift.end_time,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["on-shift-now"] });
      toast.success("Shift created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create shift");
    },
  });

  const updateShift = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<StaffShift> }) => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["on-shift-now"] });
      toast.success("Shift updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update shift");
    },
  });

  const deleteShift = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("staff_shifts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["on-shift-now"] });
      toast.success("Shift deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete shift");
    },
  });

  const bulkCreateShifts = useMutation({
    mutationFn: async (shifts: Array<{
      staff_id: string;
      shift_date: string;
      shift_type: ShiftType;
      start_time: string;
      end_time: string;
      notes?: string;
      created_by?: string;
    }>) => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .insert(shifts)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
      toast.success(`${data.length} shifts created`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create shifts");
    },
  });

  return { createShift, updateShift, deleteShift, bulkCreateShifts };
}
