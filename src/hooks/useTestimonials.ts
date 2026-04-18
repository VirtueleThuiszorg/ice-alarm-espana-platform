import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Testimonial {
  id: string;
  quote_en: string;
  quote_es: string;
  author_name: string;
  location_en: string;
  location_es: string;
  rating: number;
  page: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestimonialFormData {
  quote_en: string;
  quote_es: string;
  author_name: string;
  location_en: string;
  location_es: string;
  rating: number;
  page: string;
  display_order: number;
  is_active: boolean;
}

export function useAdminTestimonials() {
  return useQuery({
    queryKey: ["admin-testimonials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("testimonials")
        .select("*")
        .order("page", { ascending: true })
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Testimonial[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function usePublicTestimonials(page: "landing" | "pendant") {
  return useQuery({
    queryKey: ["testimonials", page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("testimonials")
        .select("*")
        .eq("is_active", true)
        .or(`page.eq.${page},page.eq.both`)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Testimonial[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useTestimonialEditor() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
    queryClient.invalidateQueries({ queryKey: ["testimonials"] });
  };

  const createTestimonial = useMutation({
    mutationFn: async (data: TestimonialFormData) => {
      const { data: row, error } = await supabase
        .from("testimonials")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return row as Testimonial;
    },
    onSuccess: () => { invalidate(); toast.success("Testimonial created"); },
    onError: (e: Error) => { toast.error(`Failed to create: ${e.message}`); },
  });

  const updateTestimonial = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TestimonialFormData> }) => {
      const { data: row, error } = await supabase
        .from("testimonials")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return row as Testimonial;
    },
    onSuccess: () => { invalidate(); toast.success("Testimonial updated"); },
    onError: (e: Error) => { toast.error(`Failed to update: ${e.message}`); },
  });

  const deleteTestimonial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("testimonials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Testimonial deleted"); },
    onError: (e: Error) => { toast.error(`Failed to delete: ${e.message}`); },
  });

  return {
    createTestimonial: createTestimonial.mutateAsync,
    updateTestimonial: updateTestimonial.mutateAsync,
    deleteTestimonial: deleteTestimonial.mutateAsync,
    isCreating: createTestimonial.isPending,
    isUpdating: updateTestimonial.isPending,
    isDeleting: deleteTestimonial.isPending,
  };
}
