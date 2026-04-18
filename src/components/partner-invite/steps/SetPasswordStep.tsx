import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PartnerOnboardingWizardData } from "@/types/partner";

interface SetPasswordStepProps {
  data: PartnerOnboardingWizardData;
  onUpdate: (data: Partial<PartnerOnboardingWizardData>) => void;
  onNext: () => void;
}

export function SetPasswordStep({ data, onUpdate, onNext }: SetPasswordStepProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const password = data.password || "";
  const confirmPassword = data.confirmPassword || "";

  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };

  const allValid = checks.length && checks.upper && checks.lower && checks.digit && checks.match;

  const handleNext = () => {
    if (allValid) onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">
          {t("partnerInvite.password.title", "Create Your Password")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("partnerInvite.password.subtitle", "Choose a secure password for your partner account")}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="password">
            {t("partnerInvite.password.password", "Password")}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onUpdate({ password: e.target.value })}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <Label htmlFor="confirmPassword">
            {t("partnerInvite.password.confirmPassword", "Confirm Password")}
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => onUpdate({ confirmPassword: e.target.value })}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Password requirements */}
        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium text-muted-foreground">
            {t("partnerInvite.password.requirements", "Password requirements:")}
          </p>
          <ul className="space-y-1">
            {[
              { key: "length", label: t("partnerInvite.password.reqLength", "At least 8 characters") },
              { key: "upper", label: t("partnerInvite.password.reqUpper", "One uppercase letter") },
              { key: "lower", label: t("partnerInvite.password.reqLower", "One lowercase letter") },
              { key: "digit", label: t("partnerInvite.password.reqDigit", "One number") },
              { key: "match", label: t("partnerInvite.password.reqMatch", "Passwords match") },
            ].map(({ key, label }) => (
              <li key={key} className="flex items-center gap-2 text-sm">
                {checks[key as keyof typeof checks] ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/50" />
                )}
                <span
                  className={cn(
                    checks[key as keyof typeof checks]
                      ? "text-green-700 dark:text-green-400"
                      : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleNext} disabled={!allValid}>
          {t("common.next", "Next")}
        </Button>
      </div>
    </div>
  );
}
