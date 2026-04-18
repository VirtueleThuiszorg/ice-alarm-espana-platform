import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { StaffMember, StaffFilters, StaffStatus } from "@/types/staff";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 20;

export function useStaffMembers(
  filters: StaffFilters,
  page: number,
  pageSize: number = ITEMS_PER_PAGE
) {
  return useQuery({
    queryKey: ["staff-members", filters, page],
    queryFn: async () => {
      let query = supabase
        .from("staff")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`
        );
      }

      if (filters.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      if (filters.role && filters.role !== "all") {
        query = query.eq("role", filters.role as "admin" | "call_centre" | "call_centre_supervisor" | "super_admin");
      }

      if (filters.department && filters.department !== "all") {
        query = query.eq("department", filters.department);
      }

      const { data, count, error } = await query;

      if (error) throw error;
      return { data: (data || []) as StaffMember[], count: count || 0 };
    },
    staleTime: STALE_TIMES.MEDIUM,
  });
}

export function useStaffMember(staffId: string | undefined) {
  return useQuery({
    queryKey: ["staff-member", staffId],
    queryFn: async () => {
      if (!staffId) return null;

      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("id", staffId)
        .single();

      if (error) throw error;
      return data as StaffMember;
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.MEDIUM,
  });
}

export function useStaffStats() {
  return useQuery({
    queryKey: ["staff-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("status");

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        active: 0,
        on_leave: 0,
        suspended: 0,
        terminated: 0,
        pending: 0,
      };

      data?.forEach((s: { status: string }) => {
        if (s.status in stats) {
          stats[s.status as keyof Omit<typeof stats, "total">]++;
        }
      });

      return stats;
    },
    staleTime: STALE_TIMES.MEDIUM,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      phone?: string;
      preferred_language: string;
      // Optional fields admin may fill in
      date_of_birth?: string;
      nationality?: string;
      nie_number?: string;
      social_security_number?: string;
      address_line1?: string;
      address_line2?: string;
      city?: string;
      province?: string;
      postal_code?: string;
      country?: string;
      emergency_contact_name?: string;
      emergency_contact_phone?: string;
      emergency_contact_relationship?: string;
      hire_date?: string;
      department?: string;
      position?: string;
      contract_type?: string;
      notes?: string;
      personal_mobile?: string;
      escalation_priority?: number;
      is_on_call?: boolean;
      annual_holiday_days?: number;
    }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("You must be logged in to create staff members");
      }

      const response = await supabase.functions.invoke("staff-register", {
        body: values,
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to create staff member");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-members"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stats"] });
      toast.success("Staff member created. Send them an invitation from their profile.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create staff member");
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from("staff")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      const { data: session } = await supabase.auth.getSession();
      const performedBy = session.session?.user.id;

      let performerStaffId: string | null = null;
      if (performedBy) {
        const { data: performer } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", performedBy)
          .single();
        performerStaffId = performer?.id || null;
      }

      await supabase.from("staff_activity_log").insert({
        staff_id: id,
        action: "profile_update",
        details: { updated_fields: Object.keys(updates) },
        performed_by: performerStaffId,
      });

      return data as StaffMember;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-members"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member", data.id] });
      queryClient.invalidateQueries({ queryKey: ["staff-stats"] });
      toast.success("Staff member updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update staff member");
    },
  });
}

export function useToggleStaffStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: StaffStatus;
    }) => {
      // Get old status for logging
      const { data: oldData } = await supabase
        .from("staff")
        .select("status")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("staff")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      const { data: session } = await supabase.auth.getSession();
      const performedBy = session.session?.user.id;

      let performerStaffId: string | null = null;
      if (performedBy) {
        const { data: performer } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", performedBy)
          .single();
        performerStaffId = performer?.id || null;
      }

      await supabase.from("staff_activity_log").insert({
        staff_id: id,
        action: "status_change",
        details: {
          old_status: oldData?.status,
          new_status: status,
        },
        performed_by: performerStaffId,
      });

      return data as StaffMember;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-members"] });
      queryClient.invalidateQueries({ queryKey: ["staff-member", data.id] });
      queryClient.invalidateQueries({ queryKey: ["staff-stats"] });
      queryClient.invalidateQueries({ queryKey: ["staff-activity", data.id] });
      toast.success("Staff status updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update staff status");
    },
  });
}
