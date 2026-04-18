import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PartnerOnboardingWizardData } from "@/types/partner";

interface ContactInfoStepProps {
  data: PartnerOnboardingWizardData;
  fields: string[];
  onUpdate: (data: Partial<PartnerOnboardingWizardData>) => void;
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
          {t("partnerInvite.contact.title", "Contact Information")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("partnerInvite.contact.subtitle", "Tell us how to reach you")}
        </p>
      </div>

      <div className="space-y-4">
        {fields.includes("phone") && (
          <div>
            <Label htmlFor="phone">{t("common.phone", "Phone")}</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+34 600 000 000"
              value={data.phone || ""}
              onChange={(e) => onUpdate({ phone: e.target.value })}
            />
          </div>
        )}

        {fields.includes("company_name") && (
          <div>
            <Label htmlFor="company_name">{t("common.companyName", "Company Name")}</Label>
            <Input
              id="company_name"
              placeholder={t("partnerInvite.contact.companyPlaceholder", "Your company or business name")}
              value={data.company_name || ""}
              onChange={(e) => onUpdate({ company_name: e.target.value })}
            />
          </div>
        )}

        {fields.includes("position_title") && (
          <div>
            <Label htmlFor="position_title">{t("common.position", "Position / Title")}</Label>
            <Input
              id="position_title"
              placeholder={t("partnerInvite.contact.positionPlaceholder", "e.g. Director, Manager")}
              value={data.position_title || ""}
              onChange={(e) => onUpdate({ position_title: e.target.value })}
            />
          </div>
        )}

        {fields.includes("region") && (
          <div>
            <Label htmlFor="region">{t("common.region", "Region")}</Label>
            <Input
              id="region"
              placeholder={t("partnerInvite.contact.regionPlaceholder", "e.g. Costa Blanca, Costa del Sol")}
              value={data.region || ""}
              onChange={(e) => onUpdate({ region: e.target.value })}
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
