import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  status: "active" | "coming_soon" | "inactive";
  category: string | null;
  display_order: number;
  hero_image_url: string | null;
  selling_price_net: number;
  selling_tax_rate: number;
  name_i18n: Record<string, string>;
  short_description_i18n: Record<string, string>;
  long_description_i18n: Record<string, string>;
  features_i18n: Record<string, string[]>;
}

export function useProductCatalog() {
  return useQuery({
    queryKey: ["product-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, status, category, display_order, hero_image_url, selling_price_net, selling_tax_rate, name_i18n, short_description_i18n, long_description_i18n, features_i18n")
        .in("status", ["active", "coming_soon"])
        .order("display_order");

      if (error) throw error;
      return data as CatalogProduct[];
    },
  });
}

export function useProductBySlug(slug: string) {
  return useQuery({
    queryKey: ["product-catalog", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, status, category, display_order, hero_image_url, selling_price_net, selling_tax_rate, name_i18n, short_description_i18n, long_description_i18n, features_i18n")
        .eq("slug", slug)
        .in("status", ["active", "coming_soon"])
        .single();

      if (error) throw error;
      return data as CatalogProduct;
    },
    enabled: !!slug,
  });
}

export function getLocalizedField(
  field: Record<string, string> | Record<string, string[]> | null | undefined,
  locale: string
): string | string[] | undefined {
  if (!field) return undefined;
  return field[locale] ?? field["en"];
}
