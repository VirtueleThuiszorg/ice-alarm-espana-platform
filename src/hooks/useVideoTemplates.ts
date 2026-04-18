import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface VideoTemplate {
  id: string;
  name: string;
  description: string | null;
  version: number;
  schema_json: Record<string, unknown>;
  allowed_formats: string[];
  allowed_durations: number[];
  thumbnail_url: string | null;
  is_locked: boolean;
  created_at: string;
}

export function useVideoTemplates() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["video-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_templates")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as VideoTemplate[];
    },
  });

  return {
    templates,
    isLoading,
  };
}
