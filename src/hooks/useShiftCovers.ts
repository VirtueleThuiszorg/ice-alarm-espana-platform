import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { CoverStatus } from "@/config/shifts";
import { toast } from "sonner";
import i18n from "@/i18n";
import { getApproverUserIds, getStaffContact, notifyUsers } from "@/lib/staffNotify";

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

      // NEVER SILENT: the covering staff member gets a TARGETED, actionable
      // notification (accept/decline lives on their dashboard widget and the
      // holidays page) — not just a row in a list they'd have to notice.
      const [{ userId: coverUserId }, { name: originalName }, shiftRes] = await Promise.all([
        getStaffContact(cover.cover_staff_id),
        getStaffContact(cover.original_staff_id),
        supabase.from("staff_shifts").select("shift_date").eq("id", cover.shift_id).maybeSingle(),
      ]);
      const shiftDate = (shiftRes.data as { shift_date?: string } | null)?.shift_date ?? "an upcoming shift";
      await notifyUsers([coverUserId], {
        eventType: "shift_cover.requested",
        message: `Cover request: ${originalName}'s shift on ${shiftDate} — please accept or decline on your dashboard`,
        entityType: "staff_shift_cover",
        entityId: data.id,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-pending-covers"] });
      queryClient.invalidateQueries({ queryKey: ["all-covers"] });
      queryClient.invalidateQueries({ queryKey: ["covers-for-holiday"] });
      toast.success(i18n.t("covers.toasts.requestSent"));
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("covers.toasts.requestFailed"));
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

      // If accepted, reassign the shift to the cover staff. The error is
      // CHECKED: before 20260724130000 this update was silently RLS-denied
      // when the covering AGENT accepted (only admins could write
      // staff_shifts), leaving the rota still showing the absent person.
      if (status === "accepted" && data.shift) {
        const { error: reassignError } = await supabase
          .from("staff_shifts")
          .update({ staff_id: data.cover_staff_id })
          .eq("id", data.shift_id);
        if (reassignError) {
          throw new Error(
            `Cover accepted but the shift could NOT be reassigned (${reassignError.message}) — tell a supervisor`,
          );
        }
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

      // NEVER SILENT: supervisors/admins (and whoever requested the cover)
      // hear the outcome directly.
      const [{ name: coverName }, approverIds, { userId: requesterUserId }] = await Promise.all([
        getStaffContact(data.cover_staff_id),
        getApproverUserIds(),
        data.requested_by ? getStaffContact(data.requested_by) : Promise.resolve({ userId: null, name: "" }),
      ]);
      await notifyUsers([...approverIds, requesterUserId], {
        eventType: `shift_cover.${status}`,
        message: `${coverName} ${status} the shift cover${data.shift?.shift_date ? ` for ${data.shift.shift_date}` : ""}${response_note ? ` — "${response_note}"` : ""}`,
        entityType: "staff_shift_cover",
        entityId: data.id,
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
      toast.success(
        variables.status === "accepted"
          ? i18n.t("covers.toasts.accepted")
          : i18n.t("covers.toasts.declined")
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || i18n.t("covers.toasts.respondFailed"));
    },
  });

  return { requestCover, respondToCover };
}
