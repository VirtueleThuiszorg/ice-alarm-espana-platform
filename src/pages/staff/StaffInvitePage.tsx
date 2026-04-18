import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, AlertCircle, XCircle, Lock, User, Phone, MapPin, HeartPulse, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import type { StaffOnboardingWizardData } from "@/types/staff";

import { SetPasswordStep } from "@/components/staff-invite/steps/SetPasswordStep";
import { PersonalInfoStep } from "@/components/staff-invite/steps/PersonalInfoStep";
import { ContactInfoStep } from "@/components/staff-invite/steps/ContactInfoStep";
import { AddressStep } from "@/components/staff-invite/steps/AddressStep";
import { EmergencyContactStep } from "@/components/staff-invite/steps/EmergencyContactStep";
import { ConfirmationStep } from "@/components/staff-invite/steps/ConfirmationStep";

type TokenStatus = "loading" | "valid" | "invalid" | "expired" | "used" | "submitting" | "completed";

interface StaffInviteData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  preferred_language: string;
}

interface WizardStep {
  id: string;
  titleKey: string;
  icon: typeof Lock;
  fields: string[];
  skippable: boolean;
}

function computeWizardSteps(missingFields: string[]): WizardStep[] {
  const steps: WizardStep[] = [];

  // Step 1: Always shown — Set Password
  steps.push({
    id: "password",
    titleKey: "staffInvite.steps.setPassword",
    icon: Lock,
    fields: ["password", "confirmPassword"],
    skippable: false,
  });

  // Step 2: Personal Info (if any personal fields are missing)
  const personalFields = ["date_of_birth", "nationality", "nie_number", "social_security_number"];
  const missingPersonal = personalFields.filter((f) => missingFields.includes(f));
  if (missingPersonal.length > 0) {
    steps.push({
      id: "personal",
      titleKey: "staffInvite.steps.personalInfo",
      icon: User,
      fields: missingPersonal,
      skippable: true,
    });
  }

  // Step 3: Contact (if phone/mobile missing)
  const contactFields = ["phone", "personal_mobile"];
  const missingContact = contactFields.filter((f) => missingFields.includes(f));
  if (missingContact.length > 0) {
    steps.push({
      id: "contact",
      titleKey: "staffInvite.steps.contactInfo",
      icon: Phone,
      fields: missingContact,
      skippable: true,
    });
  }

  // Step 4: Address (if address fields missing)
  const addressFields = ["address_line1", "address_line2", "city", "province", "postal_code", "country"];
  const missingAddress = addressFields.filter((f) => missingFields.includes(f));
  if (missingAddress.length > 0) {
    steps.push({
      id: "address",
      titleKey: "staffInvite.steps.address",
      icon: MapPin,
      fields: missingAddress,
      skippable: true,
    });
  }

  // Step 5: Emergency Contact (if missing)
  const emergencyFields = ["emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship"];
  const missingEmergency = emergencyFields.filter((f) => missingFields.includes(f));
  if (missingEmergency.length > 0) {
    steps.push({
      id: "emergency",
      titleKey: "staffInvite.steps.emergencyContact",
      icon: HeartPulse,
      fields: missingEmergency,
      skippable: true,
    });
  }

  // Final Step: Confirmation (always shown)
  steps.push({
    id: "confirmation",
    titleKey: "staffInvite.steps.confirm",
    icon: Check,
    fields: [],
    skippable: false,
  });

  return steps;
}

export default function StaffInvitePage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<TokenStatus>("loading");
  const [staffData, setStaffData] = useState<StaffInviteData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardData, setWizardData] = useState<StaffOnboardingWizardData>({
    password: "",
    confirmPassword: "",
  });

  const steps = useMemo(() => computeWizardSteps(missingFields), [missingFields]);
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
      const { data, error } = await supabase.functions.invoke("staff-validate-invite", {
        body: { token },
      });

      if (error) throw error;

      if (!data.valid) {
        if (data.error === "token_expired") setStatus("expired");
        else if (data.error === "token_used") setStatus("used");
        else setStatus("invalid");
        return;
      }

      setStaffData(data.staff);
      setMissingFields(data.missingFields);

      // Set preferred language
      if (data.staff?.preferred_language) {
        i18n.changeLanguage(data.staff.preferred_language);
      }

      setStatus("valid");
    } catch (error) {
      console.error("Error validating token:", error);
      setStatus("invalid");
    }
  };

  const handleUpdate = (partial: Partial<StaffOnboardingWizardData>) => {
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
        "date_of_birth", "nationality", "nie_number", "social_security_number",
        "phone", "personal_mobile",
        "address_line1", "address_line2", "city", "province", "postal_code", "country",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
      ];

      for (const field of profileFields) {
        const value = wizardData[field as keyof StaffOnboardingWizardData];
        if (value && typeof value === "string" && value.trim()) {
          profile[field] = value.trim();
        }
      }

      const { data, error } = await supabase.functions.invoke("staff-complete-invite", {
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

      // Redirect to dashboard after a brief welcome screen
      const redirectTo = data.redirectTo || "/call-centre";
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
              {t("staffInvite.invalid.title", "Invalid Invitation")}
            </h2>
            <p className="text-muted-foreground">
              {t("staffInvite.invalid.description", "This invitation link is invalid. Please contact your administrator.")}
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
              {t("staffInvite.expired.title", "Invitation Expired")}
            </h2>
            <p className="text-muted-foreground">
              {t("staffInvite.expired.description", "This invitation has expired. Please ask your administrator to send a new one.")}
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
              {t("staffInvite.used.title", "Already Completed")}
            </h2>
            <p className="text-muted-foreground mb-4">
              {t("staffInvite.used.description", "This invitation has already been used. You can log in to your account.")}
            </p>
            <Button onClick={() => (window.location.href = "/staff/login")}>
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
              {t("staffInvite.completed.title", "Welcome to ICE Alarm!")}
            </h2>
            <p className="text-muted-foreground">
              {t("staffInvite.completed.subtitle", "Your account is ready. Redirecting to your dashboard...")}
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
      case "personal":
        return (
          <PersonalInfoStep
            data={wizardData}
            fields={currentStepDef.fields}
            onUpdate={handleUpdate}
            onNext={handleNext}
            onSkip={handleSkip}
            onBack={handleBack}
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
      case "address":
        return (
          <AddressStep
            data={wizardData}
            fields={currentStepDef.fields}
            onUpdate={handleUpdate}
            onNext={handleNext}
            onSkip={handleSkip}
            onBack={handleBack}
          />
        );
      case "emergency":
        return (
          <EmergencyContactStep
            data={wizardData}
            fields={currentStepDef.fields}
            onUpdate={handleUpdate}
            onNext={handleNext}
            onSkip={handleSkip}
            onBack={handleBack}
          />
        );
      case "confirmation":
        return (
          <ConfirmationStep
            data={wizardData}
            staffName={staffData?.first_name || ""}
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
            {t("staffInvite.title", "Set Up Your Account")}
          </h1>
          {staffData && (
            <p className="text-muted-foreground text-sm mt-1">
              {staffData.first_name} {staffData.last_name}
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
            {t("staffInvite.stepOf", "Step {{current}} of {{total}}", {
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
