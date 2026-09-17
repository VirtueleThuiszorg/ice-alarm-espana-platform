import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Logo } from "@/components/ui/logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { InlineAIChat } from "@/components/chat/InlineAIChat";
import { telHref } from "@/lib/phone";
import { readPublicSubmitRefusal } from "@/lib/publicSubmit";
import { 
  Phone, 
  Mail, 
  Send, 
  CheckCircle,
  ArrowLeft,
  MessageSquare,
  Shield,
  Users,
  Clock
} from "lucide-react";

export default function ContactPage() {
  const { t } = useTranslation();
  const { settings: companySettings } = useCompanySettings();
  // Null when settings_emergency_phone is unset. Both call affordances below are conditional on
  // it: a "Call us" card with no number in it is worse than no card.
  const phoneHref = telHref(companySettings.emergency_phone);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  /*
    WHICH BOXES THE SERVER OBJECTED TO.

    The refusal comes back as field names rather than a sentence, so the page can mark the boxes.
    A form that says "something was wrong" and highlights nothing makes somebody re-read seven
    fields to find the one — and on a site read mostly by people in their seventies and eighties
    that is where they give up and ring instead, or do not.
  */
  const [badFields, setBadFields] = useState<string[]>([]);
  /*
    THE HONEYPOT. A hidden field nobody can see, so a person never fills it and a script that
    fills every input it finds always does. Named `company` in the markup rather than `honeypot`
    for the same reason it is hidden.
  */
  const [company, setCompany] = useState("");
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    preferred_language: "en",
    enquiry_type: "general",
    message: ""
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear the mark as soon as they start fixing it, not on the next submit.
    setBadFields(prev => prev.filter(f => f !== field));
  };

  /** The red ring and the `aria-invalid` a screen reader announces, from one source. */
  const invalid = (field: string) => badFields.includes(field);
  const fieldProps = (field: string) => ({
    "aria-invalid": invalid(field) || undefined,
    className: invalid(field) ? "border-destructive focus-visible:ring-destructive" : undefined,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setBadFields([]);

    /*
      THROUGH `public-submit`, NOT STRAIGHT INTO THE TABLE.

      This form used to insert into `leads` from the browser with the anon key, and the only
      validation was the `required` attributes below — which exist here and nowhere at all for a
      script POSTing to the REST endpoint. A lead arrived with no name, no email and no phone and
      rang the new-enquiry bell. `public-submit` applies the same rules to a browser and to a
      script, and sets `source` and `status` itself so a POST cannot choose its own provenance.
      The anon INSERT policy that let the browser write here is revoked in the migration that
      follows — after this is deployed, because doing it the other way round takes the live form
      down for however long the two are out of step.
    */
    try {
      const { data, error } = await supabase.functions.invoke("public-submit", {
        body: {
          form: "contact",
          fields: formData,
          company,
        },
      });

      /*
        A 400 OR 429 ARRIVES AS AN ERROR, WITH THE BODY ON `error.context`.

        `functions.invoke` treats any non-2xx as a thrown FunctionsHttpError, so the field names
        are in the response the error carries rather than in `data`. Reading them is what turns a
        refusal into "this box, that box" instead of "something went wrong".
      */
      if (error) {
        const refusal = await readPublicSubmitRefusal(error);
        if (refusal.fields.length > 0) {
          setBadFields(refusal.fields);
          toast.error(t("contact.error.checkFields", "Please check the highlighted fields."));
        } else if (refusal.rateLimited) {
          toast.error(
            t(
              "contact.error.tooMany",
              "You have sent several messages recently. Please wait a little, or call us.",
            ),
          );
        } else {
          toast.error(t("contact.error.sendFailed"));
        }
        return;
      }
      if (!data?.ok) throw new Error("public-submit did not confirm the submission");

      setIsSubmitted(true);
      toast.success(t("contact.success.message"));
    } catch (error) {
      console.error('Error submitting contact form:', error);
      toast.error(t("contact.error.sendFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />

        <div className="pt-24 pb-16 flex items-center justify-center min-h-[80vh]">
          <Card className="max-w-md w-full mx-4 text-center">
            <CardContent className="pt-12 pb-8">
              <div className="h-16 w-16 rounded-full bg-status-active/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-status-active" />
              </div>
              <h2 className="text-2xl font-bold mb-3">{t("contact.success.title")}</h2>
              <p className="text-muted-foreground mb-6">
                {t("contact.success.description")}
              </p>
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link to="/">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("contact.success.returnHome")}
                  </Link>
                </Button>
                {phoneHref && (
                  <Button variant="outline" asChild className="w-full">
                    <a href={phoneHref}>
                      <Phone className="h-4 w-4 mr-2" />
                      {t("contact.success.callNow")}
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero Section */}
      <section className="pt-24 pb-12 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t("contact.hero.title")}</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("contact.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 px-4">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto items-start">
            {/* Contact Info Cards - Left Column */}
            <div className="space-y-6">
              {phoneHref && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Phone className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{t("contact.info.callUs")}</h3>
                        <p className="text-muted-foreground text-sm mb-2">{t("contact.info.callUsDesc")}</p>
                        <a href={phoneHref} className="text-primary font-medium hover:underline">
                          {t("common.callNow")}
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{t("contact.info.emailUs")}</h3>
                      <p className="text-muted-foreground text-sm mb-2">{t("contact.info.emailUsDesc")}</p>
                      <a 
                        href={`mailto:${companySettings.support_email}`} 
                        className="text-primary font-medium hover:underline"
                      >
                        {companySettings.support_email}
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Chat + Contact Form - Right Column */}
            <div className="lg:col-span-2 space-y-6">
              <InlineAIChat />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    {t("contact.form.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("contact.form.subtitle")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/*
                      THE HONEYPOT. Nobody can see it, so nobody fills it; a script that fills
                      every input it finds always does. `aria-hidden` and `tabIndex={-1}` keep it
                      out of the reading order and off the tab path, so it is invisible to a
                      screen reader as well as to the eye — a trap that catches assistive
                      technology is not a trap, it is a barrier.
                    */}
                    <div className="hidden" aria-hidden="true">
                      <label htmlFor="company">Company</label>
                      <input
                        id="company"
                        name="company"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        data-testid="contact-honeypot"
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first_name">{t("contact.form.firstName")} *</Label>
                        <Input
                          id="first_name"
                          {...fieldProps("first_name")}
                          required
                          value={formData.first_name}
                          onChange={(e) => handleChange("first_name", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last_name">{t("contact.form.lastName")} *</Label>
                        <Input
                          id="last_name"
                          {...fieldProps("last_name")}
                          required
                          value={formData.last_name}
                          onChange={(e) => handleChange("last_name", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">{t("contact.form.email")} *</Label>
                        <Input
                          id="email"
                          {...fieldProps("email")}
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => handleChange("email", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">{t("contact.form.phone")} *</Label>
                        <Input
                          id="phone"
                          {...fieldProps("phone")}
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={(e) => handleChange("phone", e.target.value)}
                          placeholder={t("common.phonePlaceholder")}
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="preferred_language">{t("contact.form.language")}</Label>
                        <Select 
                          value={formData.preferred_language} 
                          onValueChange={(value) => handleChange("preferred_language", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="es">Español</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="enquiry_type">{t("contact.form.enquiryType")}</Label>
                        <Select 
                          value={formData.enquiry_type} 
                          onValueChange={(value) => handleChange("enquiry_type", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">{t("contact.enquiry.general")}</SelectItem>
                            <SelectItem value="pricing">{t("contact.enquiry.pricing")}</SelectItem>
                            <SelectItem value="demo">{t("contact.enquiry.demo")}</SelectItem>
                            <SelectItem value="partnership">{t("contact.enquiry.partnership")}</SelectItem>
                            <SelectItem value="support">{t("contact.enquiry.support")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">{t("contact.form.message")} *</Label>
                      <Textarea
                        id="message"
                        {...fieldProps("message")}
                        required
                        rows={5}
                        value={formData.message}
                        onChange={(e) => handleChange("message", e.target.value)}
                        placeholder={t("contact.form.messagePlaceholder")}
                      />
                    </div>

                    {badFields.length > 0 && (
                      <p className="text-sm text-destructive" role="alert" data-testid="contact-field-errors">
                        {t(
                          "contact.error.checkFields",
                          "Please check the highlighted fields.",
                        )}
                      </p>
                    )}

                    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>{t("contact.form.sending")}</>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          {t("contact.form.sendMessage")}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-center mb-8">{t("contact.whyTrust.title")}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{t("contact.whyTrust.protection")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("contact.whyTrust.protectionDesc")}
              </p>
            </div>
            <div className="text-center">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{t("contact.whyTrust.bilingual")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("contact.whyTrust.bilingualDesc")}
              </p>
            </div>
            <div className="text-center">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{t("contact.whyTrust.response")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("contact.whyTrust.responseDesc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t">
        <div className="container mx-auto text-center">
          <Logo size="sm" />
          <p className="text-sm text-muted-foreground mt-4">
            © {new Date().getFullYear()} {companySettings.company_name}. {t("landing.allRightsReserved")}
          </p>
        </div>
      </footer>
    </div>
  );
}
