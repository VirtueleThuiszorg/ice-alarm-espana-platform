import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Image as ImageIcon, RotateCcw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ImageUploadCardProps {
  locationKey: string;
  title: string;
  description: string;
  currentImageUrl?: string;
  defaultImageUrl: string;
  onImageUpdated: () => void;
  aspectRatio?: "video" | "square" | "landscape";
}

export function ImageUploadCard({
  locationKey,
  title,
  description,
  currentImageUrl,
  defaultImageUrl,
  onImageUpdated,
  aspectRatio = "video",
}: ImageUploadCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const displayUrl = previewUrl || currentImageUrl || defaultImageUrl;
  const hasCustomImage = !!currentImageUrl;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPG, PNG, or WebP image.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Generate unique filename
      const extension = selectedFile.name.split(".").pop();
      const filename = `${locationKey}_${Date.now()}.${extension}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("website-images")
        .upload(filename, selectedFile, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("website-images")
        .getPublicUrl(filename);

      // Check if entry exists
      const { data: existing } = await supabase
        .from("website_images")
        .select("id")
        .eq("location_key", locationKey)
        .maybeSingle();

      if (existing) {
        // Update existing entry
        const { error: updateError } = await supabase
          .from("website_images")
          .update({
            image_url: urlData.publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("location_key", locationKey);

        if (updateError) throw updateError;
      } else {
        // Insert new entry
        const { error: insertError } = await supabase
          .from("website_images")
          .insert({
            location_key: locationKey,
            image_url: urlData.publicUrl,
            alt_text: title,
          });

        if (insertError) throw insertError;
      }

      // Invalidate all image-related caches so public pages refresh immediately
      queryClient.invalidateQueries({ queryKey: ["website-image", locationKey] });
      queryClient.invalidateQueries({ queryKey: ["website-images"] });

      toast({
        title: "Image updated",
        description: `${title} has been updated successfully.`,
      });

      setSelectedFile(null);
      setPreviewUrl(null);
      onImageUpdated();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = async () => {
    setIsUploading(true);
    try {
      // Delete the database entry (image will remain in storage but won't be used)
      const { error } = await supabase
        .from("website_images")
        .delete()
        .eq("location_key", locationKey);

      if (error) throw error;

      // Invalidate all image-related caches so public pages refresh immediately
      queryClient.invalidateQueries({ queryKey: ["website-image", locationKey] });
      queryClient.invalidateQueries({ queryKey: ["website-images"] });

      toast({
        title: "Reset to default",
        description: `${title} has been reset to the default image.`,
      });

      setSelectedFile(null);
      setPreviewUrl(null);
      onImageUpdated();
    } catch (error: any) {
      toast({
        title: "Reset failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const cancelPreview = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {hasCustomImage && (
            <Badge variant="outline" className="bg-status-active/10 text-status-active border-status-active/20">
              <Check className="mr-1 h-3 w-3" />
              Custom
            </Badge>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Image Preview */}
        <div className={`relative rounded-lg overflow-hidden border bg-muted ${
          aspectRatio === "square" ? "aspect-square" : 
          aspectRatio === "landscape" ? "aspect-[4/3]" : 
          "aspect-video"
        }`}>
          <img
            src={displayUrl}
            alt={title}
            className="w-full h-full object-cover object-center"
          />
          {previewUrl && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-primary">Preview</Badge>
            </div>
          )}
        </div>

        {/* Upload Controls */}
        <div className="space-y-3">
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            id={`upload-${locationKey}`}
          />
          
          <div className="flex gap-2">
            {selectedFile ? (
              <>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex-1"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Save Image
                </Button>
                <Button
                  variant="outline"
                  onClick={cancelPreview}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Change Image
                </Button>
                {hasCustomImage && (
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Recommended: JPG, PNG, or WebP. Max 5MB.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
