import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PartnerOnboardingWizardData } from "@/types/partner";

interface PayoutStepProps {
  data: PartnerOnboardingWizardData;
  onUpdate: (data: Partial<PartnerOnboardingWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function PayoutStep({ data, onUpdate, onNext, onBack }: PayoutStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("partnerInvite.payout.title", "Payout Information")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("partnerInvite.payout.subtitle", "Where should we send your commission payments?")}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="payout_beneficiary_name">
            {t("partnerInvite.payout.beneficiary", "Beneficiary Name")}
          </Label>
          <Input
            id="payout_beneficiary_name"
            placeholder={t("partnerInvite.payout.beneficiaryPlaceholder", "Name on bank account")}
            value={data.payout_beneficiary_name || ""}
            onChange={(e) => onUpdate({ payout_beneficiary_name: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="payout_iban">
            {t("partnerInvite.payout.iban", "IBAN")}
          </Label>
          <Input
            id="payout_iban"
            placeholder="ES00 0000 0000 0000 0000 0000"
            value={data.payout_iban || ""}
            onChange={(e) => onUpdate({ payout_iban: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t("partnerInvite.payout.ibanNote", "Your IBAN is stored securely and used only for commission payments.")}
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          {t("common.back", "Back")}
        </Button>
        <Button onClick={onNext}>
          {t("common.next", "Next")}
        </Button>
      </div>
    </div>
  );
}
