import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePublicTestimonials } from "@/hooks/useTestimonials";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Logo } from "@/components/ui/logo";
import { ImageWithPlaceholder } from "@/components/ui/image-placeholder";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  Phone,
  MapPin,
  Shield,
  Mic,
  AlertTriangle,
  Battery,
  Navigation,
  Check,
  Star,
  Users,
  Zap,
  Droplets,
  Signal
} from "lucide-react";
import { useWebsiteImagesBatch } from "@/hooks/useWebsiteImage";
import { useCompanySettings } from "@/hooks/useCompanySettings";

export default function PendantPage() {
  const { t, i18n } = useTranslation();
  const { settings: companySettings } = useCompanySettings();
  const { data: dbTestimonials } = usePublicTestimonials("pendant");
  
  // Batch fetch all images in a single query
  const { getImage, isLoading: imagesLoading } = useWebsiteImagesBatch(["pendant_hero", "pendant_specs"]);
  const pendantHeroImage = getImage("pendant_hero");
  const pendantSpecsImage = getImage("pendant_specs");

  // Format phone for tel: links
  const phoneForLink = companySettings.emergency_phone.replace(/\s/g, '');
  const features = [
    {
      icon: MapPin,
      titleKey: "pendant.features.gps.title",
      descriptionKey: "pendant.features.gps.description",
      bullets: [
        "pendant.features.gps.bullet1",
        "pendant.features.gps.bullet2",
        "pendant.features.gps.bullet3"
      ]
    },
    {
      icon: Mic,
      titleKey: "pendant.features.voice.title",
      descriptionKey: "pendant.features.voice.description",
      bullets: [
        "pendant.features.voice.bullet1",
        "pendant.features.voice.bullet2",
        "pendant.features.voice.bullet3"
      ]
    },
    {
      icon: AlertTriangle,
      titleKey: "pendant.features.fall.title",
      descriptionKey: "pendant.features.fall.description",
      bullets: [
        "pendant.features.fall.bullet1",
        "pendant.features.fall.bullet2",
        "pendant.features.fall.bullet3"
      ]
    },
    {
      icon: Navigation,
      titleKey: "pendant.features.geofence.title",
      descriptionKey: "pendant.features.geofence.description",
      bullets: [
        "pendant.features.geofence.bullet1",
        "pendant.features.geofence.bullet2",
        "pendant.features.geofence.bullet3"
      ]
    },
    {
      icon: Battery,
      titleKey: "pendant.features.battery.title",
      descriptionKey: "pendant.features.battery.description",
      bullets: [
        "pendant.features.battery.bullet1",
        "pendant.features.battery.bullet2",
        "pendant.features.battery.bullet3"
      ]
    }
  ];

  const specs = [
    { labelKey: "pendant.specs.size", valueKey: "pendant.specs.sizeValue" },
    { labelKey: "pendant.specs.weight", valueKey: "pendant.specs.weightValue" },
    { labelKey: "pendant.specs.waterResistant", valueKey: "pendant.specs.waterResistantValue" },
    { labelKey: "pendant.specs.batteryLabel", valueKey: "pendant.specs.batteryValue" },
    { labelKey: "pendant.specs.connectivity", valueKey: "pendant.specs.connectivityValue" },
    { labelKey: "pendant.specs.sosButton", valueKey: "pendant.specs.sosButtonValue" },
    { labelKey: "pendant.specs.wearing", valueKey: "pendant.specs.wearingValue" }
  ];

  const testimonials = dbTestimonials && dbTestimonials.length > 0
    ? dbTestimonials.map((item) => ({
        id: item.id,
        quote: i18n.language === "es" ? item.quote_es : item.quote_en,
        author: item.author_name,
        location: i18n.language === "es" ? item.location_es : item.location_en,
        rating: item.rating,
      }))
    : [
        { id: "fb-1", quote: t("pendant.testimonials.quote1"), author: t("pendant.testimonials.author1"), location: t("pendant.testimonials.location1"), rating: 5 },
        { id: "fb-2", quote: t("pendant.testimonials.quote2"), author: t("pendant.testimonials.author2"), location: t("pendant.testimonials.location2"), rating: 5 },
        { id: "fb-3", quote: t("pendant.testimonials.quote3"), author: t("pendant.testimonials.author3"), location: t("pendant.testimonials.location3"), rating: 5 },
      ];

  const faqs = [
    { questionKey: "pendant.faq.q1", answerKey: "pendant.faq.a1" },
    { questionKey: "pendant.faq.q2", answerKey: "pendant.faq.a2" },
    { questionKey: "pendant.faq.q3", answerKey: "pendant.faq.a3" },
    { questionKey: "pendant.faq.q4", answerKey: "pendant.faq.a4" },
    { questionKey: "pendant.faq.q5", answerKey: "pendant.faq.a5" },
    { questionKey: "pendant.faq.q6", answerKey: "pendant.faq.a6" },
    { questionKey: "pendant.faq.q7", answerKey: "pendant.faq.a7" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Product Image */}
            <div className="relative order-2 lg:order-1">
              <div className="relative mx-auto max-w-md">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-3xl -z-10" />
                <div className="aspect-square overflow-hidden rounded-2xl shadow-2xl bg-muted">
                  <ImageWithPlaceholder
                    imageUrl={pendantHeroImage.imageUrl}
                    altText={pendantHeroImage.altText || "ICE Alarm GPS Personal Pendant"}
                    placeholderText="Product Image"
                    placeholderSubtext="Coming Soon"
                    priority={true}
                    width={500}
                    height={500}
                    isLoadingUrl={imagesLoading}
                  />
                </div>
                {/* Trust Badge */}
                <div className="absolute -bottom-4 -right-4 bg-card rounded-xl shadow-xl p-3 border">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-status-active/20 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-status-active" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">IP67</p>
                      <p className="text-xs text-muted-foreground">{t("pendant.hero.waterResistant")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-6 order-1 lg:order-2">
              <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                🇪🇸 {t("pendant.hero.badge")}
              </Badge>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                {t("pendant.hero.title")}
              </h1>
              
              <p className="text-xl text-muted-foreground">
                {t("pendant.hero.subtitle")}
              </p>

              <ul className="space-y-3">
                {[
                  t("pendant.hero.feature1"),
                  t("pendant.hero.feature2"),
                  t("pendant.hero.feature3"),
                  t("pendant.hero.feature4")
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-status-active/20 flex items-center justify-center shrink-0">
                      <Check className="h-4 w-4 text-status-active" />
                    </div>
                    <span className="font-medium">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button size="lg" className="h-14 px-8 text-lg shadow-lg" asChild>
                  <Link to="/join">
                    {t("pendant.hero.cta")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg" asChild>
                  <a href={`tel:${phoneForLink}`}>
                    <Phone className="mr-2 h-5 w-5" />
                    {t("common.callNow")}
                  </a>
                </Button>
              </div>

              <p className="text-muted-foreground">
                {t("pendant.hero.startingFrom")} <span className="font-bold text-foreground">€27.49{t("pendant.hero.perMonth")}</span> {t("pendant.hero.plusPendant")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("pendant.howItWorks.title")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("pendant.howItWorks.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: 1,
                icon: "👆",
                titleKey: "pendant.howItWorks.step1Title",
                descKey: "pendant.howItWorks.step1Desc"
              },
              {
                step: 2,
                icon: "📞",
                titleKey: "pendant.howItWorks.step2Title",
                descKey: "pendant.howItWorks.step2Desc"
              },
              {
                step: 3,
                icon: "🚑",
                titleKey: "pendant.howItWorks.step3Title",
                descKey: "pendant.howItWorks.step3Desc"
              }
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="relative inline-block mb-6">
                  <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center text-4xl">
                    {item.icon}
                  </div>
                  <div className="absolute -top-2 -left-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-3">{t(item.titleKey)}</h3>
                <p className="text-muted-foreground">{t(item.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("pendant.features.title")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("pendant.features.subtitle")}
            </p>
          </div>

          <div className="space-y-6 max-w-4xl mx-auto">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.titleKey} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-start gap-6">
                      <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-7 w-7 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold mb-3">{t(feature.titleKey)}</h3>
                        <p className="text-muted-foreground mb-4">{t(feature.descriptionKey)}</p>
                        <ul className="space-y-2">
                          {feature.bullets.map((bulletKey) => (
                            <li key={bulletKey} className="flex items-center gap-2 text-sm">
                              <Check className="h-4 w-4 text-status-active shrink-0" />
                              {t(bulletKey)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Specifications */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl font-bold mb-6">{t("pendant.specs.title")}</h2>
              <div className="grid gap-4">
                {specs.map((spec) => (
                  <div key={spec.labelKey} className="flex justify-between items-center py-3 border-b">
                    <span className="font-medium">{t(spec.labelKey)}</span>
                    <span className="text-muted-foreground">{t(spec.valueKey)}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-6">
                <Badge variant="outline" className="gap-1">
                  <Droplets className="h-3 w-3" />
                  {t("pendant.specs.badges.waterResistant")}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Signal className="h-3 w-3" />
                  {t("pendant.specs.badges.lte")}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Zap className="h-3 w-3" />
                  {t("pendant.specs.badges.fastCharging")}
                </Badge>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square max-w-sm mx-auto overflow-hidden rounded-2xl shadow-xl bg-muted">
                <ImageWithPlaceholder
                  imageUrl={pendantSpecsImage.imageUrl}
                  altText={pendantSpecsImage.altText || "ICE Alarm Pendant Specifications"}
                  placeholderText="Specifications Image"
                  placeholderSubtext="Coming Soon"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("pendant.pricing.title")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("pendant.pricing.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Single */}
            <Card>
              <CardContent className="p-8 text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{t("pendant.pricing.single.title")}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t("pendant.pricing.single.subtitle")}</p>
                <div className="space-y-2 mb-6">
                  <div>
                    <span className="text-2xl font-bold">€27.49</span>
                    <span className="text-muted-foreground">{t("pendant.pricing.single.perMonth")}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    or <span className="font-medium text-foreground">€274.89{t("pendant.pricing.single.perYear")}</span>
                    <Badge variant="secondary" className="ml-2">{t("pendant.pricing.single.save")}</Badge>
                  </div>
                </div>
                <Button className="w-full" asChild>
                  <Link to="/join">{t("pendant.pricing.getStarted")}</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Couple */}
            <Card className="border-primary">
              <CardContent className="p-8 text-center">
                <Badge className="bg-primary text-primary-foreground mb-4">{t("pendant.pricing.couple.mostPopular")}</Badge>
                <h3 className="text-xl font-semibold mb-2">{t("pendant.pricing.couple.title")}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t("pendant.pricing.couple.subtitle")}</p>
                <div className="space-y-2 mb-6">
                  <div>
                    <span className="text-2xl font-bold">€38.49</span>
                    <span className="text-muted-foreground">{t("pendant.pricing.couple.perMonth")}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    or <span className="font-medium text-foreground">€384.89{t("pendant.pricing.couple.perYear")}</span>
                    <Badge variant="secondary" className="ml-2">{t("pendant.pricing.couple.save")}</Badge>
                  </div>
                </div>
                <Button className="w-full" asChild>
                  <Link to="/join">{t("pendant.pricing.getStarted")}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>


      {/* Testimonials */}
      <section className="py-24 px-4 bg-gradient-to-b from-background to-muted/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">
              {t("pendant.testimonials.badge", "Trusted by Thousands")}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t("pendant.testimonials.title")}</h2>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="font-medium text-foreground">4.9/5</span>
              <span>•</span>
              <span>{t("pendant.testimonials.reviewCount", "2,000+ verified reviews")}</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.id}
                className="bg-card border shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                <CardContent className="p-8">
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <blockquote className="text-foreground leading-relaxed mb-6">
                    "{testimonial.quote}"
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold text-sm">
                        {testimonial.author.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{testimonial.author}</p>
                      <p className="text-sm text-muted-foreground">{testimonial.location}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("pendant.faq.title")}</h2>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">
                  {t(faq.questionKey)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t(faq.answerKey)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-20 px-4 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="container mx-auto text-center max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">{t("pendant.cta.title")}</h2>
          <p className="text-muted-foreground mb-8">
            {t("pendant.cta.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="h-14 px-8 text-lg" asChild>
              <Link to="/join">
                {t("pendant.cta.button")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-lg" asChild>
              <a href={`tel:${phoneForLink}`}>
                <Phone className="mr-2 h-5 w-5" />
                {t("common.callNow")}
              </a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            {t("pendant.cta.whatsapp")}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <Logo variant="white" size="sm" className="mb-4" />
              <p className="text-sm text-sidebar-foreground/70">
                {t("pendant.footer.description")}
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("pendant.footer.contact")}</h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li><a href={`tel:${companySettings.emergency_phone.replace(/\s/g, '')}`} className="hover:text-sidebar-foreground">{t("common.callNow")}</a></li>
                <li>{companySettings.support_email}</li>
                <li>{t("pendant.footer.whatsappAvailable")}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("pendant.footer.quickLinks")}</h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li><Link to="/" className="hover:text-sidebar-foreground">{t("pendant.footer.home")}</Link></li>
                <li><Link to="/pendant" className="hover:text-sidebar-foreground">{t("pendant.footer.pendant")}</Link></li>
                <li><Link to="/contact" className="hover:text-sidebar-foreground">{t("pendant.footer.contact")}</Link></li>
                <li><Link to="/join" className="hover:text-sidebar-foreground">{t("pendant.footer.joinNow")}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("pendant.footer.legal")}</h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li><Link to="/terms" className="hover:text-sidebar-foreground">{t("pendant.footer.termsOfService")}</Link></li>
                <li><Link to="/privacy" className="hover:text-sidebar-foreground">{t("pendant.footer.privacyPolicy")}</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-sidebar-border pt-8 text-center text-sm text-sidebar-foreground/60">
            <p>{t("pendant.footer.companyInfo")}</p>
            <p className="mt-1">© {new Date().getFullYear()} {companySettings.company_name}. {t("pendant.footer.allRightsReserved")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
