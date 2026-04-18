import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { StaffOnboardingWizardData } from "@/types/staff";

interface PersonalInfoStepProps {
  data: StaffOnboardingWizardData;
  fields: string[];
  onUpdate: (data: Partial<StaffOnboardingWizardData>) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function PersonalInfoStep({ data, fields, onUpdate, onNext, onSkip, onBack }: PersonalInfoStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("staffInvite.personal.title", "Personal Information")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("staffInvite.personal.subtitle", "Please provide the following details")}
        </p>
      </div>

      <div className="space-y-4">
        {fields.includes("date_of_birth") && (
          <div>
            <Label htmlFor="date_of_birth">
              {t("common.dateOfBirth", "Date of Birth")}
            </Label>
            <Input
              id="date_of_birth"
              type="date"
              value={data.date_of_birth || ""}
              onChange={(e) => onUpdate({ date_of_birth: e.target.value })}
            />
          </div>
        )}

        {fields.includes("nationality") && (
          <div>
            <Label htmlFor="nationality">
              {t("common.nationality", "Nationality")}
            </Label>
            <Input
              id="nationality"
              value={data.nationality || ""}
              onChange={(e) => onUpdate({ nationality: e.target.value })}
              placeholder={t("common.nationalityPlaceholder", "e.g. Spanish")}
            />
          </div>
        )}

        {fields.includes("nie_number") && (
          <div>
            <Label htmlFor="nie_number">
              {t("common.nieNumber", "NIE Number")}
            </Label>
            <Input
              id="nie_number"
              value={data.nie_number || ""}
              onChange={(e) => onUpdate({ nie_number: e.target.value })}
              placeholder="X1234567A"
            />
          </div>
        )}

        {fields.includes("social_security_number") && (
          <div>
            <Label htmlFor="social_security_number">
              {t("common.socialSecurityNumber", "Social Security Number")}
            </Label>
            <Input
              id="social_security_number"
              value={data.social_security_number || ""}
              onChange={(e) => onUpdate({ social_security_number: e.target.value })}
            />
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          {t("common.back", "Back")}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip}>
            {t("common.skip", "Skip")}
          </Button>
          <Button onClick={onNext}>
            {t("common.next", "Next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
