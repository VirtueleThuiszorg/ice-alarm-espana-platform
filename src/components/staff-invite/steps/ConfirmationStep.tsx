import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StaffOnboardingWizardData } from "@/types/staff";

interface ConfirmationStepProps {
  data: StaffOnboardingWizardData;
  staffName: string;
  isSubmitting: boolean;
  onComplete: () => void;
  onBack: () => void;
}

export function ConfirmationStep({ data, staffName, isSubmitting, onComplete, onBack }: ConfirmationStepProps) {
  const { t } = useTranslation();

  // Gather what the user filled in (excluding password)
  const filledFields: { label: string; value: string }[] = [];

  if (data.date_of_birth) filledFields.push({ label: t("common.dateOfBirth", "Date of Birth"), value: data.date_of_birth });
  if (data.nationality) filledFields.push({ label: t("common.nationality", "Nationality"), value: data.nationality });
  if (data.nie_number) filledFields.push({ label: t("common.nieNumber", "NIE Number"), value: data.nie_number });
  if (data.social_security_number) filledFields.push({ label: t("common.socialSecurityNumber", "Social Security"), value: data.social_security_number });
  if (data.phone) filledFields.push({ label: t("common.phone", "Phone"), value: data.phone });
  if (data.personal_mobile) filledFields.push({ label: t("common.personalMobile", "Personal Mobile"), value: data.personal_mobile });
  if (data.address_line1) filledFields.push({ label: t("common.address", "Address"), value: [data.address_line1, data.address_line2, data.city, data.province, data.postal_code, data.country].filter(Boolean).join(", ") });
  if (data.emergency_contact_name) filledFields.push({ label: t("common.emergencyContact", "Emergency Contact"), value: `${data.emergency_contact_name} (${data.emergency_contact_relationship || ""}) - ${data.emergency_contact_phone || ""}` });

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("staffInvite.confirm.title", "All Set!")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("staffInvite.confirm.subtitle", "Review your details and complete setup")}
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 text-center">
        <p className="text-lg font-medium">
          {t("staffInvite.welcome", "Welcome, {{name}}!", { name: staffName })}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("staffInvite.confirm.passwordSet", "Your password has been set.")}
        </p>
      </div>

      {filledFields.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t("staffInvite.confirm.yourInfo", "Your Information")}
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
        {t("staffInvite.confirm.updateLater", "You can update your information later from your preferences page.")}
      </p>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          {t("common.back", "Back")}
        </Button>
        <Button onClick={onComplete} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("staffInvite.confirm.completing", "Setting up your account...")}
            </>
          ) : (
            t("staffInvite.confirm.completeSetup", "Complete Setup")
          )}
        </Button>
      </div>
    </div>
  );
}
