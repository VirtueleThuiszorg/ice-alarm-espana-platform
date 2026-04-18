import { useState, useEffect } from "react";
import { ArrowRight, Phone, Shield, Heart, Users, Check, Star, MapPin, Zap, Radio, Battery, AlertCircle, MessageCircle, Bot, ShieldCheck, Monitor, Headphones, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import { ImageWithPlaceholder } from "@/components/ui/image-placeholder";
import { Link, useSearchParams } from "react-router-dom";
import { extractUtmParams, storeReferralData } from "@/lib/crmEvents";
import { useTranslation } from "react-i18next";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { useWebsiteImagesBatch } from "@/hooks/useWebsiteImage";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { BlogCard } from "@/components/blog/BlogCard";
import { useBlogPosts } from "@/hooks/useBlogPosts";
import { usePublicTestimonials } from "@/hooks/useTestimonials";
import { useAIAgent } from "@/hooks/useAIAgents";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { settings: companySettings } = useCompanySettings();
  const { data: dbTestimonials } = usePublicTestimonials("landing");
  const { data: isabellaAgent } = useAIAgent("customer_service_expert");

  // Batch fetch all images in a single query
  const { getImage, isLoading: imagesLoading } = useWebsiteImagesBatch(["homepage_hero", "homepage_pendant_promo"]);
  const heroImage = getImage("homepage_hero");
  const pendantPromoImage = getImage("homepage_pendant_promo");

  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [searchParams] = useSearchParams();

  // Fetch latest blog posts for homepage section
  const { data: latestPosts } = useBlogPosts(3);

  // Capture partner referral code on landing and track view
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      const utmParams = extractUtmParams(searchParams);
      storeReferralData(refCode, utmParams);

      // Fire and forget - track that the referral link was viewed
      supabase.functions.invoke("track-invite-view", {
        body: { referralCode: refCode }
      }).catch(() => {}); // Silent failure
    }
  }, [searchParams]);

  // Format phone for WhatsApp (remove spaces and + sign)
  const whatsappNumber = companySettings.emergency_phone.replace(/[\s+]/g, '');

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero Section */}
      <section className="pt-24 pb-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-accent/30 -z-10" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl -z-10" />

        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alert-resolved opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-alert-resolved"></span>
                </span>
                <span className="text-sm font-medium text-primary">{t("landing.badge")}</span>
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
                {t("landing.heroTitle")}
                <span className="text-gradient block mt-2">{t("landing.heroTitleHighlight")}</span>
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground max-w-xl mx-auto lg:mx-0">
                {t("landing.heroDescription")}
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <Button size="lg" className="h-14 px-8 text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all" asChild>
                  <Link to="/join">
                    {t("landing.startProtection")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 text-lg group"
                  onClick={() => setContactDialogOpen(true)}
                >
                  <Phone className="mr-2 h-5 w-5 group-hover:animate-pulse" />
                  {t("common.callNow")}
                </Button>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-5 w-5 rounded-full bg-alert-resolved/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-alert-resolved" />
                  </div>
                  <span className="text-muted-foreground">{t("landing.noContracts")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-5 w-5 rounded-full bg-alert-resolved/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-alert-resolved" />
                  </div>
                  <span className="text-muted-foreground">{t("landing.cancelAnytime")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-5 w-5 rounded-full bg-alert-resolved/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-alert-resolved" />
                  </div>
                  <span className="text-muted-foreground">{t("landing.englishSpanish")}</span>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="relative">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-primary/10 aspect-[4/3] bg-muted">
                <ImageWithPlaceholder
                  imageUrl={heroImage.imageUrl}
                  altText={heroImage.altText || "Happy multigenerational family enjoying peace of mind with ICE Alarm protection"}
                  placeholderText="Hero Image"
                  placeholderSubtext="Coming Soon"
                  priority={true}
                  width={800}
                  height={600}
                  isLoadingUrl={imagesLoading}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
              </div>

              {/* Floating 24/7 card */}
              <div className="absolute -bottom-6 -left-6 bg-card rounded-2xl shadow-xl p-4 border animate-fade-up hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-alert-resolved/20 flex items-center justify-center">
                    <ShieldCheck className="h-6 w-6 text-alert-resolved" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">24/7</p>
                    <p className="text-sm text-muted-foreground">{t("landing.floatingMonitored")}</p>
                  </div>
                </div>
              </div>

              {/* Floating Isabella card */}
              <div className="absolute -top-4 -right-4 bg-card rounded-2xl shadow-xl p-4 border animate-fade-up hidden md:block" style={{ animationDelay: '0.2s' }}>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center overflow-hidden">
                    {isabellaAgent?.avatar_url ? (
                      <img src={isabellaAgent.avatar_url} alt="Isabella" className="h-full w-full object-cover" />
                    ) : (
                      <Bot className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-bold">Isabella</p>
                    <p className="text-sm text-muted-foreground">{t("landing.floatingIsabella")}</p>
                  </div>
                </div>
              </div>

              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] rounded-full border border-primary/10" />
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] rounded-full border border-primary/5" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary bg-primary/5 px-4 py-1.5 text-sm font-medium">
              {t("landing.badge").includes("Protecting") ? "Our Difference" : "Nuestra Diferencia"}
            </Badge>
            <h2 className="text-3xl font-bold mb-4">{t("landing.whyChoose")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("landing.whyChooseDesc")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Bot, titleKey: "landing.featureIsabella", descKey: "landing.featureIsabellaDesc", num: "01" },
              { icon: Users, titleKey: "landing.featureTeam", descKey: "landing.featureTeamDesc", num: "02" },
              { icon: MapPin, titleKey: "landing.featureGps", descKey: "landing.featureGpsDesc", num: "03" },
              { icon: Monitor, titleKey: "landing.featureDashboard", descKey: "landing.featureDashboardDesc", num: "04" },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.num} className="relative overflow-hidden border-0 shadow-lg bg-card hover:-translate-y-1 transition-transform duration-300 group">
                  {/* Gradient top border */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/60" />
                  {/* Background number */}
                  <span className="absolute top-3 right-4 text-6xl font-bold text-primary/[0.06] select-none leading-none">
                    {feature.num}
                  </span>
                  <CardContent className="pt-8 pb-6 relative">
                    {/* Double-ring icon */}
                    <div className="relative h-16 w-16 mb-5">
                      <div className="absolute inset-0 rounded-2xl bg-primary/5 group-hover:bg-primary/10 transition-colors" />
                      <div className="absolute inset-1.5 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon className="h-7 w-7 text-primary" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-xl mb-2">{t(feature.titleKey)}</h3>
                    {/* Decorative divider */}
                    <div className="w-8 h-0.5 bg-primary/30 rounded-full mb-3" />
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {t(feature.descKey)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section — Teaser */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-4">{t("landing.howItWorks.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
            {t("landing.howItWorks.description")}
          </p>

          <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto my-10">
            {[
              { step: 1, icon: AlertCircle, titleKey: "landing.howItWorks.step1Title" },
              { step: 2, icon: MessageCircle, titleKey: "landing.howItWorks.step2Title" },
              { step: 3, icon: Shield, titleKey: "landing.howItWorks.step3Title" },
              { step: 4, icon: Heart, titleKey: "landing.howItWorks.step4Title" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="relative inline-block mb-3">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="absolute -top-1.5 -left-1.5 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-sm font-semibold">{t(item.titleKey)}</h3>
              </div>
            ))}
          </div>

          <Button asChild size="lg">
            <Link to="/how-it-works">
              {t("howItWorksPage.hero.scrollPrompt", "Follow Maria's story")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("landing.simplePricing")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("landing.pricingDesc")}
              <span className="block mt-2 text-sm">{t("landing.pricesIncludeIva")}</span>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Single Membership */}
            <Card className="relative">
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-2">{t("landing.singleMembership")}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t("landing.forOnePerson")}</p>
                <div className="mb-2">
                  <span className="text-4xl font-bold">€27.49</span>
                  <span className="text-muted-foreground">{t("landing.perMonth")}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("common.or")} €274.89{t("landing.perYear")} <span className="text-alert-resolved">({t("landing.saveTwoMonths")})</span>
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.singleBullet1")}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.singleBullet2")}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.singleBullet3")}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.singleBullet4")}
                  </li>
                </ul>
                <Button className="w-full" variant="outline" asChild>
                  <Link to="/join">{t("common.getStarted")}</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Couple Membership */}
            <Card className="relative border-primary shadow-glow">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  {t("landing.mostPopular")}
                </span>
              </div>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-2">{t("landing.coupleMembership")}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t("landing.forTwoPeople")}</p>
                <div className="mb-2">
                  <span className="text-4xl font-bold">€38.49</span>
                  <span className="text-muted-foreground">{t("landing.perMonth")}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("common.or")} €384.89{t("landing.perYear")} <span className="text-alert-resolved">({t("landing.saveTwoMonths")})</span>
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.coupleBullet1")}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.coupleBullet2")}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.coupleBullet3")}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-alert-resolved" />
                    {t("landing.coupleBullet4")}
                  </li>
                </ul>
                <Button className="w-full" asChild>
                  <Link to="/join">{t("common.getStarted")}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* ICE Alarm GPS Pendant - Premium Section */}
          <div className="mt-12 max-w-4xl mx-auto relative">
            {/* Recommended Badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
              <span className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-1.5 rounded-full shadow-lg">
                {t('landing.pricing.pendant.recommended')}
              </span>
            </div>

            <Card className="border-2 border-primary/30 bg-gradient-to-br from-background via-background to-primary/5 shadow-xl overflow-hidden">
              <CardContent className="p-0">
                <div className="grid md:grid-cols-5 gap-0">
                  {/* Product Image */}
                  <div className="md:col-span-2 bg-gradient-to-br from-muted/50 to-muted p-8 flex items-center justify-center">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl scale-75"></div>
                      {pendantPromoImage.imageUrl ? (
                        <img
                          src={pendantPromoImage.imageUrl}
                          alt={pendantPromoImage.altText || "ICE Alarm GPS Pendant"}
                          className="relative w-48 h-48 md:w-56 md:h-56 object-contain drop-shadow-2xl"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="relative w-48 h-48 md:w-56 md:h-56 rounded-2xl bg-muted/80 flex flex-col items-center justify-center text-muted-foreground">
                          <MapPin className="h-12 w-12 mb-2 opacity-40" />
                          <p className="text-sm font-medium opacity-60">Product Image</p>
                          <p className="text-xs opacity-50">Coming Soon</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="md:col-span-3 p-8 flex flex-col justify-center">
                    <div className="mb-6">
                      <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                        {t('landing.pricing.pendant.title')}
                      </h3>
                      <p className="text-muted-foreground">
                        {t('landing.pricing.pendant.subtitle')}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-3xl md:text-4xl font-bold text-primary">€151.25</span>
                        <span className="text-sm text-muted-foreground">{t('landing.inclIva')}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">+ €14.99 {t('landing.shipping')}</p>
                    </div>

                    {/* Feature Badges */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                        <AlertCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">{t('landing.sosButton')}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                        <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">{t('landing.gpsTracking')}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                        <Zap className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">{t('landing.fallDetection')}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                        <Radio className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">{t('landing.twoWayAudio')}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                        <Battery className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">{t('landing.longBattery')}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                        <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">{t('landing.waterproof')}</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <Link to="/pendant">
                      <Button variant="outline" className="w-full md:w-auto border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                        {t('landing.learnMore')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Your Personal Dashboard Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("landing.dashboard.title")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("landing.dashboard.description")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Radio className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.dashboard.deviceTitle")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.dashboard.deviceDesc")}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.dashboard.chatTitle")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.dashboard.chatDesc")}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Monitor className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.dashboard.accountTitle")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.dashboard.accountDesc")}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Heart className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.dashboard.familyTitle")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.dashboard.familyDesc")}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-muted/30 to-background">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("landing.testimonials.title")}</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {(dbTestimonials && dbTestimonials.length > 0 ? dbTestimonials : []).map((item) => {
              const isEs = i18n.language === "es";
              const quote = isEs ? item.quote_es : item.quote_en;
              const location = isEs ? item.location_es : item.location_en;
              const initials = item.author_name.split(" ").map((w) => w[0]).join("").slice(0, 2);
              return (
                <Card key={item.id} className="border-0 shadow-lg bg-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(item.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                      ))}
                    </div>
                    <blockquote className="text-foreground mb-6 leading-relaxed">
                      "{quote}"
                    </blockquote>
                    <div className="flex items-center gap-3 pt-4 border-t">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-lg font-semibold text-primary">{initials}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{item.author_name}</p>
                        <p className="text-sm text-muted-foreground">{location}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Geographic Trust Line */}
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-3 bg-primary/10 rounded-full px-6 py-3">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {t("landing.testimonials.trustLine")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Partner Programme Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t("landing.partners.title")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("landing.partners.description")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.partners.benefit1Title")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.partners.benefit1Desc")}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Heart className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.partners.benefit2Title")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.partners.benefit2Desc")}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Headphones className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.partners.benefit3Title")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.partners.benefit3Desc")}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Send className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("landing.partners.benefit4Title")}</h3>
                <p className="text-muted-foreground text-sm">{t("landing.partners.benefit4Desc")}</p>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-10">
            <Button size="lg" className="h-14 px-8 text-lg" asChild>
              <Link to="/partner">
                {t("landing.partners.cta")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground mt-4 max-w-2xl mx-auto">
              {t("landing.partners.idealFor")}
            </p>
          </div>
        </div>
      </section>

      {/* Latest from ICE Alarm - Blog Section */}
      {latestPosts && latestPosts.length > 0 && (
        <section className="py-20 px-4">
          <div className="container mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">{t("blog.latestFrom")}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t("blog.subtitle", "Stay informed with our latest updates about personal safety, elderly care, and emergency response.")}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {latestPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>

            <div className="text-center mt-8">
              <Button variant="outline" asChild>
                <Link to="/blog">{t("blog.viewAll")}</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto text-center max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">{t("landing.readyToJoin")}</h2>
          <p className="text-muted-foreground mb-8">
            {t("landing.readyToJoinDesc")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="h-14 px-8 text-lg" asChild>
              <Link to="/join">
                {t("landing.startProtection")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            {t("landing.haveQuestions")} {t("landing.callUsAnytime")}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-12 px-4 bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <Logo variant="white" size="sm" className="mb-4" />
              <p className="text-sm text-sidebar-foreground/70">
                {t("landing.heroDescription")}
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("navigation.contact")}</h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li><a href={`tel:${companySettings.emergency_phone.replace(/\s/g, '')}`} className="hover:text-sidebar-foreground">{t("common.callNow")}</a></li>
                <li>{companySettings.support_email}</li>
                <li>{companySettings.address}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("landing.footer.links")}</h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li><a href="#how-it-works" className="hover:text-sidebar-foreground transition-colors">{t("navigation.howItWorks")}</a></li>
                <li><a href="#pricing" className="hover:text-sidebar-foreground transition-colors">{t("navigation.pricing")}</a></li>
                <li><Link to="/partner" className="hover:text-sidebar-foreground transition-colors">{t("navigation.partners")}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("landing.footer.legal")}</h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li><Link to="/terms" className="hover:text-sidebar-foreground transition-colors">{t("landing.termsOfService")}</Link></li>
                <li><Link to="/privacy" className="hover:text-sidebar-foreground transition-colors">{t("landing.privacyPolicy")}</Link></li>
                <li><Link to="/help" className="hover:text-sidebar-foreground transition-colors">{t("help.title", "Help Center")}</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-sidebar-border pt-8 text-center text-sm text-sidebar-foreground/60">
            <p>&copy; {new Date().getFullYear()} ICE Alarm Espa&ntilde;a. {t("landing.allRightsReserved")}</p>
          </div>
        </div>
      </footer>

      {/* Contact Options Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">
              {t("landing.contactDialog.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center mb-6">
            <p className="text-sm text-muted-foreground">
              {t("landing.contactDialog.available")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button
              size="lg"
              className="h-20 flex-col gap-2"
              asChild
            >
              <a href={`tel:${companySettings.emergency_phone.replace(/\s/g, '')}`}>
                <Phone className="h-6 w-6" />
                <span className="text-sm font-medium">
                  {t("landing.contactDialog.phoneCall")}
                </span>
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-20 flex-col gap-2 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
              asChild
            >
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-6 w-6" />
                <span className="text-sm font-medium">
                  {t("landing.contactDialog.whatsapp")}
                </span>
              </a>
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">
            {t("landing.contactDialog.voiceOnly")}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
