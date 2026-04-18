import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Mail, Phone, MessageCircle, ExternalLink, HelpCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PartnerSupportPage() {
  const { t } = useTranslation();

  const contactMethods = [
    {
      icon: Mail,
      title: t("partnerSupport.emailTitle", "Email Support"),
      description: t("partnerSupport.emailDesc", "Send us an email and we'll respond within 24 hours"),
      action: "partners@icealarm.es",
      href: "mailto:partners@icealarm.es",
    },
    {
      icon: Phone,
      title: t("partnerSupport.phoneTitle", "Phone Support"),
      description: t("partnerSupport.phoneDesc", "Call us Monday to Friday, 9am - 6pm CET"),
      action: "+34 965 123 456",
      href: "tel:+34965123456",
    },
    {
      icon: MessageCircle,
      title: t("partnerSupport.whatsappTitle", "WhatsApp"),
      description: t("partnerSupport.whatsappDesc", "Quick questions? Message us on WhatsApp"),
      action: "+34 600 000 000",
      href: "https://wa.me/34600000000",
    },
  ];

  const resources = [
    {
      title: t("partnerSupport.resourceGuide", "Partner Guide"),
      description: t("partnerSupport.resourceGuideDesc", "Everything you need to know about the partner programme"),
      href: "#",
    },
    {
      title: t("partnerSupport.resourceMarketing", "Marketing Materials"),
      description: t("partnerSupport.resourceMarketingDesc", "Downloadable brochures, flyers, and digital assets"),
      href: "#",
    },
    {
      title: t("partnerSupport.resourceFAQ", "Full FAQ"),
      description: t("partnerSupport.resourceFAQDesc", "Detailed answers to common questions"),
      href: "#",
    },
  ];

  const faqs = [
    {
      question: t("partnerSupport.faq1Q", "How do I earn commissions?"),
      answer: t("partnerSupport.faq1A", "You earn a commission for every person who signs up through your unique referral link and receives their ICE Alarm pendant. Commissions are created automatically when the device is delivered."),
    },
    {
      question: t("partnerSupport.faq2Q", "When do I get paid?"),
      answer: t("partnerSupport.faq2A", "Commissions enter a 7-day holding period after device delivery, then move to 'approved' status. Payments are processed monthly via bank transfer to the IBAN on file."),
    },
    {
      question: t("partnerSupport.faq3Q", "How do I share my referral link?"),
      answer: t("partnerSupport.faq3A", "Go to your Dashboard and click 'Referral Link' to copy your unique URL. You can share it via email, WhatsApp, social media, or on printed materials."),
    },
    {
      question: t("partnerSupport.faq4Q", "Can I track my referrals?"),
      answer: t("partnerSupport.faq4A", "Yes! Your Dashboard shows real-time stats including invites sent, registrations, deliveries, and commission status. The Referral Pipeline shows each referral's progress."),
    },
    {
      question: t("partnerSupport.faq5Q", "What is the commission structure?"),
      answer: t("partnerSupport.faq5A", "Base commission is €50 per delivered device. Partners who refer 10+ customers per month earn €55 each, and 20+ per month earn €60 each."),
    },
    {
      question: t("partnerSupport.faq6Q", "How do I update my bank details?"),
      answer: t("partnerSupport.faq6A", "Go to Settings > Payout Information and update your IBAN and beneficiary name. Changes take effect for the next payout cycle."),
    },
    {
      question: t("partnerSupport.faq7Q", "Can I refer from outside Spain?"),
      answer: t("partnerSupport.faq7A", "ICE Alarm currently operates in Spain and Portugal. Your referred customers must reside in these regions, but you can be based anywhere."),
    },
    {
      question: t("partnerSupport.faq8Q", "What if my referral cancels?"),
      answer: t("partnerSupport.faq8A", "If a customer cancels within the 7-day holding period, the commission is automatically cancelled. After the holding period, earned commissions are yours to keep."),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("partnerSupport.title", "Partner Support")}
        </h1>
        <p className="text-muted-foreground">
          {t("partnerSupport.subtitle", "Get help with your partner account")}
        </p>
      </div>

      {/* Contact Methods */}
      <div className="grid gap-4 md:grid-cols-3">
        {contactMethods.map((method) => (
          <Card key={method.title}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <method.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{method.title}</CardTitle>
                  <CardDescription className="text-xs">{method.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <a href={method.href} target={method.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                  {method.action}
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Useful Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t("partnerSupport.resourcesTitle", "Useful Resources")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {resources.map((resource) => (
              <a
                key={resource.title}
                href={resource.href}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">{resource.title}</p>
                  <p className="text-xs text-muted-foreground">{resource.description}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t("partnerSupport.faqTitle", "Frequently Asked Questions")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
