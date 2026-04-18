import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StaffInvite } from "@/types/staff";
import { toast } from "sonner";

export function useStaffInvite(staffId: string | undefined) {
  return useQuery({
    queryKey: ["staff-invite", staffId],
    queryFn: async () => {
      if (!staffId) return null;

      const { data, error } = await (supabase
        .from("staff_invites" as any)
        .select("*")
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle());

      if (error) throw error;
      return data as StaffInvite | null;
    },
    enabled: !!staffId,
  });
}

export function useSendInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (staffId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("You must be logged in");
      }

      const response = await supabase.functions.invoke("staff-send-invite", {
        body: { staff_id: staffId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to send invitation");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: (_data, staffId) => {
      queryClient.invalidateQueries({ queryKey: ["staff-invite", staffId] });
      queryClient.invalidateQueries({ queryKey: ["staff-activity", staffId] });
      toast.success("Invitation sent successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send invitation");
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ inviteId, staffId }: { inviteId: string; staffId: string }) => {
      const { error } = await (supabase
        .from("staff_invites" as any)
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", inviteId)
        .eq("status", "pending"));

      if (error) throw error;
      return { inviteId, staffId };
    },
    onSuccess: ({ staffId }) => {
      queryClient.invalidateQueries({ queryKey: ["staff-invite", staffId] });
      toast.success("Invitation revoked");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke invitation");
    },
  });
}
