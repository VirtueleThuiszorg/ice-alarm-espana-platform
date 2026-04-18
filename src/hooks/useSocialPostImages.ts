import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export function useSocialPostImages() {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!file) return null;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: i18n.t("mediaManager.upload.invalidFileType"),
        description: i18n.t("mediaManager.upload.invalidFileTypeDesc"),
        variant: "destructive",
      });
      return null;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: i18n.t("mediaManager.upload.fileTooLarge"),
        description: i18n.t("mediaManager.upload.fileTooLargeDesc"),
        variant: "destructive",
      });
      return null;
    }

    setIsUploading(true);
    try {
      const extension = file.name.split(".").pop();
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("social-post-images")
        .upload(filename, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("social-post-images")
        .getPublicUrl(filename);

      return urlData.publicUrl;
    } catch (error: any) {
      toast({
        title: i18n.t("mediaManager.upload.uploadFailed"),
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const deleteImage = async (imageUrl: string): Promise<boolean> => {
    try {
      // Extract filename from URL
      const urlParts = imageUrl.split("/");
      const filename = urlParts[urlParts.length - 1];

      const { error } = await supabase.storage
        .from("social-post-images")
        .remove([filename]);

      if (error) throw error;
      return true;
    } catch (error: any) {
      toast({
        title: i18n.t("mediaManager.upload.deleteFailed"),
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    uploadImage,
    deleteImage,
    isUploading,
  };
}
