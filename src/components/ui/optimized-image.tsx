import { useState, ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onError" | "onLoad"> {
  src: string;
  alt: string;
  fallback?: string;
  priority?: boolean;
  aspectRatio?: "square" | "video" | "auto";
}

export function OptimizedImage({ 
  src, 
  alt, 
  className,
  fallback,
  priority = false,
  aspectRatio = "auto",
  ...props 
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    auto: "",
  };

  if (hasError && fallback) {
    return (
      <img
        src={fallback}
        alt={alt}
        className={cn(aspectClasses[aspectRatio], className)}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...props}
      />
    );
  }

  if (hasError && !fallback) {
    return (
      <div 
        className={cn(
          "bg-muted flex items-center justify-center text-muted-foreground",
          aspectClasses[aspectRatio],
          className
        )}
        role="img"
        aria-label={alt}
      >
        <span className="text-xs">Image unavailable</span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", aspectClasses[aspectRatio], className)}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        {...props}
      />
    </div>
  );
}
