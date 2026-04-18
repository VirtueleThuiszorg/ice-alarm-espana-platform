import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VideoBrandSettings {
  id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  watermark_enabled: boolean;
  disclaimers_en: string | null;
  disclaimers_es: string | null;
  default_cta_en: string | null;
  default_cta_es: string | null;
  // Contact info
  phone_en: string | null;
  phone_es: string | null;
  whatsapp_en: string | null;
  whatsapp_es: string | null;
  web_url_en: string | null;
  web_url_es: string | null;
  // YouTube
  youtube_footer_en: string | null;
  youtube_footer_es: string | null;
  // Accessibility defaults
  captions_enabled_default: boolean;
  safe_margins_enabled: boolean;
  transition_style: string;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface UpdateSettingsData {
  logo_url?: string | null;
  watermark_enabled?: boolean;
  disclaimers_en?: string;
  disclaimers_es?: string;
  default_cta_en?: string;
  default_cta_es?: string;
  phone_en?: string;
  phone_es?: string;
  whatsapp_en?: string;
  whatsapp_es?: string;
  web_url_en?: string;
  web_url_es?: string;
  youtube_footer_en?: string;
  youtube_footer_es?: string;
  captions_enabled_default?: boolean;
  safe_margins_enabled?: boolean;
  transition_style?: string;
}

export function useVideoBrandSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["video-brand-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_brand_settings")
        .select("*")
        .limit(1)
        .maybeSingle(); // Use maybeSingle to avoid crash when no settings exist

      if (error) throw error;
      return data as VideoBrandSettings | null;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: UpdateSettingsData) => {
      if (!settings?.id) {
        // No settings exist yet — insert new row
        const { data, error } = await supabase
          .from("video_brand_settings")
          .insert(updates)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from("video_brand_settings")
        .update(updates)
        .eq("id", settings.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-brand-settings"] });
    },
  });

  return {
    settings,
    isLoading,
    updateSettings: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
