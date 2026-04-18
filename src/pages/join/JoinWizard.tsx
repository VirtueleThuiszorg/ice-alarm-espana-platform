import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, User, Users, MapPin, Phone, HeartPulse, Smartphone, FileText, CreditCard, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { JoinWizardData, initialJoinWizardData } from "@/types/wizard";
import { Logo } from "@/components/ui/logo";
import { toast } from "sonner";
import { useRegistrationDraft } from "@/hooks/useRegistrationDraft";
import { extractUtmParams, storeReferralData } from "@/lib/crmEvents";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePricingSettings } from "@/hooks/usePricingSettings";
import { calculateOrder } from "@/config/pricing";
import { reportEvent, updateDailyMetrics } from "@/lib/syncHub";
// Step Components
import { JoinMembershipStep } from "@/components/join/steps/JoinMembershipStep";
import { JoinPersonalStep } from "@/components/join/steps/JoinPersonalStep";
import { JoinAddressStep } from "@/components/join/steps/JoinAddressStep";
import { JoinContactsStep } from "@/components/join/steps/JoinContactsStep";
import { JoinPendantStep } from "@/components/join/steps/JoinPendantStep";
import { JoinSummaryStep } from "@/components/join/steps/JoinSummaryStep";
import { JoinPaymentStep } from "@/components/join/steps/JoinPaymentStep";
import { JoinConfirmationStep } from "@/components/join/steps/JoinConfirmationStep";
import { JoinMedicalStep } from "@/components/join/steps/JoinMedicalStep";

const steps = [
  { id: 1, titleKey: "joinWizard.steps.plan", icon: Users, shortTitleKey: "joinWizard.steps.plan" },
  { id: 2, titleKey: "joinWizard.steps.personal", icon: User, shortTitleKey: "joinWizard.steps.personal" },
  { id: 3, titleKey: "joinWizard.steps.address", icon: MapPin, shortTitleKey: "joinWizard.steps.address" },
  { id: 4, titleKey: "joinWizard.steps.contacts", icon: Phone, shortTitleKey: "joinWizard.steps.contacts" },
  { id: 5, titleKey: "joinWizard.steps.medical", icon: HeartPulse, shortTitleKey: "joinWizard.steps.medical" },
  { id: 6, titleKey: "joinWizard.steps.device", icon: Smartphone, shortTitleKey: "joinWizard.steps.device" },
  { id: 7, titleKey: "joinWizard.steps.review", icon: FileText, shortTitleKey: "joinWizard.steps.review" },
  { id: 8, titleKey: "joinWizard.steps.payment", icon: CreditCard, shortTitleKey: "joinWizard.steps.payment" },
  { id: 9, titleKey: "joinWizard.steps.complete", icon: PartyPopper, shortTitleKey: "joinWizard.steps.complete" },
];

const WIZARD_STORAGE_KEY = "join_wizard_data";

