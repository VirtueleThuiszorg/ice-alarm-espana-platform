import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PartnerOnboardingWizardData } from "@/types/partner";

const ORGANIZATION_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "sole_trader", label: "Sole Trader / Autónomo" },
  { value: "limited_company", label: "Limited Company (S.L.)" },
  { value: "corporation", label: "Corporation (S.A.)" },
  { value: "association", label: "Association" },
  { value: "foundation", label: "Foundation" },
  { value: "cooperative", label: "Cooperative" },
  { value: "other", label: "Other" },
];

interface OrganizationStepProps {
  data: PartnerOnboardingWizardData;
  fields: string[];
  onUpdate: (data: Partial<PartnerOnboardingWizardData>) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function OrganizationStep({ data, fields, onUpdate, onNext, onSkip, onBack }: OrganizationStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("partnerInvite.organization.title", "Organization Details")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("partnerInvite.organization.subtitle", "Tell us about your organization")}
        </p>
      </div>

      <div className="space-y-4">
        {fields.includes("organization_type") && (
          <div>
            <Label>{t("partnerInvite.organization.type", "Organization Type")}</Label>
            <Select
              value={data.organization_type || ""}
              onValueChange={(value) => onUpdate({ organization_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("partnerInvite.organization.selectType", "Select type...")} />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {fields.includes("organization_registration") && (
          <div>
            <Label htmlFor="organization_registration">
              {t("partnerInvite.organization.registration", "Registration Number (CIF/NIF)")}
            </Label>
            <Input
              id="organization_registration"
              placeholder="B12345678"
              value={data.organization_registration || ""}
              onChange={(e) => onUpdate({ organization_registration: e.target.value })}
            />
          </div>
        )}

        {fields.includes("organization_website") && (
          <div>
            <Label htmlFor="organization_website">
              {t("partnerInvite.organization.website", "Website")}
            </Label>
            <Input
              id="organization_website"
              type="url"
              placeholder="https://example.com"
              value={data.organization_website || ""}
              onChange={(e) => onUpdate({ organization_website: e.target.value })}
            />
          </div>
        )}

        {fields.includes("estimated_monthly_referrals") && (
          <div>
            <Label htmlFor="estimated_monthly_referrals">
              {t("partnerInvite.organization.estimatedReferrals", "Estimated Monthly Referrals")}
            </Label>
            <Select
              value={data.estimated_monthly_referrals || ""}
              onValueChange={(value) => onUpdate({ estimated_monthly_referrals: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("partnerInvite.organization.selectEstimate", "Select estimate...")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1-5">1 - 5</SelectItem>
                <SelectItem value="6-10">6 - 10</SelectItem>
                <SelectItem value="11-25">11 - 25</SelectItem>
                <SelectItem value="26-50">26 - 50</SelectItem>
                <SelectItem value="50+">50+</SelectItem>
              </SelectContent>
            </Select>
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
