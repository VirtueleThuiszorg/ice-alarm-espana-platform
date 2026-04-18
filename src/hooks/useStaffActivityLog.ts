import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { StaffActivityLog } from "@/types/staff";

export function useStaffActivity(staffId: string | undefined) {
  return useQuery({
    queryKey: ["staff-activity", staffId],
    queryFn: async () => {
      if (!staffId) return [];

      const { data, error } = await supabase
        .from("staff_activity_log")
        .select(`
          *,
          performer:performed_by(first_name, last_name)
        `)
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      return (data || []).map((entry: any) => ({
        ...entry,
        performed_by_name: entry.performer
          ? `${entry.performer.first_name} ${entry.performer.last_name}`
          : "System",
        performer: undefined,
      })) as StaffActivityLog[];
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.SHORT,
  });
}

export function useLogStaffActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      staffId,
      action,
      details,
    }: {
      staffId: string;
      action: string;
      details?: Record<string, unknown>;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      let performerStaffId: string | null = null;
      if (userId) {
        const { data: staff } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", userId)
          .single();
        performerStaffId = staff?.id || null;
      }

      const { data, error } = await supabase
        .from("staff_activity_log")
        .insert({
          staff_id: staffId,
          action,
          details: (details || {}) as any,
          performed_by: performerStaffId,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["staff-activity", variables.staffId] });
    },
  });
}
