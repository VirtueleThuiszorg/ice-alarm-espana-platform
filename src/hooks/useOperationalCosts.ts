import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type CostCategory = Database["public"]["Enums"]["cost_category"];
type CostFrequency = Database["public"]["Enums"]["cost_frequency"];
type CostStatus = Database["public"]["Enums"]["cost_status"];

export interface OperationalCost {
  id: string;
  name: string;
  category: CostCategory;
  amount: number;
  frequency: CostFrequency;
  due_date: string | null;
  paid_at: string | null;
  status: CostStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationalCostInput {
  name: string;
  category: CostCategory;
  amount: number;
  frequency: CostFrequency;
  due_date?: string;
  status?: CostStatus;
  notes?: string;
}

export function useOperationalCosts(filters?: { status?: CostStatus; category?: CostCategory }) {
  return useQuery({
    queryKey: ["operational-costs", filters],
    queryFn: async () => {
      let query = supabase
        .from("operational_costs")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
      
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as OperationalCost[];
    },
  });
}

export function useCreateOperationalCost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: OperationalCostInput) => {
      const { data, error } = await supabase
        .from("operational_costs")
        .insert(input)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-costs"] });
      toast.success("Cost added successfully");
    },
    onError: (error) => {
      toast.error(`Failed to add cost: ${error.message}`);
    },
  });
}

export function useUpdateOperationalCost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<OperationalCostInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("operational_costs")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-costs"] });
      toast.success("Cost updated successfully");
    },
    onError: (error) => {
      toast.error(`Failed to update cost: ${error.message}`);
    },
  });
}

export function useMarkCostPaid() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("operational_costs")
        .update({ 
          status: "paid" as CostStatus, 
          paid_at: new Date().toISOString() 
        })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-costs"] });
      toast.success("Cost marked as paid");
    },
    onError: (error) => {
      toast.error(`Failed to update cost: ${error.message}`);
    },
  });
}

export function useDeleteOperationalCost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("operational_costs")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-costs"] });
      toast.success("Cost deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete cost: ${error.message}`);
    },
  });
}

// Get pending costs total
export function usePendingCostsTotal() {
  return useQuery({
    queryKey: ["operational-costs", "pending-total"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operational_costs")
        .select("amount")
        .in("status", ["pending", "overdue"]);
      
      if (error) throw error;
      return data.reduce((sum, cost) => sum + Number(cost.amount), 0);
    },
  });
}
