import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { StaffOnboardingWizardData } from "@/types/staff";

interface AddressStepProps {
  data: StaffOnboardingWizardData;
  fields: string[];
  onUpdate: (data: Partial<StaffOnboardingWizardData>) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function AddressStep({ data, fields, onUpdate, onNext, onSkip, onBack }: AddressStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("staffInvite.address.title", "Your Address")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("staffInvite.address.subtitle", "Your home address for our records")}
        </p>
      </div>

      <div className="space-y-4">
        {fields.includes("address_line1") && (
          <div>
            <Label htmlFor="address_line1">
              {t("common.addressLine1", "Address Line 1")}
            </Label>
            <Input
              id="address_line1"
              value={data.address_line1 || ""}
              onChange={(e) => onUpdate({ address_line1: e.target.value })}
              placeholder={t("common.addressLine1Placeholder", "Street address")}
            />
          </div>
        )}

        {fields.includes("address_line2") && (
          <div>
            <Label htmlFor="address_line2">
              {t("common.addressLine2", "Address Line 2")}
            </Label>
            <Input
              id="address_line2"
              value={data.address_line2 || ""}
              onChange={(e) => onUpdate({ address_line2: e.target.value })}
              placeholder={t("common.addressLine2Placeholder", "Apt, suite, etc.")}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {fields.includes("city") && (
            <div>
              <Label htmlFor="city">
                {t("common.city", "City")}
              </Label>
              <Input
                id="city"
                value={data.city || ""}
                onChange={(e) => onUpdate({ city: e.target.value })}
                placeholder="Albox"
              />
            </div>
          )}

          {fields.includes("province") && (
            <div>
              <Label htmlFor="province">
                {t("common.province", "Province")}
              </Label>
              <Input
                id="province"
                value={data.province || ""}
                onChange={(e) => onUpdate({ province: e.target.value })}
                placeholder="Almería"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {fields.includes("postal_code") && (
            <div>
              <Label htmlFor="postal_code">
                {t("common.postalCode", "Postal Code")}
              </Label>
              <Input
                id="postal_code"
                value={data.postal_code || ""}
                onChange={(e) => onUpdate({ postal_code: e.target.value })}
                placeholder="04800"
              />
            </div>
          )}

          {fields.includes("country") && (
            <div>
              <Label htmlFor="country">
                {t("common.country", "Country")}
              </Label>
              <Input
                id="country"
                value={data.country || "Spain"}
                onChange={(e) => onUpdate({ country: e.target.value })}
                placeholder="Spain"
              />
            </div>
          )}
        </div>
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
