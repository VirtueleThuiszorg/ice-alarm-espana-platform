import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  selling_price_net: number;
  selling_tax_rate: number;
  cost_price: number;
  supplier_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  name: string;
  sku?: string;
  description?: string;
  selling_price_net: number;
  selling_tax_rate: number;
  cost_price: number;
  supplier_name?: string;
  is_active?: boolean;
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data as Product[];
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const { data, error } = await supabase
        .from("products")
        .insert(input)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create product: ${error.message}`);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...input }: ProductInput & { id: string }) => {
      const { data, error } = await supabase
        .from("products")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated successfully");
    },
    onError: (error) => {
      toast.error(`Failed to update product: ${error.message}`);
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete product: ${error.message}`);
    },
  });
}

// Calculate derived values
export function calculateProductMargin(product: Product) {
  const sellingFinal = product.selling_price_net * (1 + product.selling_tax_rate);
  const margin = product.selling_price_net - product.cost_price;
  const marginPercent = product.selling_price_net > 0 
    ? (margin / product.selling_price_net) * 100 
    : 0;
  
  return {
    sellingFinal,
    margin,
    marginPercent,
  };
}
