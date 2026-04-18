import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, AlertCircle, XCircle, Lock, Phone, Building2, Wallet, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { isB2BPartnerType } from "@/config/partnerTypes";
import type { PartnerOnboardingWizardData } from "@/types/partner";

import { SetPasswordStep } from "@/components/partner-invite/steps/SetPasswordStep";
import { ContactInfoStep } from "@/components/partner-invite/steps/ContactInfoStep";
import { OrganizationStep } from "@/components/partner-invite/steps/OrganizationStep";
import { PayoutStep } from "@/components/partner-invite/steps/PayoutStep";
import { ConfirmationStep } from "@/components/partner-invite/steps/ConfirmationStep";

type TokenStatus = "loading" | "valid" | "invalid" | "expired" | "used" | "submitting" | "completed";

interface PartnerInviteData {
  id: string;
  contact_name: string;
  email: string;
  partner_type: string;
  preferred_language: string;
}

interface WizardStep {
  id: string;
  titleKey: string;
  icon: typeof Lock;
  fields: string[];
  skippable: boolean;
}

function computeWizardSteps(missingFields: string[], partnerType: string): WizardStep[] {
  const steps: WizardStep[] = [];

  // Step 1: Always shown — Set Password
  steps.push({
    id: "password",
    titleKey: "partnerInvite.steps.setPassword",
    icon: Lock,
    fields: ["password", "confirmPassword"],
    skippable: false,
  });

  // Step 2: Contact Info (if any contact fields are missing)
  const contactFields = ["phone", "company_name", "position_title", "region"];
  const missingContact = contactFields.filter((f) => missingFields.includes(f));
  if (missingContact.length > 0) {
    steps.push({
      id: "contact",
      titleKey: "partnerInvite.steps.contactInfo",
      icon: Phone,
      fields: missingContact,
      skippable: true,
    });
  }

  // Step 3: Organization Details (only for B2B partner types)
  if (isB2BPartnerType(partnerType)) {
    const orgFields = ["organization_type", "organization_registration", "organization_website", "estimated_monthly_referrals"];
    const missingOrg = orgFields.filter((f) => missingFields.includes(f));
    if (missingOrg.length > 0) {
      steps.push({
        id: "organization",
        titleKey: "partnerInvite.steps.organization",
        icon: Building2,
        fields: missingOrg,
        skippable: true,
      });
    }
  }

  // Step 4: Payout Information (if missing)
  const payoutFields = ["payout_beneficiary_name", "payout_iban"];
  const missingPayout = payoutFields.filter((f) => missingFields.includes(f));
  if (missingPayout.length > 0) {
    steps.push({
      id: "payout",
      titleKey: "partnerInvite.steps.payout",
      icon: Wallet,
      fields: missingPayout,
      skippable: false,
    });
  }

  // Final Step: Confirmation (always shown)
  steps.push({
    id: "confirmation",
    titleKey: "partnerInvite.steps.confirm",
    icon: Check,
    fields: [],
    skippable: false,
  });

  return steps;
}

