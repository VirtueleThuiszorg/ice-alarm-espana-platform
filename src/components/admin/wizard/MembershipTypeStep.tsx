import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { User, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubscriptionMonthlyFinal, formatPrice } from "@/config/pricing";

interface MembershipTypeStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export function MembershipTypeStep({ data, onUpdate }: MembershipTypeStepProps) {
  const options = [
    {
      value: "single",
      title: "Single Membership",
      description: "Protection for one person living independently. Includes 24/7 emergency response, GPS tracking, and fall detection.",
      icon: User,
      price: `${formatPrice(getSubscriptionMonthlyFinal('single'))}/month`,
    },
    {
      value: "couple",
      title: "Couple Membership",
      description: "Protection for two people living together. Both members receive full coverage with a shared address. Save 20% compared to two single memberships.",
      icon: Users,
      price: `${formatPrice(getSubscriptionMonthlyFinal('couple'))}/month`,
    },
  ];

  return (
    <div className="space-y-6">
      <RadioGroup
        value={data.membershipType}
        onValueChange={(value: "single" | "couple") =>
          onUpdate({ membershipType: value })
        }
        className="grid gap-4 md:grid-cols-2"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = data.membershipType === option.value;

          return (
            <Label
              key={option.value}
              htmlFor={option.value}
              className="cursor-pointer"
            >
              <Card
                className={cn(
                  "relative transition-all hover:shadow-md",
                  isSelected && "border-primary ring-2 ring-primary/20"
                )}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{option.title}</h3>
                      <p className="text-primary font-medium">{option.price}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                  <RadioGroupItem
                    value={option.value}
                    id={option.value}
                    className="sr-only"
                  />
                </CardContent>
              </Card>
            </Label>
          );
        })}
      </RadioGroup>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">What's Included:</h4>
        <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-status-active" />
            24/7 Emergency Response
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-status-active" />
            GPS Location Tracking
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-status-active" />
            Fall Detection (with pendant)
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-status-active" />
            Two-Way Voice Communication
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-status-active" />
            Spanish & English Support
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-status-active" />
            Family App Access
          </li>
        </ul>
      </div>
    </div>
  );
}
