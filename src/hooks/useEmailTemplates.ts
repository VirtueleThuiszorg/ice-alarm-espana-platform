import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  module: "member" | "outreach" | "support" | "system";
  subject_en: string;
  subject_es: string;
  body_html_en: string;
  body_html_es: string;
  body_text_en: string | null;
  body_text_es: string | null;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateUpdate {
  name?: string;
  description?: string | null;
  subject_en?: string;
  subject_es?: string;
  body_html_en?: string;
  body_html_es?: string;
  body_text_en?: string | null;
  body_text_es?: string | null;
  variables?: string[];
  is_active?: boolean;
}

export function useEmailTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: templates,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async (): Promise<EmailTemplate[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("module")
        .order("name");

      if (error) throw error;

      return (data || []).map((t: any) => ({
        ...t,
        variables: Array.isArray(t.variables) ? t.variables : [],
      }));
    },
    refetchOnWindowFocus: false,
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: EmailTemplateUpdate }) => {
      const { data, error } = await supabase
        .from("email_templates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({
        title: "Template saved",
        description: "The email template has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleTemplateMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from("email_templates")
        .update({ is_active: isActive })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({
        title: data.is_active ? "Template activated" : "Template deactivated",
        description: `Template "${data.name}" has been ${data.is_active ? "activated" : "deactivated"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    templates,
    isLoading,
    error,
    updateTemplate: updateTemplateMutation.mutate,
    isUpdating: updateTemplateMutation.isPending,
    toggleTemplate: toggleTemplateMutation.mutate,
    isToggling: toggleTemplateMutation.isPending,
  };
}
