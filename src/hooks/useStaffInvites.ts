import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StaffInvite } from "@/types/staff";
import { toast } from "sonner";

// `staff_invites` is not present in the generated Supabase types, so this
// façade exposes only the query/mutation builder methods used below.
const staffInvitesDb = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => {
            maybeSingle: () => Promise<{ data: StaffInvite | null; error: unknown }>;
          };
        };
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        eq: (column: string, value: unknown) => Promise<{ error: unknown }>;
      };
    };
  };
};

export function useStaffInvite(staffId: string | undefined) {
  return useQuery({
    queryKey: ["staff-invite", staffId],
    queryFn: async () => {
      if (!staffId) return null;

      const { data, error } = await staffInvitesDb
        .from("staff_invites")
        .select("*")
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

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
    onSuccess: (data, staffId) => {
      queryClient.invalidateQueries({ queryKey: ["staff-invite", staffId] });
      queryClient.invalidateQueries({ queryKey: ["staff-activity", staffId] });
      if (data?.email_sent === false) {
        // Never-silent: the invite row exists, but no email went out — the
        // admin must know, or the staff member waits forever on nothing.
        toast.warning(
          `Invite created, but the email could not be sent (${data.email_error || "email transport unavailable"}). ` +
            "Fix the email configuration and resend, or share the invite link manually.",
          { duration: 10000 },
        );
      } else {
        toast.success("Invitation sent successfully!");
      }
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
      const { error } = await staffInvitesDb
        .from("staff_invites")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", inviteId)
        .eq("status", "pending");

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
