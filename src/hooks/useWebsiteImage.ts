import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface WebsiteImage {
  id: string;
  location_key: string;
  image_url: string;
  alt_text: string | null;
  updated_at: string;
}

/**
 * Fetch a single website image - returns only custom uploaded images, no defaults.
 */
export function useWebsiteImage(locationKey: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["website-image", locationKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_images")
        .select("*")
        .eq("location_key", locationKey)
        .maybeSingle();
      
      if (error) throw error;
      return data as WebsiteImage | null;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes cache
    gcTime: 1000 * 60 * 60, // 1 hour garbage collection
  });

  return {
    imageUrl: data?.image_url || null,
    altText: data?.alt_text || "",
    isLoading,
    error,
    hasCustomImage: !!data?.image_url,
  };
}

/**
 * Batch fetch all website images in a single query.
 * Use this when a page needs multiple images to reduce network requests.
 */
export function useWebsiteImagesBatch(locationKeys: string[]) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["website-images-batch", locationKeys.sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_images")
        .select("*")
        .in("location_key", locationKeys);
      
      if (error) throw error;
      
      // Return as a map for easy access
      const imageMap: Record<string, WebsiteImage> = {};
      (data || []).forEach((img: WebsiteImage) => {
        imageMap[img.location_key] = img;
      });
      return imageMap;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes cache
    gcTime: 1000 * 60 * 60, // 1 hour garbage collection
    enabled: locationKeys.length > 0,
  });

  // Helper to get a specific image from the batch - no defaults
  const getImage = (locationKey: string) => {
    const customImage = data?.[locationKey];
    return {
      imageUrl: customImage?.image_url || null,
      altText: customImage?.alt_text || "",
      hasCustomImage: !!customImage?.image_url,
    };
  };

  return {
    images: data || {},
    getImage,
    isLoading,
    error,
  };
}

/**
 * Fetch all website images for admin management.
 */
export function useWebsiteImages() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["website-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_images")
        .select("*")
        .order("location_key");
      
      if (error) throw error;
      return (data || []) as WebsiteImage[];
    },
    staleTime: 1000 * 60 * 30, // 30 minutes cache
    gcTime: 1000 * 60 * 60, // 1 hour garbage collection
  });

  return {
    images: data || [],
    isLoading,
    error,
    refetch,
  };
}
