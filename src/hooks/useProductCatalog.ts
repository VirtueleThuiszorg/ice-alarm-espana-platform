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
        // A CATALOG PRODUCT HAS A SLUG. `products` also holds three rows that are not products
        // at all — 'GPS Pendant', 'Registration Fee' and 'Shipping', seeded by 20260123114307 as
        // price entries before `pricing_settings` existed. When 20260420090000 added
        // `status TEXT NOT NULL DEFAULT 'active'`, all three became visible to this query, so the
        // public site has been listing "Shipping" and "Registration Fee" as things to browse —
        // each rendering `<Link to={`/products/${slug}`}>` with a null slug, i.e. /products/null.
        .not("slug", "is", null)
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
        // Same reasoning as the list query: a row without a slug is not addressable here at all,
        // and `.eq("slug", "null")` from a /products/null link must not match one.
        .not("slug", "is", null)
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
