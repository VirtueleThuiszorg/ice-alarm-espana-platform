import { useTranslation } from "react-i18next";
import { JoinWizardData } from "@/types/wizard";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Users, Check, Shield, Phone, MapPin, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubscriptionMonthlyFinal, formatPrice } from "@/config/pricing";

interface JoinMembershipStepProps {
  data: JoinWizardData;
  onUpdate: (data: Partial<JoinWizardData>) => void;
}

export function JoinMembershipStep({ data, onUpdate }: JoinMembershipStepProps) {
  const { t } = useTranslation();
  
  const plans = [
    {
      value: "single" as const,
      titleKey: "joinWizard.membership.individualPlan",
      descriptionKey: "joinWizard.membership.individualDesc",
      price: formatPrice(getSubscriptionMonthlyFinal('single')),
      priceNoteKey: "joinWizard.membership.perMonth",
      icon: User,
    },
    {
      value: "couple" as const,
      titleKey: "joinWizard.membership.couplePlan",
      descriptionKey: "joinWizard.membership.coupleDesc",
      price: formatPrice(getSubscriptionMonthlyFinal('couple')),
      priceNoteKey: "joinWizard.membership.perMonth",
      icon: Users,
    },
  ];

  const features = [
    { icon: Shield, textKey: "joinWizard.membership.feature24_7" },
    { icon: Phone, textKey: "joinWizard.membership.featureVoice" },
    { icon: MapPin, textKey: "joinWizard.membership.featureGps" },
    { icon: Bell, textKey: "joinWizard.membership.featureFall" },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{t("joinWizard.membership.title")}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {t("joinWizard.membership.subtitle")}
        </p>
      </div>

      <RadioGroup
        value={data.membershipType}
        onValueChange={(value: "single" | "couple") => onUpdate({ membershipType: value })}
        className="grid gap-4 md:grid-cols-2"
      >
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isSelected = data.membershipType === plan.value;

          return (
            <Label key={plan.value} htmlFor={plan.value} className="cursor-pointer">
              <Card
                className={cn(
                  "relative transition-all hover:shadow-lg h-full",
                  isSelected && "border-primary ring-2 ring-primary/20"
                )}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{t(plan.titleKey)}</CardTitle>
                      <p className="text-sm text-muted-foreground">{t(plan.descriptionKey)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <span className="text-3xl font-bold text-primary">{plan.price}</span>
                    <span className="text-muted-foreground">{t(plan.priceNoteKey)}</span>
                  </div>
                  <RadioGroupItem value={plan.value} id={plan.value} className="sr-only" />
                </CardContent>
              </Card>
            </Label>
          );
        })}
      </RadioGroup>

      {/* What's Included */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base text-center">{t("joinWizard.membership.whatsIncluded")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.textKey} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <feature.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm">{t(feature.textKey)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}