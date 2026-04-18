import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

export type AdminIdea = {
  id: string;
  staff_id: string;
  title: string;
  content: string;
  category: "idea" | "bug" | "feature" | "note";
  priority: "low" | "medium" | "high";
  is_checklist: boolean;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  staff?: { first_name: string | null; last_name: string | null } | null;
};

type CreateIdeaInput = {
  title: string;
  content?: string;
  category?: AdminIdea["category"];
  priority?: AdminIdea["priority"];
  is_checklist?: boolean;
};

export function useAdminIdeas() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState<string | null>(null);

  useEffect(() => {
    const fetchStaffId = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", user.id)
        .single();
      setStaffId(data?.id || null);
    };
    fetchStaffId();
  }, [user?.id]);

  const ideasQuery = useQuery({
    queryKey: ["admin-ideas", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_ideas")
        .select("*, staff:staff(first_name, last_name)")
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AdminIdea[];
    },
    enabled: !!staffId,
  });

  const createIdea = useMutation({
    mutationFn: async (input: CreateIdeaInput) => {
      if (!staffId) throw new Error("No staff ID");
      const { data, error } = await supabase
        .from("admin_ideas")
        .insert({
          staff_id: staffId,
          title: input.title,
          content: input.content || "",
          category: input.category || "note",
          priority: input.priority || "medium",
          is_checklist: input.is_checklist || false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-ideas"] }),
  });

  const updateIdea = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AdminIdea> & { id: string }) => {
      const { error } = await supabase
        .from("admin_ideas")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-ideas"] });
      const prev = queryClient.getQueryData<AdminIdea[]>(["admin-ideas", staffId]);
      if (prev) {
        queryClient.setQueryData<AdminIdea[]>(
          ["admin-ideas", staffId],
          prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
        );
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["admin-ideas", staffId], context.prev);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin-ideas"] }),
  });

  const deleteIdea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_ideas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-ideas"] }),
  });

  const uncompleteCount = (ideasQuery.data || []).filter(
    (i) => i.is_checklist && !i.completed
  ).length;

  return { ideas: ideasQuery.data || [], isLoading: ideasQuery.isLoading, createIdea, updateIdea, deleteIdea, uncompleteCount, staffId };
}
