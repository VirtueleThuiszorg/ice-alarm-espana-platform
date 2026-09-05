import { useTranslation } from "react-i18next";
import { JoinWizardData } from "@/types/wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PartyPopper, CheckCircle2, Mail, Phone, Calendar, Smartphone, Package, ArrowRight, Download , ShieldAlert} from "lucide-react";
import { Link } from "react-router-dom";
import { useCompanySettings } from "@/hooks/useCompanySettings";

import { telHref } from "@/lib/phone";
interface JoinConfirmationStepProps {
  data: JoinWizardData;
}

export function JoinConfirmationStep({ data }: JoinConfirmationStepProps) {
  const { settings: companySettings } = useCompanySettings();
  // Null when settings_emergency_phone is unset (PENDING_FOR_LEE.md S6).
  const phoneHref = telHref(companySettings.emergency_phone);
  const { t } = useTranslation();
  
  const nextSteps = [
    { icon: Mail, titleKey: "joinWizard.confirmation.checkEmail", descKey: "joinWizard.confirmation.checkEmailDesc" },
    { icon: Phone, titleKey: "joinWizard.confirmation.saveNumber", descKey: "joinWizard.confirmation.saveNumberDesc" },
    ...(data.includePendant
      ? [{ icon: Package, titleKey: "joinWizard.confirmation.pendantShipping", descKey: "joinWizard.confirmation.pendantShippingDesc" }]
      : [{ icon: Download, titleKey: "joinWizard.confirmation.downloadApp", descKey: "joinWizard.confirmation.downloadAppDesc" }]),
    { icon: Calendar, titleKey: "joinWizard.confirmation.welcomeCall", descKey: "joinWizard.confirmation.welcomeCallDesc" },
  ];

  return (
    <div className="space-y-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-status-active/10 flex items-center justify-center animate-pulse">
          <PartyPopper className="h-10 w-10 text-status-active" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-status-active">{t("joinWizard.confirmation.title")}</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            {t("joinWizard.confirmation.subtitle", { name: data.primaryMember.firstName })}
          </p>
        </div>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">{t("joinWizard.confirmation.registrationComplete")}</span>
          </div>
          {data.orderId && (
            <p className="text-sm text-muted-foreground mt-2">
              {t("joinWizard.confirmation.orderReference")}: <span className="font-mono">{data.orderId}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/*
        ONE THING LEFT. The wizard no longer collects emergency contacts, so at this moment the
        member has paid, their pendant is shipping, and NOBODY CAN BE CALLED FOR THEM. This
        screen is the one surface we know they see — email is not deliverable yet — so it must
        not say "you're all set", and it must offer BOTH routes: their link, and a phone number.
        ONBOARDING_SPLIT.md §6-A.
      */}
      <Card role="alert" className="border-2 border-destructive bg-destructive/5 text-left">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold uppercase tracking-wide text-destructive">
            <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            {t("joinWizard.confirmation.oneThingLeftTitle", "One thing left: your emergency contacts")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-semibold">
            {t(
              "joinWizard.confirmation.oneThingLeftBody",
              "Until we have at least one person to call, we can answer your alarm but we cannot reach your family.",
            )}
          </p>
          {/*
            Two sentences, not one sentence with an optional number stuck on the end. "Call us
            and we will take the details now" is a PROMISE; making it while rendering no number
            to call would be the same class of defect as the invented number this replaced. If
            settings_emergency_phone is unset (PENDING_FOR_LEE.md S6) the member is offered only
            the route that actually works.
          */}
          {phoneHref ? (
            <p className="text-sm">
              {t(
                "joinWizard.confirmation.oneThingLeftHow",
                // No emailed-link promise: no such email is sent (GMAIL_APP_PASSWORD unset,
                // icealarm.es unverified with Resend, SPF/DKIM/DMARC unpublished). Only the two
                // routes that actually work.
                "Call us and we will take the details now, or add them yourself once you sign in.",
              )}{" "}
              <a
                href={phoneHref}
                className="font-semibold text-primary underline underline-offset-2"
              >
                {companySettings.emergency_phone}
              </a>
            </p>
          ) : (
            <p className="text-sm">
              {t(
                "joinWizard.confirmation.oneThingLeftHowNoPhone",
                "Add them yourself once you sign in — it takes a minute.",
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t("joinWizard.confirmation.whatsNext")}</h3>
        <div className="grid gap-4 md:grid-cols-2 text-left">
          {nextSteps.map((step, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <step.icon className="h-4 w-4 text-primary" />
                  </div>
                  {t(step.titleKey)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t(step.descKey)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {data.includePendant && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3">
              <Smartphone className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium">{t("joinWizard.summary.gpsSafetyPendant")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("joinWizard.confirmation.shippingTo")}: {data.address.city}, {data.address.province}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
        <Button asChild size="lg" className="gap-2">
          <Link to="/login">{t("joinWizard.confirmation.goToDashboard")}<ArrowRight className="h-4 w-4" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/">{t("joinWizard.confirmation.returnHome")}</Link>
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        <p>{t("joinWizard.confirmation.questionsTitle")}</p>
        <p>
          {phoneHref && (
            <>
              {t("joinWizard.confirmation.callUsAt")}{" "}
              <a href={phoneHref} className="text-primary hover:underline">{t("joinWizard.callUs")}</a>{" "}
              {t("joinWizard.confirmation.orEmail")}{" "}
            </>
          )}
          <a href={`mailto:${companySettings.support_email}`} className="text-primary hover:underline">{companySettings.support_email}</a>
        </p>
      </div>
    </div>
  );
}