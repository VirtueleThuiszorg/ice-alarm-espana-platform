import React from "react";
import { useWebsiteImages } from "@/hooks/useWebsiteImage";
import { WEBSITE_IMAGE_CONFIGS } from "@/config/websiteImages";
import { ImageUploadCard } from "./ImageUploadCard";
import { Loader2, Image as ImageIcon } from "lucide-react";

export const ImagesSettingsTab = React.forwardRef<HTMLDivElement, object>(
  function ImagesSettingsTab(_props, ref) {
    const { images, isLoading, refetch } = useWebsiteImages();

    if (isLoading) {
      return (
        <div ref={ref} className="flex flex-col items-center justify-center p-12 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading image settings...</p>
        </div>
      );
    }

    return (
      <div ref={ref} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {WEBSITE_IMAGE_CONFIGS.map((config) => {
            const customImage = images.find(img => img.location_key === config.locationKey);
            
            return (
              <ImageUploadCard
                key={config.locationKey}
                locationKey={config.locationKey}
                title={config.title}
                description={config.description}
                currentImageUrl={customImage?.image_url}
                defaultImageUrl={config.defaultAsset}
                aspectRatio={config.aspectRatio}
                onImageUpdated={refetch}
              />
            );
          })}
        </div>
        
        {WEBSITE_IMAGE_CONFIGS.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg">
            <ImageIcon className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No images configured</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Configure images in websiteImages.ts to manage them here.
            </p>
          </div>
        )}
      </div>
    );
  }
);
