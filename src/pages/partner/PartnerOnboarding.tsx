import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { CheckCircle, Heart, Send, Users, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { REGIONS, HOW_HEARD_OPTIONS } from "@/config/partnerTypes";
import { extractFunctionError } from "@/lib/functionError";

export default function PartnerOnboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [region, setRegion] = useState("");
  const [howHeard, setHowHeard] = useState("");

  const benefits = [
    {
      icon: Heart,
      title: t("partnerOnboarding.benefit1Title", "Support Your Community"),
      description: t("partnerOnboarding.benefit1Desc", "Help the people you care about stay safe and independent with 24/7 protection."),
    },
    {
      icon: Send,
      title: t("partnerOnboarding.benefit2Title", "Easy Referral Tools"),
      description: t("partnerOnboarding.benefit2Desc", "Share your unique link via email, WhatsApp, or on your community noticeboard."),
    },
    {
      icon: Users,
      title: t("partnerOnboarding.benefit3Title", "Dedicated Partner Support"),
      description: t("partnerOnboarding.benefit3Desc", "Your own account manager and co-branded materials to help you get started."),
    },
  ];

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
        <PublicHeader />

        <main className="flex-1 flex items-center justify-center px-4 pb-16 pt-20">
          <Card className="max-w-md w-full text-center">
            <CardHeader>
              <div className="mx-auto rounded-full bg-green-100 p-4 w-fit dark:bg-green-900">
                <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl">
                {t("partnerOnboarding.successTitle", "Thank You for Your Interest!")}
              </CardTitle>
              <CardDescription>
                {t("partnerOnboarding.successDesc", "Our team will send you an email shortly with full details about our partner programme, including what you can earn and a link to complete your registration.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* The description above promises "a link to complete your
                  registration" and used to deliver only an email. Offer the route
                  here too, so an applicant who wants to finish now is not waiting on
                  a send that currently runs over interim Gmail transport. */}
              <Button asChild className="w-full">
                <Link to="/partner/join">
                  {t("partnerOnboarding.completeNow", "Complete full registration")}
                </Link>
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                {t("partnerOnboarding.returnHome", "Return to Homepage")}
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
      <PublicHeader />

      <main className="flex-1 flex items-center justify-center px-4 pb-16 pt-20">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold tracking-tight">
              {t("partnerOnboarding.title", "Become an Care Conneqt Partner")}
            </h1>
            <p className="text-xl text-muted-foreground">
              {t("partnerOnboarding.subtitle", "Help protect the people in your community — register your interest and our team will be in touch with everything you need to know.")}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="text-center">
                <CardHeader>
                  <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
                    <benefit.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{benefit.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{benefit.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* How It Works */}
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{t("partnerOnboarding.howItWorksTitle", "How It Works")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center space-y-2">
                  <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
                    <span className="text-lg font-bold text-primary">1</span>
                  </div>
                  <h3 className="font-semibold">{t("partnerOnboarding.step1Title", "Register")}</h3>
                  <p className="text-sm text-muted-foreground">{t("partnerOnboarding.step1Desc", "Fill in the form below and our team will send you your unique partner link.")}</p>
                </div>
                <div className="text-center space-y-2">
                  <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
                    <span className="text-lg font-bold text-primary">2</span>
                  </div>
                  <h3 className="font-semibold">{t("partnerOnboarding.step2Title", "Share")}</h3>
                  <p className="text-sm text-muted-foreground">{t("partnerOnboarding.step2Desc", "Share your referral link with friends, family, or your community via email, WhatsApp, or in person.")}</p>
                </div>
                <div className="text-center space-y-2">
                  <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
                    <span className="text-lg font-bold text-primary">3</span>
                  </div>
                  <h3 className="font-semibold">{t("partnerOnboarding.step3Title", "Earn")}</h3>
                  <p className="text-sm text-muted-foreground">{t("partnerOnboarding.step3Desc", "Earn a commission for every person who signs up through your link.")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="max-w-lg mx-auto">
            <CardContent className="pt-6">
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsSubmitting(true);

                  const formData = new FormData(e.currentTarget);
                  const contactName = formData.get("contact_name") as string;
                  const email = formData.get("email") as string;
                  const phone = formData.get("phone") as string;
                  const language = preferredLanguage;

                  try {
                    // Server-side application intake (partner-apply): an
                    // anonymous visitor has NO RLS write path to `partners`
                    // by design — the old direct insert here always failed.
                    // The function whitelists fields, dedups by email,
                    // generates the referral code, and notifies admins.
                    const { data, error } = await supabase.functions.invoke("partner-apply", {
                      body: {
                        contact_name: contactName,
                        email,
                        phone,
                        preferred_language: language,
                        region: region || null,
                        how_heard_about_us: howHeard || null,
                      },
                    });

                    if (error) {
                      // A 409 from the function surfaces as a FunctionsHttpError;
                      // inspect the body for the duplicate marker.
                      const ctx = (error as { context?: Response }).context;
                      const body = ctx ? await ctx.json().catch(() => null) : null;
                      throw new Error(body?.duplicate ? "duplicate" : await extractFunctionError(error, "Failed to submit application"));
                    }
                    if (data?.error) throw new Error(data.error);

                    // Admin notification now happens server-side in partner-apply.
                    setSubmitted(true);
                  } catch (error) {
                    console.error("Error submitting partner application:", error);
                    toast.error(
                      error instanceof Error && error.message.includes("duplicate")
                        ? "An application with this email already exists."
                        : "Failed to submit application. Please try again."
                    );
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="contact_name">{t("partnerOnboarding.fullName", "Full Name")} *</Label>
                  <Input id="contact_name" name="contact_name" required placeholder="John Smith" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t("partnerOnboarding.email", "Email")} *</Label>
                  <Input id="email" name="email" type="email" required placeholder="john@example.com" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">{t("partnerOnboarding.phone", "Phone")} *</Label>
                  <Input id="phone" name="phone" type="tel" required placeholder="+34 600 000 000" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">{t("partnerOnboarding.preferredLanguage", "Preferred Language")} *</Label>
                  <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("partnerOnboarding.region", "Region")}</Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("partnerOnboarding.selectRegion", "Select your region")} />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.value.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("partnerOnboarding.howHeard", "How did you hear about us?")}</Label>
                  <Select value={howHeard} onValueChange={setHowHeard}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("partnerOnboarding.selectHowHeard", "Select option")} />
                    </SelectTrigger>
                    <SelectContent>
                      {HOW_HEARD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.value.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4">
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSubmitting
                      ? t("partnerOnboarding.submitting", "Submitting...")
                      : t("partnerOnboarding.registerInterest", "Register Your Interest")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Option C keeps /partner as lead capture, but a partner who would rather
              self-serve should not have to guess that /partner/join exists. Same
              persistent-underline + tap-target treatment as the sign-in link below
              (G3 / WCAG 1.4.1) rather than a second, differently-styled link. */}
          <p className="mt-6 text-center text-base text-muted-foreground">
            {t("partnerOnboarding.preferNow", "Prefer to do it all now?")}{" "}
            <Link
              to="/partner/join"
              className="inline-block py-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              {t("partnerOnboarding.completeNow", "Complete full registration")}
            </Link>
          </p>

          {/* Returning partners. This page is where the public nav sends everyone,
              so without this a partner who already has an account had no route to
              /partner/login except typing the URL. */}
          <p className="mt-2 text-center text-base text-muted-foreground">
            {t("partnerOnboarding.alreadyPartner", "Already a partner?")}{" "}
            {/* GOALS.md G3: a link sitting inside a sentence must not be
                distinguished by colour alone (WCAG 1.4.1), so the underline is
                persistent rather than hover-only. inline-block + py-1 gives a
                comfortable tap target, and focus-visible makes keyboard position
                obvious — a bare <Link> is focusable but shows nothing here. */}
            <Link
              to="/partner/login"
              className="inline-block py-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              {t("partnerOnboarding.signIn", "Sign in to your dashboard")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
