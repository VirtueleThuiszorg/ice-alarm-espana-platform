import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import i18n from "@/i18n";

export type ImageStyle = 
  | "senior_active" 
  | "family_peace" 
  | "pendant_focus" 
  | "spanish_lifestyle" 
  | "independence" 
  | "peace_of_mind"
  | "from_post_text"
  // New variety styles
  | "social_connection"
  | "daily_routine"
  | "outdoor_adventure"
  | "home_comfort"
  | "technology_simple"
  | "surprise_me";

export const IMAGE_STYLE_OPTIONS: { value: ImageStyle; labelKey: string }[] = [
  { value: "from_post_text", labelKey: "mediaManager.imageStyles.fromPostText" },
  { value: "surprise_me", labelKey: "mediaManager.imageStyles.surpriseMe" },
  { value: "senior_active", labelKey: "mediaManager.imageStyles.seniorActive" },
  { value: "family_peace", labelKey: "mediaManager.imageStyles.familyPeace" },
  { value: "pendant_focus", labelKey: "mediaManager.imageStyles.pendantFocus" },
  { value: "spanish_lifestyle", labelKey: "mediaManager.imageStyles.spanishLifestyle" },
  { value: "independence", labelKey: "mediaManager.imageStyles.independence" },
  { value: "peace_of_mind", labelKey: "mediaManager.imageStyles.peaceOfMind" },
  { value: "social_connection", labelKey: "mediaManager.imageStyles.socialConnection" },
  { value: "daily_routine", labelKey: "mediaManager.imageStyles.dailyRoutine" },
  { value: "outdoor_adventure", labelKey: "mediaManager.imageStyles.outdoorAdventure" },
  { value: "home_comfort", labelKey: "mediaManager.imageStyles.homeComfort" },
  { value: "technology_simple", labelKey: "mediaManager.imageStyles.technologySimple" },
];

interface ImageTextData {
  headline?: string;
  subheadline?: string;
  cta?: string;
}

interface GenerateAIImageOptions {
  style: ImageStyle;
  topic?: string;
  imageText?: ImageTextData;
  postId?: string;
  postText?: string;
}

interface GenerateAIImageResult {
  success: boolean;
  image_url?: string;
  message?: string;
  error?: string;
}

export function useAIImageGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const generateImage = useCallback(async (options: GenerateAIImageOptions): Promise<string | null> => {
    const { style, topic, imageText, postId, postText } = options;

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke<GenerateAIImageResult>(
        "generate-ai-image",
        {
          body: {
            style,
            topic,
            image_text: imageText,
            post_id: postId,
            post_text: postText,
          },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success || !data.image_url) {
        throw new Error(data?.error || "Failed to generate image");
      }

      toast({
        title: i18n.t("ai.imageGenerated"),
        description: i18n.t("ai.imageGeneratedDesc"),
      });

      return data.image_url;
    } catch (error: unknown) {
      console.error("AI image generation error:", error);
      
      const errorMessage = error instanceof Error ? error.message : i18n.t("ai.generationFailed");
      
      // Handle specific error cases
      if (errorMessage.includes("429") || errorMessage.includes("Rate limit")) {
        toast({
          title: i18n.t("ai.rateLimited"),
          description: i18n.t("ai.rateLimitedDesc"),
          variant: "destructive",
        });
      } else if (errorMessage.includes("402") || errorMessage.includes("credits")) {
        toast({
          title: i18n.t("ai.creditsExhausted"),
          description: i18n.t("ai.creditsExhaustedDesc"),
          variant: "destructive",
        });
      } else {
        toast({
          title: i18n.t("ai.generationFailed"),
          description: errorMessage,
          variant: "destructive",
        });
      }
      
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [toast]);

  return {
    generateImage,
    isGenerating,
  };
}