export default function JoinWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<JoinWizardData>(initialJoinWizardData);
  const [stepValidation, setStepValidation] = useState<Record<number, boolean>>({});
  const [isSubmitting] = useState(false);

  // Company settings for dynamic phone/email
  const { settings: companySettings } = useCompanySettings();
  const { registrationFeeEnabled, registrationFeeDiscount } = usePricingSettings();

  // Progressive save hook
  const { saveDraft, clearSession } = useRegistrationDraft();

  // Capture partner referral code and UTM params from URL
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      // Extract UTM parameters if present
      const utmParams = extractUtmParams(searchParams);

      // Store referral code and UTM data - first-touch wins, don't overwrite existing
      storeReferralData(refCode, utmParams);
    }
  }, [searchParams]);

  // Handle return from Stripe checkout
  useEffect(() => {
    const success = searchParams.get("success");
    const cancelled = searchParams.get("cancelled");
    const orderNumber = searchParams.get("order");

    if (success === "true" && orderNumber) {
      // Payment was successful - load saved data and go to confirmation
      const savedData = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);

          // Report the sale to Sync Hub
          try {
            const order = calculateOrder({
              membershipType: parsed.membershipType,
              billingFrequency: parsed.billingFrequency,
              includePendant: parsed.includePendant,
              pendantCount: parsed.pendantCount,
              includeShipping: parsed.includePendant,
              registrationFeeEnabled: registrationFeeEnabled ?? false,
              registrationFeeDiscount: registrationFeeDiscount ?? 0
            });
            const totalPence = Math.round(order.grandTotal * 100);

            reportEvent('new_sale', {
              amount: totalPence,
              label: `New LifeLink sale — £${(totalPence / 100).toFixed(2)}`,
              metadata: {
                planName: parsed.membershipType,
                orderId: orderNumber,
                email: parsed.primaryMember?.email
              }
            });
            updateDailyMetrics({ revenuePence: totalPence });
          } catch (e) {
            console.error('[SyncHub] Error calculating metrics', e);
          }

          setWizardData({
            ...parsed,
            paymentComplete: true,
            orderId: orderNumber,
          });
          setCurrentStep(9); // Go to confirmation step
          toast.success(t("joinWizard.payment.success"));
        } catch (e) {
          console.error("Failed to parse saved wizard data:", e);
        }
      } else {
        // No saved data, but payment was successful
        setWizardData((prev) => ({
          ...prev,
          paymentComplete: true,
          orderId: orderNumber,
        }));
        setCurrentStep(9);
        toast.success(t("joinWizard.payment.success"));
      }
      // Clear saved data and registration session
      localStorage.removeItem(WIZARD_STORAGE_KEY);
      clearSession();
      // Clear URL params
      navigate("/join", { replace: true });
    } else if (cancelled === "true") {
      // Payment was cancelled - restore saved data
      const savedData = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setWizardData(parsed);
          setCurrentStep(8); // Go back to payment step
        } catch (e) {
          console.error("Failed to parse saved wizard data:", e);
        }
      }
      toast.error(t("joinWizard.payment.cancelled"));
      // Clear URL params
      navigate("/join", { replace: true });
    }
  }, [searchParams, navigate]);

  const updateWizardData = (data: Partial<JoinWizardData>) => {
    setWizardData((prev) => ({ ...prev, ...data }));
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1:
        return !!wizardData.membershipType;
      case 2:
        const primaryValid = !!(
          wizardData.primaryMember.firstName &&
          wizardData.primaryMember.lastName &&
          wizardData.primaryMember.email &&
          wizardData.primaryMember.phone &&
          wizardData.primaryMember.dateOfBirth
        );
        if (wizardData.membershipType === "couple") {
          const partnerValid = !!(
            wizardData.partnerMember?.firstName &&
            wizardData.partnerMember?.lastName &&
            wizardData.partnerMember?.email &&
            wizardData.partnerMember?.phone &&
            wizardData.partnerMember?.dateOfBirth
          );
          return primaryValid && partnerValid;
        }
        return primaryValid;
      case 3:
        const primaryAddressValid = !!(
          wizardData.address.addressLine1 &&
          wizardData.address.city &&
          wizardData.address.province &&
          wizardData.address.postalCode
        );
        if (wizardData.membershipType === "couple" && wizardData.separateAddresses) {
          const partnerAddressValid = !!(
            wizardData.partnerAddress?.addressLine1 &&
            wizardData.partnerAddress?.city &&
            wizardData.partnerAddress?.province &&
            wizardData.partnerAddress?.postalCode
          );
          return primaryAddressValid && partnerAddressValid;
        }
        return primaryAddressValid;
      case 4:
        return wizardData.emergencyContacts.length >= 1;
      case 5:
        return true; // Medical info is optional but recommended
      case 6:
        return true; // Pendant option always valid
      case 7:
        return wizardData.acceptTerms && wizardData.acceptPrivacy;
      case 8:
        return wizardData.paymentComplete;
      case 9:
        return true;
      default:
        return true;
    }
  };

  const getValidationMessage = (): string | null => {
    switch (currentStep) {
      case 2:
        if (!wizardData.primaryMember.firstName || !wizardData.primaryMember.lastName) {
          return t("joinWizard.validation.enterFullName");
        }
        if (!wizardData.primaryMember.email) {
          return t("joinWizard.validation.enterEmail");
        }
        if (!wizardData.primaryMember.phone) {
          return t("joinWizard.validation.enterPhone");
        }
        if (!wizardData.primaryMember.dateOfBirth) {
          return t("joinWizard.validation.enterDob");
        }
        if (wizardData.membershipType === "couple") {
          if (!wizardData.partnerMember?.firstName || !wizardData.partnerMember?.lastName) {
            return t("joinWizard.validation.enterPartnerFullName");
          }
          if (!wizardData.partnerMember?.email) {
            return t("joinWizard.validation.enterPartnerEmail");
          }
          if (!wizardData.partnerMember?.phone) {
            return t("joinWizard.validation.enterPartnerPhone");
          }
          if (!wizardData.partnerMember?.dateOfBirth) {
            return t("joinWizard.validation.enterPartnerDob");
          }
        }
        return null;
      case 3:
        if (!wizardData.address.addressLine1) {
          return t("joinWizard.validation.enterStreetAddress");
        }
        if (!wizardData.address.city) {
          return t("joinWizard.validation.enterCity");
        }
        if (!wizardData.address.province) {
          return t("joinWizard.validation.selectProvince");
        }
        if (!wizardData.address.postalCode) {
          return t("joinWizard.validation.enterPostalCode");
        }
        if (wizardData.membershipType === "couple" && wizardData.separateAddresses) {
          if (!wizardData.partnerAddress?.addressLine1) {
            return t("joinWizard.validation.enterPartnerStreet");
          }
          if (!wizardData.partnerAddress?.city) {
            return t("joinWizard.validation.enterPartnerCity");
          }
          if (!wizardData.partnerAddress?.province) {
            return t("joinWizard.validation.selectPartnerProvince");
          }
          if (!wizardData.partnerAddress?.postalCode) {
            return t("joinWizard.validation.enterPartnerPostal");
          }
        }
        return null;
      case 4:
        return t("joinWizard.validation.addEmergencyContact");
      case 7:
        if (!wizardData.acceptTerms) {
          return t("joinWizard.validation.acceptTerms");
        }
        if (!wizardData.acceptPrivacy) {
          return t("joinWizard.validation.acceptPrivacy");
        }
        return null;
      default:
        return null;
    }
  };

  const handleNext = async () => {
    if (validateCurrentStep()) {
      setStepValidation((prev) => ({ ...prev, [currentStep]: true }));

      // Save progress to database before advancing
      // This ensures we capture data even if user abandons later
      await saveDraft(currentStep, wizardData);

      if (currentStep < steps.length) {
        setCurrentStep(currentStep + 1);
      }
    } else {
      const message = getValidationMessage();
      if (message) {
        toast.error(message);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepId: number) => {
    // Allow navigation to completed steps or current step (but not beyond, and not after completion)
    if (stepId <= currentStep && currentStep < 9) {
      setCurrentStep(stepId);
    }
  };

  const handlePaymentInitiated = () => {
    // Save wizard data to localStorage before redirecting to Stripe
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(wizardData));
  };

  const progress = ((currentStep - 1) / (steps.length - 1)) * 100;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <JoinMembershipStep data={wizardData} onUpdate={updateWizardData} />;
      case 2:
        return <JoinPersonalStep data={wizardData} onUpdate={updateWizardData} />;
      case 3:
        return <JoinAddressStep data={wizardData} onUpdate={updateWizardData} />;
      case 4:
        return <JoinContactsStep data={wizardData} onUpdate={updateWizardData} />;
      case 5:
        return <JoinMedicalStep data={wizardData} onUpdate={updateWizardData} />;
      case 6:
        return <JoinPendantStep data={wizardData} onUpdate={updateWizardData} />;
      case 7:
        return <JoinSummaryStep data={wizardData} onUpdate={updateWizardData} />;
      case 8:
        return (
          <JoinPaymentStep
            data={wizardData}
            onUpdate={updateWizardData}
            onPaymentInitiated={handlePaymentInitiated}
          />
        );
      case 9:
        return <JoinConfirmationStep data={wizardData} />;
      default:
        return null;
    }
  };

  // Don't show navigation buttons on payment step (handled internally) or confirmation step
  const showNavigationButtons = currentStep !== 8 && currentStep !== 9;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container max-w-5xl flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-8 w-auto" />
          </Link>
          {currentStep < 9 && (
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              {t("joinWizard.exit")}
            </Link>
          )}
        </div>
      </header>

      <main className="container max-w-4xl py-8 px-4">
        {currentStep < 9 && (
          <>
            {/* Progress Bar */}
            <Progress value={progress} className="h-2 mb-6" />

            {/* Step Indicators - Mobile: Icons only, Desktop: Icons + Text */}
            <div className="flex justify-between mb-8 overflow-x-auto pb-2">
              {steps.slice(0, -1).map((step) => {
                const StepIcon = step.icon;
                const isCompleted = stepValidation[step.id];
                const isCurrent = step.id === currentStep;
                const isClickable = step.id <= currentStep;

                return (
                  <button
                    key={step.id}
                    onClick={() => handleStepClick(step.id)}
                    disabled={!isClickable}
                    className={cn(
                      "flex flex-col items-center gap-1 min-w-[50px] md:min-w-[70px] p-2 rounded-lg transition-colors",
                      isClickable && "cursor-pointer hover:bg-accent",
                      !isClickable && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors",
                        isCurrent && "bg-primary text-primary-foreground",
                        isCompleted && !isCurrent && "bg-status-active text-white",
                        !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
                      )}
                    >
                      {isCompleted && !isCurrent ? (
                        <Check className="h-4 w-4 md:h-5 md:w-5" />
                      ) : (
                        <StepIcon className="h-4 w-4 md:h-5 md:w-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium text-center hidden md:block",
                        isCurrent && "text-primary",
                        !isCurrent && "text-muted-foreground"
                      )}
                    >
                      {t(step.shortTitleKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Step Content */}
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-8 pb-8 px-6 md:px-10">
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        {showNavigationButtons && (
          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("joinWizard.back")}
            </Button>

            <Button
              onClick={handleNext}
              className="gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>{t("joinWizard.processing")}</>
              ) : (
                <>
                  {t("joinWizard.continue")}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}

        {/* Back button on payment step */}
        {currentStep === 8 && (
          <div className="flex justify-start mt-8">
            <Button
              variant="outline"
              onClick={handleBack}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("joinWizard.backToReview")}
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-6 mt-auto">
        <div className="container max-w-4xl text-center text-sm text-muted-foreground">
          <p>
            {t("joinWizard.needHelp")}{" "}
            <a href={`tel:${companySettings.emergency_phone.replace(/\s/g, "")}`} className="text-primary hover:underline">
              {t("joinWizard.callUs")}
            </a>{" "}
            {t("common.or")}{" "}
            <a href={`mailto:${companySettings.support_email}`} className="text-primary hover:underline">
              {t("joinWizard.emailUs")}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
