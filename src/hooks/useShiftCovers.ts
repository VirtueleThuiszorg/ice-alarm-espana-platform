import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { CoverStatus } from "@/config/shifts";
import { toast } from "sonner";

export interface ShiftCover {
  id: string;
  shift_id: string;
  holiday_id: string | null;
  original_staff_id: string;
  cover_staff_id: string;
  status: CoverStatus;
  requested_by: string | null;
  requested_at: string;
  responded_at: string | null;
  response_note: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  shift?: {
    shift_date: string;
    shift_type: string;
    start_time: string;
    end_time: string;
  };
  original_staff?: { first_name: string; last_name: string };
  cover_staff?: { first_name: string; last_name: string };
}

// Pending covers for current staff member
export function useMyPendingCovers(staffId: string | undefined) {
  return useQuery<ShiftCover[]>({
    queryKey: ["my-pending-covers", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shift_covers")
        .select(`
          *,
          shift:shift_id(shift_date, shift_type, start_time, end_time),
          original_staff:original_staff_id(first_name, last_name)
        `)
        .eq("cover_staff_id", staffId!)
        .eq("status", "pending")
        .order("expires_at");
      if (error) throw error;
      return (data || []) as unknown as ShiftCover[];
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.SHORT,
  });
}

// Covers for a specific holiday
export function useCoversForHoliday(holidayId: string | undefined) {
  return useQuery<ShiftCover[]>({
    queryKey: ["covers-for-holiday", holidayId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shift_covers")
        .select(`
          *,
          shift:shift_id(shift_date, shift_type, start_time, end_time),
          cover_staff:cover_staff_id(first_name, last_name)
        `)
        .eq("holiday_id", holidayId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as ShiftCover[];
    },
    enabled: !!holidayId,
    staleTime: STALE_TIMES.SHORT,
  });
}

// All covers (admin view)
export function useAllCovers(statusFilter?: CoverStatus) {
  return useQuery<ShiftCover[]>({
    queryKey: ["all-covers", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("staff_shift_covers")
        .select(`
          *,
          shift:shift_id(shift_date, shift_type, start_time, end_time),
          original_staff:original_staff_id(first_name, last_name),
          cover_staff:cover_staff_id(first_name, last_name)
        `)
        .order("created_at", { ascending: false });
      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ShiftCover[];
    },
    staleTime: STALE_TIMES.SHORT,
  });
}

// Cover mutations
export function useShiftCoverMutations() {
  const queryClient = useQueryClient();

  const requestCover = useMutation({
    mutationFn: async (cover: {
      shift_id: string;
      holiday_id?: string;
      original_staff_id: string;
      cover_staff_id: string;
      requested_by: string;
    }) => {
      const { data, error } = await supabase
        .from("staff_shift_covers")
        .insert(cover)
        .select()
        .single();
      if (error) throw error;

      // Insert AI event
      await supabase.from("ai_events").insert({
        event_type: "shift_cover.requested",
        entity_type: "staff_shift_cover",
        entity_id: data.id,
        payload: {
          shift_id: cover.shift_id,
          original_staff_id: cover.original_staff_id,
          cover_staff_id: cover.cover_staff_id,
        },
      });

      // Insert notification log
      await supabase.from("notification_log").insert({
        event_type: "shift_cover.requested",
        entity_type: "staff_shift_cover",
        entity_id: data.id,
        message: "Shift cover requested",
        status: "sent",
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-pending-covers"] });
      queryClient.invalidateQueries({ queryKey: ["all-covers"] });
      queryClient.invalidateQueries({ queryKey: ["covers-for-holiday"] });
      toast.success("Cover request sent");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to request cover");
    },
  });

  const respondToCover = useMutation({
    mutationFn: async ({
      id,
      status,
      response_note,
    }: {
      id: string;
      status: "accepted" | "declined";
      response_note?: string;
    }) => {
      const { data, error } = await supabase
        .from("staff_shift_covers")
        .update({
          status,
          responded_at: new Date().toISOString(),
          response_note: response_note || null,
        })
        .eq("id", id)
        .select("*, shift:shift_id(*)")
        .single();
      if (error) throw error;

      // If accepted, reassign the shift to the cover staff
      if (status === "accepted" && data.shift) {
        await supabase
          .from("staff_shifts")
          .update({ staff_id: data.cover_staff_id })
          .eq("id", data.shift_id);
      }

      // Insert AI event
      await supabase.from("ai_events").insert({
        event_type: `shift_cover.${status}`,
        entity_type: "staff_shift_cover",
        entity_id: data.id,
        payload: {
          shift_id: data.shift_id,
          original_staff_id: data.original_staff_id,
          cover_staff_id: data.cover_staff_id,
          status,
        },
      });

      // Insert notification log
      await supabase.from("notification_log").insert({
        event_type: `shift_cover.${status}`,
        entity_type: "staff_shift_cover",
        entity_id: data.id,
        message: `Shift cover ${status}`,
        status: "sent",
      });

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["my-pending-covers"] });
      queryClient.invalidateQueries({ queryKey: ["all-covers"] });
      queryClient.invalidateQueries({ queryKey: ["covers-for-holiday"] });
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["on-shift-now"] });
      toast.success(`Cover ${variables.status}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to respond to cover request");
    },
  });

  return { requestCover, respondToCover };
}
