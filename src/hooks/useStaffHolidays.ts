import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { HolidayStatus } from "@/config/shifts";
import { toast } from "sonner";

export interface StaffHoliday {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: HolidayStatus;
  total_days: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  staff?: { first_name: string; last_name: string };
  reviewer?: { first_name: string; last_name: string };
}

export interface HolidayBalance {
  staff_id: string;
  first_name: string;
  last_name: string;
  annual_holiday_days: number;
  days_used_or_pending: number;
  days_approved: number;
  days_pending: number;
  days_remaining: number;
}

// Staff's own holidays
export function useMyHolidays(staffId: string | undefined) {
  return useQuery<StaffHoliday[]>({
    queryKey: ["my-holidays", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("*")
        .eq("staff_id", staffId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffHoliday[];
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.MEDIUM,
  });
}

// Staff's own holiday balance
export function useMyHolidayBalance(staffId: string | undefined) {
  return useQuery<HolidayBalance | null>({
    queryKey: ["my-holiday-balance", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_holiday_balance")
        .select("*")
        .eq("staff_id", staffId!)
        .maybeSingle();
      if (error) throw error;
      return data as HolidayBalance | null;
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.MEDIUM,
  });
}

// All holidays (admin view)
export function useAllHolidays(statusFilter?: HolidayStatus) {
  return useQuery<StaffHoliday[]>({
    queryKey: ["all-holidays", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("staff_holidays")
        .select("*, staff:staff_id(first_name, last_name), reviewer:reviewed_by(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as StaffHoliday[];
    },
    staleTime: STALE_TIMES.SHORT,
  });
}

// All holiday balances (admin view)
export function useAllHolidayBalances() {
  return useQuery<HolidayBalance[]>({
    queryKey: ["all-holiday-balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_holiday_balance")
        .select("*")
        .order("first_name");
      if (error) throw error;
      return (data || []) as HolidayBalance[];
    },
    staleTime: STALE_TIMES.MEDIUM,
  });
}

// Holiday mutations
export function useHolidayMutations() {
  const queryClient = useQueryClient();

  const requestHoliday = useMutation({
    mutationFn: async (holiday: {
      staff_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .insert({ ...holiday, status: "requested" })
        .select()
        .single();
      if (error) throw error;

      // Insert AI event for Isabella notification
      await supabase.from("ai_events").insert({
        event_type: "holiday.requested",
        entity_type: "staff_holiday",
        entity_id: data.id,
        payload: {
          staff_id: holiday.staff_id,
          start_date: holiday.start_date,
          end_date: holiday.end_date,
        },
      });

      // Insert notification log
      await supabase.from("notification_log").insert({
        event_type: "holiday.requested",
        entity_type: "staff_holiday",
        entity_id: data.id,
        message: `Holiday requested: ${holiday.start_date} to ${holiday.end_date}`,
        status: "sent",
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["my-holiday-balance"] });
      queryClient.invalidateQueries({ queryKey: ["all-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["all-holiday-balances"] });
      toast.success("Holiday request submitted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit holiday request");
    },
  });

  const reviewHoliday = useMutation({
    mutationFn: async ({
      id,
      status,
      reviewed_by,
      review_notes,
    }: {
      id: string;
      status: "approved" | "rejected";
      reviewed_by: string;
      review_notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .update({
          status,
          reviewed_by,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes || null,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Insert AI event
      await supabase.from("ai_events").insert({
        event_type: `holiday.${status}`,
        entity_type: "staff_holiday",
        entity_id: data.id,
        payload: {
          staff_id: data.staff_id,
          start_date: data.start_date,
          end_date: data.end_date,
          status,
        },
      });

      // Insert notification log
      await supabase.from("notification_log").insert({
        event_type: `holiday.${status}`,
        entity_type: "staff_holiday",
        entity_id: data.id,
        message: `Holiday ${status}: ${data.start_date} to ${data.end_date}`,
        status: "sent",
      });

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["my-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["my-holiday-balance"] });
      queryClient.invalidateQueries({ queryKey: ["all-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["all-holiday-balances"] });
      toast.success(`Holiday ${variables.status}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to review holiday");
    },
  });

  const cancelHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["my-holiday-balance"] });
      queryClient.invalidateQueries({ queryKey: ["all-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["all-holiday-balances"] });
      toast.success("Holiday cancelled");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel holiday");
    },
  });

  return { requestHoliday, reviewHoliday, cancelHoliday };
}