export default function PartnerInvitePage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<TokenStatus>("loading");
  const [partnerData, setPartnerData] = useState<PartnerInviteData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardData, setWizardData] = useState<PartnerOnboardingWizardData>({
    password: "",
    confirmPassword: "",
  });

  const steps = useMemo(
    () => computeWizardSteps(missingFields, partnerData?.partner_type || "referral"),
    [missingFields, partnerData?.partner_type]
  );
  const progress = steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0;

  useEffect(() => {
    if (token) {
      validateToken();
    } else {
      setStatus("invalid");
    }
  }, [token]);

  const validateToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("partner-validate-invite", {
        body: { token },
      });

      if (error) throw error;

      if (!data.valid) {
        if (data.error === "token_expired") setStatus("expired");
        else if (data.error === "token_used") setStatus("used");
        else setStatus("invalid");
        return;
      }

      setPartnerData(data.partner);
      setMissingFields(data.missingFields);

      // Set preferred language
      if (data.partner?.preferred_language) {
        i18n.changeLanguage(data.partner.preferred_language);
      }

      setStatus("valid");
    } catch (error) {
      console.error("Error validating token:", error);
      setStatus("invalid");
    }
  };

  const handleUpdate = (partial: Partial<PartnerOnboardingWizardData>) => {
    setWizardData((prev) => ({ ...prev, ...partial }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleComplete = async () => {
    setStatus("submitting");

    try {
      // Build profile payload — only non-empty values
      const profile: Record<string, string> = {};
      const profileFields = [
        "phone", "company_name", "position_title",
        "organization_type", "organization_registration", "organization_website",
        "estimated_monthly_referrals",
        "payout_beneficiary_name", "payout_iban",
        "region",
      ];

      for (const field of profileFields) {
        const value = wizardData[field as keyof PartnerOnboardingWizardData];
        if (value && typeof value === "string" && value.trim()) {
          profile[field] = value.trim();
        }
      }

      const { data, error } = await supabase.functions.invoke("partner-complete-invite", {
        body: {
          token,
          password: wizardData.password,
          profile,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        if (data?.error === "token_expired") {
          setStatus("expired");
          return;
        }
        if (data?.error === "token_used") {
          setStatus("used");
          return;
        }
        throw new Error(data?.error || "Failed to complete setup");
      }

      // Set the session from the server response
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      setStatus("completed");

      // Redirect to partner dashboard after a brief welcome screen
      const redirectTo = data.redirectTo || "/partner-dashboard";
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 2500);
    } catch (error: any) {
      console.error("Error completing invite:", error);
      toast.error(error.message || t("common.error", "An error occurred"));
      setStatus("valid");
    }
  };

  // --- Status Screens ---

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">{t("common.loading", "Loading...")}</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {t("partnerInvite.invalid.title", "Invalid Invitation")}
            </h2>
            <p className="text-muted-foreground">
              {t("partnerInvite.invalid.description", "This invitation link is invalid. Please contact ICE Alarm for assistance.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {t("partnerInvite.expired.title", "Invitation Expired")}
            </h2>
            <p className="text-muted-foreground">
              {t("partnerInvite.expired.description", "This invitation has expired. Please contact ICE Alarm to request a new one.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "used") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {t("partnerInvite.used.title", "Already Completed")}
            </h2>
            <p className="text-muted-foreground mb-4">
              {t("partnerInvite.used.description", "This invitation has already been used. You can log in to your partner account.")}
            </p>
            <Button onClick={() => (window.location.href = "/partner/login")}>
              {t("common.login", "Log In")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {t("partnerInvite.completed.title", "Welcome to ICE Alarm!")}
            </h2>
            <p className="text-muted-foreground">
              {t("partnerInvite.completed.subtitle", "Your partner account is ready. Redirecting to your dashboard...")}
            </p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto mt-4 text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Wizard ---

  const currentStepDef = steps[currentStep];

  const renderStep = () => {
    if (!currentStepDef) return null;

    switch (currentStepDef.id) {
      case "password":
        return (
          <SetPasswordStep
            data={wizardData}
            onUpdate={handleUpdate}
            onNext={handleNext}
          />
        );
      case "contact":
        return (
          <ContactInfoStep
            data={wizardData}
            fields={currentStepDef.fields}
            onUpdate={handleUpdate}
            onNext={handleNext}
            onSkip={handleSkip}
            onBack={handleBack}
          />
        );
      case "organization":
        return (
          <OrganizationStep
            data={wizardData}
            fields={currentStepDef.fields}
            onUpdate={handleUpdate}
            onNext={handleNext}
            onSkip={handleSkip}
            onBack={handleBack}
          />
        );
      case "payout":
        return (
          <PayoutStep
            data={wizardData}
            onUpdate={handleUpdate}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case "confirmation":
        return (
          <ConfirmationStep
            data={wizardData}
            partnerName={partnerData?.contact_name || ""}
            isSubmitting={status === "submitting"}
            onComplete={handleComplete}
            onBack={handleBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Logo className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">
            {t("partnerInvite.title", "Set Up Your Partner Account")}
          </h1>
          {partnerData && (
            <p className="text-muted-foreground text-sm mt-1">
              {partnerData.contact_name}
            </p>
          )}
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;

              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors",
                    isCompleted && "bg-primary text-primary-foreground",
                    isActive && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground mt-1 text-center">
            {t("partnerInvite.stepOf", "Step {{current}} of {{total}}", {
              current: currentStep + 1,
              total: steps.length,
            })}
          </p>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6">
            {renderStep()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
