import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { StaffOnboardingWizardData } from "@/types/staff";

interface EmergencyContactStepProps {
  data: StaffOnboardingWizardData;
  fields: string[];
  onUpdate: (data: Partial<StaffOnboardingWizardData>) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function EmergencyContactStep({ data, fields, onUpdate, onNext, onSkip, onBack }: EmergencyContactStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("staffInvite.emergency.title", "Emergency Contact")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("staffInvite.emergency.subtitle", "Someone we can contact in case of emergency")}
        </p>
      </div>

      <div className="space-y-4">
        {fields.includes("emergency_contact_name") && (
          <div>
            <Label htmlFor="emergency_contact_name">
              {t("common.contactName", "Contact Name")}
            </Label>
            <Input
              id="emergency_contact_name"
              value={data.emergency_contact_name || ""}
              onChange={(e) => onUpdate({ emergency_contact_name: e.target.value })}
              placeholder={t("common.fullName", "Full name")}
            />
          </div>
        )}

        {fields.includes("emergency_contact_phone") && (
          <div>
            <Label htmlFor="emergency_contact_phone">
              {t("common.contactPhone", "Contact Phone")}
            </Label>
            <Input
              id="emergency_contact_phone"
              type="tel"
              value={data.emergency_contact_phone || ""}
              onChange={(e) => onUpdate({ emergency_contact_phone: e.target.value })}
              placeholder="+34 600 000 000"
            />
          </div>
        )}

        {fields.includes("emergency_contact_relationship") && (
          <div>
            <Label htmlFor="emergency_contact_relationship">
              {t("common.relationship", "Relationship")}
            </Label>
            <Input
              id="emergency_contact_relationship"
              value={data.emergency_contact_relationship || ""}
              onChange={(e) => onUpdate({ emergency_contact_relationship: e.target.value })}
              placeholder={t("common.relationshipPlaceholder", "e.g. Spouse, Parent, Friend")}
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
