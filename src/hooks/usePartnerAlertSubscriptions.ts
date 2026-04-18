import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerAlertSubscription {
  id: string;
  partner_id: string;
  member_id: string;
  notify_email: boolean;
  notify_sms: boolean;
  created_at: string;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    status: string;
  };
}

export function usePartnerAlertSubscriptions(partnerId: string | undefined) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ["partner-alert-subscriptions", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      const { data, error } = await supabase
        .from("partner_alert_subscriptions")
        .select(`
          *,
          member:members(id, first_name, last_name, status)
        `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PartnerAlertSubscription[];
    },
    enabled: !!partnerId,
    staleTime: 2 * 60 * 1000,
  });

  const toggleSubscription = useMutation({
    mutationFn: async ({
      partnerId: pId,
      memberId,
      subscribe,
    }: {
      partnerId: string;
      memberId: string;
      subscribe: boolean;
    }) => {
      if (subscribe) {
        // Create subscription
        const { data, error } = await supabase
          .from("partner_alert_subscriptions")
          .insert({
            partner_id: pId,
            member_id: memberId,
            notify_email: true,
            notify_sms: false,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Delete subscription
        const { error } = await supabase
          .from("partner_alert_subscriptions")
          .delete()
          .eq("partner_id", pId)
          .eq("member_id", memberId);

        if (error) throw error;
        return null;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-alert-subscriptions", partnerId] });
    },
  });

  return {
    subscriptions: query.data,
    isLoading: query.isLoading,
    error: query.error,
    toggleSubscription,
  };
}

export function useCreateAlertSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      partnerId,
      memberId,
      notifyEmail = true,
      notifySms = false,
    }: {
      partnerId: string;
      memberId: string;
      notifyEmail?: boolean;
      notifySms?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("partner_alert_subscriptions")
        .insert({
          partner_id: partnerId,
          member_id: memberId,
          notify_email: notifyEmail,
          notify_sms: notifySms,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-alert-subscriptions", variables.partnerId] });
    },
  });
}

export function useUpdateAlertSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      partnerId: _partnerId,
      notifyEmail,
      notifySms,
    }: {
      id: string;
      partnerId: string;
      notifyEmail?: boolean;
      notifySms?: boolean;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (notifyEmail !== undefined) updateData.notify_email = notifyEmail;
      if (notifySms !== undefined) updateData.notify_sms = notifySms;

      const { data, error } = await supabase
        .from("partner_alert_subscriptions")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-alert-subscriptions", variables.partnerId] });
    },
  });
}

export function useDeleteAlertSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, partnerId: _partnerId }: { id: string; partnerId: string }) => {
      const { error } = await supabase
        .from("partner_alert_subscriptions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-alert-subscriptions", variables.partnerId] });
    },
  });
}
