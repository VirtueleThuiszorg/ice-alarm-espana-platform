import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Phone,
  AlertCircle,
  MessageCircle,
  Brain,
  Monitor,
  Headphones,
  Ambulance,
  PhoneCall,
  Heart,
  HelpCircle,
  Shield,
  Clock,
  Check,
  Mic,
  MapPin,
  Activity,
  Users,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { ImageWithPlaceholder } from "@/components/ui/image-placeholder";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useWebsiteImagesBatch } from "@/hooks/useWebsiteImage";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("opacity-100", "translate-y-0");
            entry.target.classList.remove("opacity-0", "translate-y-6");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
    );

    const children = el.querySelectorAll("[data-reveal]");
    children.forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, []);

  return ref;
}

export default function HowItWorksPage() {
  const { t } = useTranslation();
  const { settings: companySettings } = useCompanySettings();
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const revealRef = useScrollReveal();

  const phoneForLink = companySettings.emergency_phone.replace(/\s/g, "");
  const whatsappNumber = companySettings.emergency_phone.replace(/[\s+]/g, "");

  const { getImage, isLoading: imagesLoading } = useWebsiteImagesBatch([
    "how_it_works_hero",
  ]);
  const heroImage = getImage("how_it_works_hero");

  return (
    <div className="min-h-screen bg-background" ref={revealRef}>
      <PublicHeader />

      {/* Hero — matches homepage layout */}
      <section className="pt-24 pb-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-accent/30 -z-10" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl -z-10" />

        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alert-resolved opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-alert-resolved" />
                </span>
                <span className="text-sm font-medium text-primary">
                  {t("howItWorksPage.hero.badge")}
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
                {t("howItWorksPage.hero.title")}
                <span className="text-gradient block mt-2">{t("howItWorksPage.hero.titleHighlight")}</span>
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground max-w-xl mx-auto lg:mx-0">
                {t("howItWorksPage.hero.subtitle")}
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <Button size="lg" className="h-14 px-8 text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all" asChild>
                  <Link to="/join">
                    {t("howItWorksPage.cta.primaryButton")}
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
                  <span className="text-muted-foreground">
                    {t("howItWorksPage.cta.trust1")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-5 w-5 rounded-full bg-alert-resolved/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-alert-resolved" />
                  </div>
                  <span className="text-muted-foreground">
                    {t("howItWorksPage.cta.trust2")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-5 w-5 rounded-full bg-alert-resolved/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-alert-resolved" />
                  </div>
                  <span className="text-muted-foreground">
                    {t("howItWorksPage.cta.trust3")}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="relative">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-primary/10 aspect-[4/3] bg-muted">
                <ImageWithPlaceholder
                  imageUrl={heroImage.imageUrl || "/images/how-it-works-hero.jpg"}
                  altText={
                    heroImage.altText ||
                    "Elderly woman at home protected by ICE Alarm pendant"
                  }
                  priority={true}
                  width={800}
                  height={600}
                  isLoadingUrl={imagesLoading}
                />
              </div>

              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] rounded-full border border-primary/10" />
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] rounded-full border border-primary/5" />
            </div>
          </div>
        </div>
      </section>

      {/* Timeline — Left-rail with full-width cards */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="relative">
            {/* Vertical timeline rail */}
            <div className="absolute left-4 md:left-6 top-0 bottom-0 w-0.5 bg-border" />

            {/* Step 1: The Alert */}
            <TimelineStep
              time={t("howItWorksPage.step1.time")}
              title={t("howItWorksPage.step1.title")}
              icon={AlertCircle}
              iconColor="text-alert-sos"
              iconBg="bg-alert-sos/10"
              dotColor="bg-alert-sos"
            >
              <p className="text-foreground/80 mb-4">
                {t("howItWorksPage.step1.description")}
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Mic className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm">
                    {t("howItWorksPage.step1.voicePath")}
                  </p>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Activity className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm">
                    {t("howItWorksPage.step1.dataPath")}
                  </p>
                </div>
              </div>
              <InfoNote>{t("howItWorksPage.step1.note")}</InfoNote>
            </TimelineStep>

            {/* Step 2: Isabella Answers */}
            <TimelineStep
              time={t("howItWorksPage.step2.time")}
              title={t("howItWorksPage.step2.title")}
              icon={MessageCircle}
              iconColor="text-blue-500"
              iconBg="bg-blue-500/10"
              dotColor="bg-blue-500"
            >
              <p className="text-foreground/80 mb-4">
                {t("howItWorksPage.step2.description")}
              </p>
              <blockquote className="border-l-4 border-blue-400 pl-4 py-3 mb-1 bg-blue-50 dark:bg-blue-950/30 rounded-r-lg italic text-foreground">
                {t("howItWorksPage.step2.isabellaQuote")}
              </blockquote>
              {t("howItWorksPage.step2.isabellaQuoteTranslation") && (
                <p className="text-sm text-foreground/60 mb-4 pl-4">
                  {t("howItWorksPage.step2.isabellaQuoteTranslation")}
                </p>
              )}
              <ul className="space-y-2 mt-4">
                <DetailItem>
                  {t("howItWorksPage.step2.detail1")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step2.detail2")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step2.detail3")}
                </DetailItem>
              </ul>
            </TimelineStep>

            {/* Step 3: Smart Questions */}
            <TimelineStep
              time={t("howItWorksPage.step3.time")}
              title={t("howItWorksPage.step3.title")}
              icon={Brain}
              iconColor="text-purple-500"
              iconBg="bg-purple-500/10"
              dotColor="bg-purple-500"
            >
              <p className="text-foreground/80 mb-4">
                {t("howItWorksPage.step3.description")}
              </p>
              <ul className="space-y-2 mb-4">
                <DetailItem>
                  {t("howItWorksPage.step3.detail1")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step3.detail2")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step3.detail3")}
                </DetailItem>
              </ul>
              <InfoNote>{t("howItWorksPage.step3.note")}</InfoNote>
            </TimelineStep>

            {/* Step 4: Dashboard */}
            <TimelineStep
              time={t("howItWorksPage.step4.time")}
              title={t("howItWorksPage.step4.title")}
              icon={Monitor}
              iconColor="text-amber-500"
              iconBg="bg-amber-500/10"
              dotColor="bg-amber-500"
            >
              <p className="text-foreground/80 mb-4">
                {t("howItWorksPage.step4.description")}
              </p>
              <div className="space-y-2 mb-4">
                <DashboardItem icon={Users}>
                  {t("howItWorksPage.step4.detail1")}
                </DashboardItem>
                <DashboardItem icon={MapPin}>
                  {t("howItWorksPage.step4.detail2")}
                </DashboardItem>
                <DashboardItem icon={Activity}>
                  {t("howItWorksPage.step4.detail3")}
                </DashboardItem>
                <DashboardItem icon={Phone}>
                  {t("howItWorksPage.step4.detail4")}
                </DashboardItem>
                <DashboardItem icon={FileText}>
                  {t("howItWorksPage.step4.detail5")}
                </DashboardItem>
              </div>
              <InfoNote>{t("howItWorksPage.step4.note")}</InfoNote>
            </TimelineStep>

            {/* Step 5: Human Takes Over */}
            <TimelineStep
              time={t("howItWorksPage.step5.time")}
              title={t("howItWorksPage.step5.title")}
              icon={Headphones}
              iconColor="text-green-500"
              iconBg="bg-green-500/10"
              dotColor="bg-green-500"
            >
              <p className="text-foreground/80 mb-4">
                {t("howItWorksPage.step5.description")}
              </p>
              <ul className="space-y-2 mb-4">
                <DetailItem>
                  {t("howItWorksPage.step5.detail1")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step5.detail2")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step5.detail3")}
                </DetailItem>
              </ul>
              <blockquote className="border-l-4 border-green-400 pl-4 py-3 mb-4 bg-green-50 dark:bg-green-950/30 rounded-r-lg italic text-foreground">
                {t("howItWorksPage.step5.agentQuote")}
              </blockquote>
              <InfoNote>{t("howItWorksPage.step5.note")}</InfoNote>
            </TimelineStep>

            {/* Step 6: Help Is Called */}
            <TimelineStep
              time={t("howItWorksPage.step6.time")}
              title={t("howItWorksPage.step6.title")}
              icon={Ambulance}
              iconColor="text-red-500"
              iconBg="bg-red-500/10"
              dotColor="bg-red-500"
            >
              <p className="text-foreground/80 mb-4">
                {t("howItWorksPage.step6.description")}
              </p>
              <ul className="space-y-2 mb-4">
                <DetailItem>
                  {t("howItWorksPage.step6.detail1")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step6.detail2")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step6.detail3")}
                </DetailItem>
              </ul>
              <blockquote className="border-l-4 border-blue-400 pl-4 py-3 mb-4 bg-blue-50 dark:bg-blue-950/30 rounded-r-lg italic text-foreground">
                {t("howItWorksPage.step6.isabellaQuote")}
              </blockquote>
              <InfoNote>{t("howItWorksPage.step6.note")}</InfoNote>
            </TimelineStep>
          </div>
        </div>
      </section>

      {/* Step 7: Your Phone Rings — EMOTIONAL PEAK */}
      <section className="relative py-12 md:py-16 bg-gradient-to-b from-primary/5 via-primary/10 to-primary/5">
        <div
          className="container mx-auto max-w-3xl px-4 text-center opacity-0 translate-y-6 transition-all duration-700 ease-out"
          data-reveal
        >
          <div className="inline-flex items-center gap-2 mb-4">
            <Badge className="bg-primary text-primary-foreground text-sm px-3 py-1">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              {t("howItWorksPage.step7.time")}
            </Badge>
          </div>

          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center">
              <PhoneCall className="h-7 w-7 text-primary" />
            </div>
          </div>

          <h2 className="text-3xl md:text-4xl font-bold mb-2">
            {t("howItWorksPage.step7.title")}
          </h2>
          <p className="text-lg text-primary font-medium mb-4">
            {t("howItWorksPage.step7.subtitle")}
          </p>
          <p className="text-foreground/80 mb-6 max-w-xl mx-auto">
            {t("howItWorksPage.step7.description")}
          </p>

          <Card className="text-left max-w-2xl mx-auto border-primary/20 shadow-glow mb-6">
            <CardContent className="p-5">
              <blockquote className="text-foreground leading-relaxed italic text-sm">
                {t("howItWorksPage.step7.agentQuote")}
              </blockquote>
            </CardContent>
          </Card>

          <div className="max-w-2xl mx-auto bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              {t("howItWorksPage.step7.emotionalNote")}
            </p>
          </div>

          <ul className="flex flex-col sm:flex-row gap-3 justify-center text-sm text-left max-w-2xl mx-auto">
            <li className="flex items-start gap-2 flex-1 p-3 rounded-lg bg-card border">
              <Check className="h-4 w-4 text-alert-resolved mt-0.5 shrink-0" />
              <span>{t("howItWorksPage.step7.detail1")}</span>
            </li>
            <li className="flex items-start gap-2 flex-1 p-3 rounded-lg bg-card border">
              <Check className="h-4 w-4 text-alert-resolved mt-0.5 shrink-0" />
              <span>{t("howItWorksPage.step7.detail2")}</span>
            </li>
            <li className="flex items-start gap-2 flex-1 p-3 rounded-lg bg-card border">
              <Check className="h-4 w-4 text-alert-resolved mt-0.5 shrink-0" />
              <span>{t("howItWorksPage.step7.detail3")}</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Step 8: Resolution — back to timeline */}
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="relative">
            <div className="absolute left-4 md:left-6 top-0 bottom-0 w-0.5 bg-border" />
            <TimelineStep
              time={t("howItWorksPage.step8.time")}
              title={t("howItWorksPage.step8.title")}
              icon={Heart}
              iconColor="text-pink-500"
              iconBg="bg-pink-500/10"
              dotColor="bg-pink-500"
              isLast
            >
              <p className="text-foreground/80 mb-4">
                {t("howItWorksPage.step8.description")}
              </p>
              <ul className="space-y-2 mb-4">
                <DetailItem>
                  {t("howItWorksPage.step8.detail1")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step8.detail2")}
                </DetailItem>
                <DetailItem>
                  {t("howItWorksPage.step8.detail3")}
                </DetailItem>
              </ul>
              <InfoNote>{t("howItWorksPage.step8.note")}</InfoNote>
            </TimelineStep>
          </div>
        </div>
      </section>

      {/* What If FAQ Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div
          className="container mx-auto max-w-3xl opacity-0 translate-y-6 transition-all duration-700 ease-out"
          data-reveal
        >
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              {t("howItWorksPage.whatIf.title")}
            </h2>
            <p className="text-foreground/70">
              {t("howItWorksPage.whatIf.subtitle")}
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {[
              {
                q: "howItWorksPage.whatIf.q1",
                a: "howItWorksPage.whatIf.a1",
              },
              {
                q: "howItWorksPage.whatIf.q2",
                a: "howItWorksPage.whatIf.a2",
              },
              {
                q: "howItWorksPage.whatIf.q3",
                a: "howItWorksPage.whatIf.a3",
              },
              {
                q: "howItWorksPage.whatIf.q4",
                a: "howItWorksPage.whatIf.a4",
              },
            ].map((item, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-base">
                  {t(item.q)}
                </AccordionTrigger>
                <AccordionContent className="text-foreground/75 leading-relaxed">
                  {t(item.a)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 bg-gradient-to-br from-primary/10 to-primary/5">
        <div
          className="container mx-auto text-center max-w-2xl opacity-0 translate-y-6 transition-all duration-700 ease-out"
          data-reveal
        >
          <Shield className="h-10 w-10 text-primary mx-auto mb-5" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t("howItWorksPage.cta.title")}
          </h2>
          <p className="text-foreground/75 mb-8 text-lg">
            {t("howItWorksPage.cta.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button size="lg" className="h-14 px-8 text-lg" asChild>
              <Link to="/join">
                {t("howItWorksPage.cta.primaryButton")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-lg"
              asChild
            >
              <a href={`tel:${phoneForLink}`}>
                <Phone className="mr-2 h-5 w-5" />
                {t("howItWorksPage.cta.secondaryButton")}
              </a>
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-foreground/70">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-alert-resolved" />
              {t("howItWorksPage.cta.trust1")}
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-alert-resolved" />
              {t("howItWorksPage.cta.trust2")}
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-alert-resolved" />
              {t("howItWorksPage.cta.trust3")}
            </span>
          </div>
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
              <h4 className="font-semibold mb-4">
                {t("pendant.footer.contact")}
              </h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li>
                  <a
                    href={`tel:${phoneForLink}`}
                    className="hover:text-sidebar-foreground"
                  >
                    {t("common.callNow")}
                  </a>
                </li>
                <li>{companySettings.support_email}</li>
                <li>{t("pendant.footer.whatsappAvailable")}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">
                {t("pendant.footer.quickLinks")}
              </h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li>
                  <Link to="/" className="hover:text-sidebar-foreground">
                    {t("pendant.footer.home")}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/pendant"
                    className="hover:text-sidebar-foreground"
                  >
                    {t("pendant.footer.pendant")}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/contact"
                    className="hover:text-sidebar-foreground"
                  >
                    {t("pendant.footer.contact")}
                  </Link>
                </li>
                <li>
                  <Link to="/join" className="hover:text-sidebar-foreground">
                    {t("pendant.footer.joinNow")}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">
                {t("pendant.footer.legal")}
              </h4>
              <ul className="space-y-2 text-sm text-sidebar-foreground/70">
                <li>
                  <Link to="/terms" className="hover:text-sidebar-foreground">
                    {t("pendant.footer.termsOfService")}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/privacy"
                    className="hover:text-sidebar-foreground"
                  >
                    {t("pendant.footer.privacyPolicy")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-sidebar-border pt-8 text-center text-sm text-sidebar-foreground/60">
            <p>{t("pendant.footer.companyInfo")}</p>
            <p className="mt-1">
              © {new Date().getFullYear()} {companySettings.company_name}.{" "}
              {t("pendant.footer.allRightsReserved")}
            </p>
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
              <a href={`tel:${phoneForLink}`}>
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

/* ─── Sub-components ─── */

interface TimelineStepProps {
  time: string;
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  dotColor: string;
  isLast?: boolean;
  children: React.ReactNode;
}

function TimelineStep({
  time,
  title,
  icon: Icon,
  iconColor,
  iconBg,
  dotColor,
  isLast,
  children,
}: TimelineStepProps) {
  return (
    <div
      className={`relative pl-12 md:pl-16 ${isLast ? "pb-4" : "pb-8"} opacity-0 translate-y-6 transition-all duration-700 ease-out`}
      data-reveal
    >
      {/* Timeline dot */}
      <div
        className={`absolute left-2.5 md:left-4.5 top-1 h-3.5 w-3.5 rounded-full ${dotColor} border-[3px] border-background shadow-sm z-10`}
      />

      {/* Time badge */}
      <div className="mb-3">
        <Badge variant="outline" className="text-xs font-mono px-2 py-0.5">
          <Clock className="h-3 w-3 mr-1" />
          {time}
        </Badge>
      </div>

      {/* Card with content */}
      <Card className="border shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}
            >
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Check className="h-4 w-4 text-alert-resolved mt-0.5 shrink-0" />
      <span className="text-foreground/75">{children}</span>
    </li>
  );
}

function DashboardItem({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50">
      <Icon className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <span className="text-sm text-foreground/75">{children}</span>
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/50 border border-border/50 mt-4">
      <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <p className="text-sm text-foreground/70 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
