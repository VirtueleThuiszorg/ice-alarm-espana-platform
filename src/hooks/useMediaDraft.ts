import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export interface MediaDraftOutput {
  research: {
    topic_insights: string;
    audience_insights: string;
    trending_angles: string;
    competitor_notes: string;
  };
  post_en: string;
  post_es: string;
  image_text: {
    headline: string;
    subheadline: string;
    cta: string;
  };
  hashtags_en: string[];
  hashtags_es: string[];
  compliance_notes: string;
}

interface GenerateMediaDraftParams {
  topic: string;
  goal: string;
  target_audience: string;
  language: "en" | "es" | "both";
  post_id?: string;
  workflow_type?: "research" | "write" | "full";
}

export function useMediaDraft() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastOutput, setLastOutput] = useState<MediaDraftOutput | null>(null);
  const { toast } = useToast();

  const generateDraft = async (params: GenerateMediaDraftParams): Promise<MediaDraftOutput | null> => {
    if (!params.topic) {
      toast({
        title: i18n.t("mediaManager.ai.topicRequired"),
        description: i18n.t("mediaManager.ai.topicRequiredDesc"),
        variant: "destructive",
      });
      return null;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("media-draft", {
        body: params,
      });

      if (error) {
        console.error("Media draft error:", error);
        
        // Handle specific error codes
        if (error.message?.includes("429")) {
          toast({
            title: i18n.t("mediaManager.ai.rateLimited"),
            description: i18n.t("mediaManager.ai.rateLimitedDesc"),
            variant: "destructive",
          });
        } else if (error.message?.includes("402")) {
          toast({
            title: i18n.t("mediaManager.ai.creditsExhausted"),
            description: i18n.t("mediaManager.ai.creditsExhaustedDesc"),
            variant: "destructive",
          });
        } else {
          toast({
            title: i18n.t("mediaManager.ai.generationFailed"),
            description: error.message || i18n.t("mediaManager.ai.generationFailedDesc"),
            variant: "destructive",
          });
        }
        return null;
      }

      if (!data?.success) {
        toast({
          title: i18n.t("mediaManager.ai.generationFailed"),
          description: data?.error || i18n.t("mediaManager.ai.generationFailedDesc"),
          variant: "destructive",
        });
        return null;
      }

      const output = data.output as MediaDraftOutput;
      setLastOutput(output);

      toast({
        title: i18n.t("mediaManager.ai.contentGenerated"),
        description: i18n.t("mediaManager.ai.contentGeneratedDesc"),
      });

      return output;
    } catch (err) {
      console.error("Media draft error:", err);
      toast({
        title: i18n.t("common.error"),
        description: err instanceof Error ? err.message : i18n.t("mediaManager.ai.unknownError"),
        variant: "destructive",
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateDraft,
    isGenerating,
    lastOutput,
  };
}
