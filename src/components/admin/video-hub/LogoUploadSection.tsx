import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LogoUploadSectionProps {
  currentLogoUrl: string | null;
  onLogoChange: (url: string | null) => void;
  isUpdating: boolean;
}

export function LogoUploadSection({ 
  currentLogoUrl, 
  onLogoChange,
  isUpdating 
}: LogoUploadSectionProps) {
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error(t("videoHub.logo.selectImage"));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("videoHub.logo.maxSize"));
      return;
    }

    setIsUploading(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `video-hub-logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("website-images")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("website-images")
        .getPublicUrl(filePath);

      // Delete old logo file if replacing
      if (currentLogoUrl) {
        const oldPath = currentLogoUrl.split("/website-images/").pop();
        if (oldPath) {
          await supabase.storage.from("website-images").remove([oldPath]);
        }
      }

      onLogoChange(urlData.publicUrl);
      toast.success(t("videoHub.logo.uploaded"));
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || t("videoHub.logo.uploadFailed"));
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveLogo = async () => {
    // Delete file from storage
    if (currentLogoUrl) {
      const oldPath = currentLogoUrl.split("/website-images/").pop();
      if (oldPath) {
        await supabase.storage.from("website-images").remove([oldPath]);
      }
    }
    onLogoChange(null);
    toast.success(t("videoHub.logo.removed"));
  };

  const isLoading = isUploading || isUpdating;

  return (
    <div>
      <Label>{t("videoHub.settings.logo")}</Label>
      <div className="mt-2">
        {currentLogoUrl ? (
          <div className="relative inline-block">
            <div className="flex h-24 items-center justify-center rounded-lg border bg-background p-4">
              <img 
                src={currentLogoUrl} 
                alt="Brand Logo" 
                className="h-16 max-w-[200px] object-contain" 
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {t("videoHub.logo.change")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveLogo}
                disabled={isLoading}
                className="text-destructive hover:text-destructive"
              >
                <X className="mr-2 h-4 w-4" />
                {t("videoHub.logo.remove")}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex h-24 w-full max-w-[300px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/50 transition-colors hover:border-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <>
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {t("videoHub.logo.clickToUpload")}
                </span>
              </>
            )}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t("videoHub.logo.recommended")}
        </p>
      </div>
    </div>
  );
}
