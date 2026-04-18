import pendantHeroDefault from "@/assets/pendant-product.png";
import pendantSpecsDefault from "@/assets/pendant-specs.png";

export interface WebsiteImageConfig {
  locationKey: string;
  title: string;
  description: string;
  defaultAsset: string;
  aspectRatio: "video" | "square" | "landscape";
  usedIn: string[];
}

/**
 * Centralized registry of all website images.
 * 
 * To add a new image:
 * 1. Add an entry here with a unique locationKey
 * 2. Use useWebsiteImage(locationKey, defaultAsset) in your component
 * 3. The image will automatically appear in Admin Settings → Images tab
 */
export const WEBSITE_IMAGE_CONFIGS: WebsiteImageConfig[] = [
  {
    locationKey: "homepage_hero",
    title: "Homepage Hero Image",
    description: "Main hero image on landing page. Recommended: 1200x900px (4:3 aspect ratio)",
    defaultAsset: pendantHeroDefault,
    aspectRatio: "landscape",
    usedIn: ["LandingPage"],
  },
  {
    locationKey: "pendant_hero",
    title: "Pendant Page Hero",
    description: "Main product image on pendant page. Recommended: 800x800px (square)",
    defaultAsset: pendantHeroDefault,
    aspectRatio: "square",
    usedIn: ["PendantPage"],
  },
  {
    locationKey: "pendant_specs",
    title: "Pendant Specs Image",
    description: "Specifications section image on pendant page. Recommended: 600x600px (square)",
    defaultAsset: pendantSpecsDefault,
    aspectRatio: "square",
    usedIn: ["PendantPage"],
  },
  {
    locationKey: "homepage_pendant_promo",
    title: "Homepage Pendant Promo Image",
    description: "Product image in the pendant promotional section on homepage. Recommended: 400x400px (square)",
    defaultAsset: pendantHeroDefault,
    aspectRatio: "square",
    usedIn: ["LandingPage"],
  },
  {
    locationKey: "chat_avatar",
    title: "AI Chat Assistant Avatar",
    description: "Avatar image for the AI chat widget. Recommended: 80x80px (square). Used in the customer support chat bubble.",
    defaultAsset: pendantHeroDefault,
    aspectRatio: "square",
    usedIn: ["ChatWidget"],
  },
];

/**
 * Get a specific image config by location key
 */
export function getImageConfig(locationKey: string): WebsiteImageConfig | undefined {
  return WEBSITE_IMAGE_CONFIGS.find(config => config.locationKey === locationKey);
}

/**
 * Get the default asset for a location key
 */
export function getDefaultAsset(locationKey: string): string {
  const config = getImageConfig(locationKey);
  return config?.defaultAsset || pendantHeroDefault;
}
