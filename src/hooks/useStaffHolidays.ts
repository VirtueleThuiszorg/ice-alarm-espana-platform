import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { HolidayStatus } from "@/config/shifts";
import { toast } from "sonner";
import i18n from "@/i18n";
import { getApproverUserIds, getStaffContact, notifyUsers } from "@/lib/staffNotify";

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

      // NEVER SILENT: notify every holiday approver (supervisor primary,
      // admins oversight) with a TARGETED in-app notification. The old code
      // inserted an untargeted notification_log row that RLS silently denied.
      const [{ name: requesterName }, approverIds] = await Promise.all([
        getStaffContact(holiday.staff_id),
        getApproverUserIds(),
      ]);
      await notifyUsers(approverIds, {
        eventType: "holiday.requested",
        message: `${requesterName} requested holiday ${holiday.start_date} → ${holiday.end_date}${holiday.reason ? ` (${holiday.reason})` : ""}`,
        entityType: "staff_holiday",
        entityId: data.id,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["my-holiday-balance"] });
      queryClient.invalidateQueries({ queryKey: ["all-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["all-holiday-balances"] });
      toast.success(i18n.t("holidays.toasts.requestSubmitted"));
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("holidays.toasts.requestFailed"));
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

      // NEVER SILENT: tell the requesting agent the outcome, directly.
      const { userId: agentUserId } = await getStaffContact(data.staff_id);
      await notifyUsers([agentUserId], {
        eventType: `holiday.${status}`,
        message: `Your holiday ${data.start_date} → ${data.end_date} was ${status}${review_notes ? `: ${review_notes}` : ""}`,
        entityType: "staff_holiday",
        entityId: data.id,
      });

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["my-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["my-holiday-balance"] });
      queryClient.invalidateQueries({ queryKey: ["all-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["all-holiday-balances"] });
      toast.success(
        variables.status === "approved"
          ? i18n.t("holidays.toasts.approved")
          : i18n.t("holidays.toasts.rejected")
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("holidays.toasts.reviewFailed"));
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
      toast.success(i18n.t("holidays.toasts.cancelled"));
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("holidays.toasts.cancelFailed"));
    },
  });

  return { requestHoliday, reviewHoliday, cancelHoliday };
}
