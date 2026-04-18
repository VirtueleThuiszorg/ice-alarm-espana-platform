import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type DocumentCategory = 'general' | 'member_guide' | 'staff' | 'device' | 'emergency' | 'partner';
export type DocumentStatus = 'draft' | 'published';
export type VisibilityType = 'admin' | 'staff' | 'member' | 'ai';

export interface Documentation {
  id: string;
  title: string;
  slug: string;
  category: DocumentCategory;
  content: string;
  visibility: VisibilityType[];
  importance: number;
  tags: string[];
  language: 'en' | 'es';
  status: DocumentStatus;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentInput {
  title: string;
  slug?: string;
  category: DocumentCategory;
  content: string;
  visibility: VisibilityType[];
  importance?: number;
  tags?: string[];
  language?: 'en' | 'es';
  status?: DocumentStatus;
}

export interface UpdateDocumentInput extends Partial<CreateDocumentInput> {
  id: string;
}

const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 100);
};

export function useDocumentation(filters?: {
  category?: DocumentCategory;
  status?: DocumentStatus;
  language?: 'en' | 'es';
  visibility?: VisibilityType;
  search?: string;
}) {
  return useQuery({
    queryKey: ['documentation', filters],
    queryFn: async () => {
      let query = supabase
        .from('documentation')
        .select('*')
        .order('updated_at', { ascending: false });

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.language) {
        query = query.eq('language', filters.language);
      }
      if (filters?.visibility) {
        query = query.contains('visibility', [filters.visibility]);
      }
      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Documentation[];
    },
  });
}

export function useDocumentById(id: string | null) {
  return useQuery({
    queryKey: ['documentation', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('documentation')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Documentation;
    },
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateDocumentInput) => {
      // Get current staff ID
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .single();

      const slug = input.slug || generateSlug(input.title);
      
      const { data, error } = await supabase
        .from('documentation')
        .insert({
          title: input.title,
          slug,
          category: input.category,
          content: input.content,
          visibility: input.visibility,
          importance: input.importance ?? 5,
          tags: input.tags ?? [],
          language: input.language ?? 'en',
          status: input.status ?? 'draft',
          created_by: staff?.id,
          updated_by: staff?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Documentation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentation'] });
      toast({
        title: "Document created",
        description: "The document has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateDocumentInput) => {
      const { id, ...updates } = input;

      // Get current staff ID
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .single();

      // Get current version to increment
      const { data: current } = await supabase
        .from('documentation')
        .select('version')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('documentation')
        .update({
          ...updates,
          updated_by: staff?.id,
          version: (current?.version ?? 0) + 1,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Documentation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentation'] });
      toast({
        title: "Document updated",
        description: "The document has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documentation')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentation'] });
      toast({
        title: "Document deleted",
        description: "The document has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
