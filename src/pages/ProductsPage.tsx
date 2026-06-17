import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProductCatalog, getLocalizedField } from "@/hooks/useProductCatalog";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, MapPin, Pill, Activity } from "lucide-react";
import { NotifyInterestDialog } from "@/components/products/NotifyInterestDialog";

const categoryIcons: Record<string, typeof MapPin> = {
  Emergency: MapPin,
  Medication: Pill,
  "Health Monitoring": Activity,
};

export default function ProductsPage() {
  const { t, i18n } = useTranslation();
  const { data: products, isLoading, error } = useProductCatalog();
  const locale = i18n.language?.split("-")[0] || "en";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 font-[Poppins]">
              {t("products.title", "Our Products")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("products.subtitle", "Connected health devices that keep you safe and your family informed. All integrated into the Care Conneqt platform.")}
            </p>
          </div>

          {error && (
            <p className="text-center text-destructive mb-8">
              {t("products.loadError", "Unable to load products. Please try again later.")}
            </p>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products?.map((product) => {
              const Icon = categoryIcons[product.category ?? ""] ?? MapPin;
              const isComingSoon = product.status === "coming_soon";
              const name = getLocalizedField(product.name_i18n, locale) as string ?? product.name;
              const shortDesc = getLocalizedField(product.short_description_i18n, locale) as string ?? "";
              const price = product.selling_price_net > 0
                ? `€${(product.selling_price_net * (1 + product.selling_tax_rate)).toFixed(2)}`
                : null;

              return (
                <Link key={product.id} to={`/products/${product.slug}`} className="group">
                  <Card className={`h-full overflow-hidden transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1 ${isComingSoon ? "opacity-90" : ""}`}>
                    <div className="relative">
                      <div className={`aspect-[4/3] bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center overflow-hidden ${isComingSoon ? "grayscale-[30%]" : ""}`}>
                        {product.hero_image_url ? (
                          <img
                            src={product.hero_image_url}
                            alt={name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Icon className="h-16 w-16 text-muted-foreground/40" />
                        )}
                      </div>
                      {isComingSoon && (
                        <Badge className="absolute top-4 right-4 bg-brand-teal text-white border-0 text-sm px-3 py-1" style={{ backgroundColor: "hsl(185, 75%, 45%)" }}>
                          {t("products.comingSoon", "Coming Soon")}
                        </Badge>
                      )}
                      {product.category && (
                        <Badge variant="secondary" className="absolute top-4 left-4 text-xs">
                          {product.category}
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-6">
                      <h3 className="text-xl font-bold mb-2 font-[Poppins] group-hover:text-primary transition-colors">
                        {name}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                        {shortDesc}
                      </p>
                      <div className="flex items-center justify-between">
                        {isComingSoon ? (
                          <NotifyInterestDialog productName={name} />
                        ) : (
                          <>
                            {price && (
                              <span className="text-lg font-bold text-primary">{price}</span>
                            )}
                            <Button variant="ghost" size="sm" className="gap-1 text-primary">
                              {t("products.learnMore", "Learn more")} <ArrowRight className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} Care Conneqt. Connected Health. Human Care.</p>
      </footer>
    </div>
  );
}
