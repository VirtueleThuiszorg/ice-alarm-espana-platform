import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PartnerOnboardingWizardData } from "@/types/partner";

interface ConfirmationStepProps {
  data: PartnerOnboardingWizardData;
  partnerName: string;
  isSubmitting: boolean;
  onComplete: () => void;
  onBack: () => void;
}

export function ConfirmationStep({ data, partnerName, isSubmitting, onComplete, onBack }: ConfirmationStepProps) {
  const { t } = useTranslation();

  // Gather what the user filled in (excluding password)
  const filledFields: { label: string; value: string }[] = [];

  if (data.phone) filledFields.push({ label: t("common.phone", "Phone"), value: data.phone });
  if (data.company_name) filledFields.push({ label: t("common.companyName", "Company"), value: data.company_name });
  if (data.position_title) filledFields.push({ label: t("common.position", "Position"), value: data.position_title });
  if (data.region) filledFields.push({ label: t("common.region", "Region"), value: data.region });
  if (data.organization_type) filledFields.push({ label: t("partnerInvite.organization.type", "Organization Type"), value: data.organization_type });
  if (data.organization_registration) filledFields.push({ label: t("partnerInvite.organization.registration", "Registration"), value: data.organization_registration });
  if (data.organization_website) filledFields.push({ label: t("partnerInvite.organization.website", "Website"), value: data.organization_website });
  if (data.estimated_monthly_referrals) filledFields.push({ label: t("partnerInvite.organization.estimatedReferrals", "Est. Monthly Referrals"), value: data.estimated_monthly_referrals });
  if (data.payout_beneficiary_name) filledFields.push({ label: t("partnerInvite.payout.beneficiary", "Beneficiary Name"), value: data.payout_beneficiary_name });
  if (data.payout_iban) filledFields.push({ label: t("partnerInvite.payout.iban", "IBAN"), value: data.payout_iban });

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("partnerInvite.confirm.title", "All Set!")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("partnerInvite.confirm.subtitle", "Review your details and complete setup")}
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 text-center">
        <p className="text-lg font-medium">
          {t("partnerInvite.confirm.welcome", "Welcome, {{name}}!", { name: partnerName })}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("partnerInvite.confirm.passwordSet", "Your password has been set.")}
        </p>
      </div>

      {filledFields.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t("partnerInvite.confirm.yourInfo", "Your Information")}
          </h3>
          <div className="bg-background border rounded-lg divide-y">
            {filledFields.map(({ label, value }) => (
              <div key={label} className="px-4 py-2 flex justify-between gap-4">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {t("partnerInvite.confirm.updateLater", "You can update your information later from your partner dashboard settings.")}
      </p>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          {t("common.back", "Back")}
        </Button>
        <Button onClick={onComplete} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("partnerInvite.confirm.completing", "Setting up your account...")}
            </>
          ) : (
            t("partnerInvite.confirm.completeSetup", "Complete Setup")
          )}
        </Button>
      </div>
    </div>
  );
}
