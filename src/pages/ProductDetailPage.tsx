import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProductBySlug, getLocalizedField } from "@/hooks/useProductCatalog";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NotifyInterestDialog } from "@/components/products/NotifyInterestDialog";
import {
  Loader2, ArrowLeft, Check, Bell, ArrowRight,
  MapPin, Pill, Activity,
} from "lucide-react";

const categoryIcons: Record<string, typeof MapPin> = {
  Emergency: MapPin,
  Medication: Pill,
  "Health Monitoring": Activity,
};

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { i18n } = useTranslation();
  const { data: product, isLoading, error } = useProductBySlug(slug ?? "");
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

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <h1 className="text-2xl font-bold">Product not found</h1>
          <Link to="/pendant">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Products
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isComingSoon = product.status === "coming_soon";
  const name = getLocalizedField(product.name_i18n, locale) as string ?? product.name;
  const longDesc = getLocalizedField(product.long_description_i18n, locale) as string ?? "";
  const shortDesc = getLocalizedField(product.short_description_i18n, locale) as string ?? "";
  const features = (getLocalizedField(product.features_i18n, locale) as string[]) ?? [];
  const Icon = categoryIcons[product.category ?? ""] ?? MapPin;
  const price = product.selling_price_net > 0
    ? `€${(product.selling_price_net * (1 + product.selling_tax_rate)).toFixed(2)}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="py-12 px-4">
        <div className="container mx-auto max-w-5xl">
          <Link to="/pendant" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" /> All Products
          </Link>

          <div className="grid md:grid-cols-2 gap-12 items-start">
            {/* Hero image */}
            <div className="relative">
              <div className={`aspect-square rounded-2xl bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center overflow-hidden shadow-lg ${isComingSoon ? "grayscale-[20%]" : ""}`}>
                {product.hero_image_url ? (
                  <img
                    src={product.hero_image_url}
                    alt={name}
                    className="w-full h-full object-cover rounded-2xl"
                    loading="eager"
                  />
                ) : (
                  <Icon className="h-24 w-24 text-muted-foreground/30" />
                )}
              </div>
              {isComingSoon && (
                <Badge className="absolute top-6 right-6 text-base px-4 py-2 bg-brand-teal text-white border-0 shadow-lg" style={{ backgroundColor: "hsl(185, 75%, 45%)" }}>
                  Coming Soon
                </Badge>
              )}
            </div>

            {/* Content */}
            <div>
              {product.category && (
                <Badge variant="secondary" className="mb-4">{product.category}</Badge>
              )}
              <h1 className="text-3xl md:text-4xl font-bold mb-4 font-[Poppins]">
                {name}
              </h1>
              <p className="text-lg text-muted-foreground mb-6">
                {shortDesc}
              </p>

              {!isComingSoon && price && (
                <div className="mb-6">
                  <span className="text-3xl font-bold text-primary">{price}</span>
                  <span className="text-sm text-muted-foreground ml-2">incl. IVA</span>
                </div>
              )}

              {isComingSoon && (
                <Card className="mb-6 border-dashed" style={{ borderColor: "hsl(185, 75%, 45%)" }}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Bell className="h-5 w-5 flex-shrink-0" style={{ color: "hsl(185, 75%, 45%)" }} />
                    <div>
                      <p className="font-semibold text-sm">Coming Soon</p>
                      <p className="text-xs text-muted-foreground">
                        This product is in development. Register your interest and we'll notify you when it launches.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {isComingSoon ? (
                <NotifyInterestDialog productName={name} size="default" variant="default" />
              ) : (
                <Link to="/join">
                  <Button size="lg" className="w-full md:w-auto gap-2">
                    Get Started <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Long description + features */}
          <div className="mt-16 grid md:grid-cols-5 gap-12">
            <div className="md:col-span-3">
              <h2 className="text-2xl font-bold mb-4 font-[Poppins]">About this product</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {longDesc}
              </p>
            </div>
            {features.length > 0 && (
              <div className="md:col-span-2">
                <h2 className="text-2xl font-bold mb-4 font-[Poppins]">Key Features</h2>
                <ul className="space-y-3">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-muted-foreground border-t mt-16">
        <p>&copy; {new Date().getFullYear()} ICE Alarm España. Siempre responde alguien.</p>
      </footer>
    </div>
  );
}
