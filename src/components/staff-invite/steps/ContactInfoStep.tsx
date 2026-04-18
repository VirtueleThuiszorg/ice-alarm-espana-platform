import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { StaffOnboardingWizardData } from "@/types/staff";

interface ContactInfoStepProps {
  data: StaffOnboardingWizardData;
  fields: string[];
  onUpdate: (data: Partial<StaffOnboardingWizardData>) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function ContactInfoStep({ data, fields, onUpdate, onNext, onSkip, onBack }: ContactInfoStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("staffInvite.contact.title", "Contact Details")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("staffInvite.contact.subtitle", "How can we reach you?")}
        </p>
      </div>

      <div className="space-y-4">
        {fields.includes("phone") && (
          <div>
            <Label htmlFor="phone">
              {t("common.phone", "Phone")}
            </Label>
            <Input
              id="phone"
              type="tel"
              value={data.phone || ""}
              onChange={(e) => onUpdate({ phone: e.target.value })}
              placeholder="+34 600 000 000"
            />
          </div>
        )}

        {fields.includes("personal_mobile") && (
          <div>
            <Label htmlFor="personal_mobile">
              {t("common.personalMobile", "Personal Mobile")}
            </Label>
            <Input
              id="personal_mobile"
              type="tel"
              value={data.personal_mobile || ""}
              onChange={(e) => onUpdate({ personal_mobile: e.target.value })}
              placeholder="+34 6XX XXX XXX"
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
