import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { optinUpsert, type NotificationChannel } from "@/lib/notificationChannels";

export type OptinRecord = Tables<"member_notification_optin">;

/**
 * THE MEMBER'S OWN PERMISSION TO BE MESSAGED — WP3 N9.
 *
 * Read and written **as the member**, which is the point: `20260907100200` gives them SELECT,
 * INSERT and UPDATE on their own rows, and this is the only consent in the system that belongs
 * to them rather than to staff. Golden rule 3 is about roles and plans; a person's permission to
 * be texted is theirs to set and theirs to withdraw.
 *
 * `upsert` on the `(member_id, channel)` unique constraint, so pressing a control twice is one
 * row and not a second one that contradicts the first.
 */
export function useMemberNotificationOptin(memberIdOverride?: string | null) {
  const { memberId: authMemberId, user } = useAuth();
  const memberId = memberIdOverride === undefined ? authMemberId : memberIdOverride;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["member-notification-optin", memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<OptinRecord[]> => {
      const { data, error } = await supabase
        .from("member_notification_optin")
        .select("*")
        .eq("member_id", memberId as string);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setChannel = useMutation({
    mutationFn: async (input: { channel: NotificationChannel; optedIn: boolean }) => {
      if (!memberId) throw new Error("No member record to record consent against.");
      const existing = query.data?.find((r) => r.channel === input.channel);
      const { error } = await supabase
        .from("member_notification_optin")
        .upsert(
          optinUpsert({
            memberId,
            channel: input.channel,
            optedIn: input.optedIn,
            userId: user?.id ?? null,
            existingOptedInAt: existing?.opted_in_at,
          }),
          { onConflict: "member_id,channel" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member-notification-optin", memberId] });
    },
  });

  return { ...query, setChannel };
}
