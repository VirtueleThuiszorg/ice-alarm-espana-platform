import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";

export interface PartnerMember {
  id: string;
  partner_id: string;
  member_id: string;
  relationship_type: "resident" | "client" | "beneficiary";
  added_at: string;
  added_by: string | null;
  removed_at: string | null;
  notes: string | null;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    status: string;
  };
}

export function usePartnerMembers(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-members", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      const { data, error } = await supabase
        .from("partner_members")
        .select(`
          *,
          member:members(id, first_name, last_name, email, phone, status)
        `)
        .eq("partner_id", partnerId)
        .is("removed_at", null)
        .order("added_at", { ascending: false });

      if (error) throw error;
      return data as PartnerMember[];
    },
    enabled: !!partnerId,
    staleTime: STALE_TIMES.MEDIUM,
  });
}

export function useAddPartnerMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      partnerId,
      memberId,
      relationshipType = "resident",
      notes,
    }: {
      partnerId: string;
      memberId: string;
      relationshipType?: "resident" | "client" | "beneficiary";
      notes?: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      
      const { data, error } = await supabase
        .from("partner_members")
        .insert({
          partner_id: partnerId,
          member_id: memberId,
          relationship_type: relationshipType,
          notes: notes || null,
          added_by: session.session?.user.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-members", variables.partnerId] });
    },
  });
}

export function useRemovePartnerMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, partnerId: _partnerId }: { id: string; partnerId: string }) => {
      const { error } = await supabase
        .from("partner_members")
        .update({ removed_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-members", variables.partnerId] });
    },
  });
}

export function useUpdatePartnerMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      partnerId: _partnerId,
      relationshipType,
      notes,
    }: {
      id: string;
      partnerId: string;
      relationshipType?: "resident" | "client" | "beneficiary";
      notes?: string;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (relationshipType !== undefined) updateData.relationship_type = relationshipType;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from("partner_members")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-members", variables.partnerId] });
    },
  });
}
