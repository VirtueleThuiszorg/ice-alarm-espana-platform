import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Calendar, CalendarDays, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  getSubscriptionMonthlyFinal, 
  getSubscriptionFinalPrice, 
  getAnnualSavings,
  formatPrice 
} from "@/config/pricing";

interface BillingFrequencyStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export function BillingFrequencyStep({ data, onUpdate }: BillingFrequencyStepProps) {
  const monthlyPrice = getSubscriptionMonthlyFinal(data.membershipType);
  const annualTotal = getSubscriptionFinalPrice(data.membershipType, 'annual');
  const annualMonthlyPrice = annualTotal / 12;
  const annualSavings = getAnnualSavings(data.membershipType);

  return (
    <div className="space-y-6">
      <RadioGroup
        value={data.billingFrequency}
        onValueChange={(value: "monthly" | "annual") =>
          onUpdate({ billingFrequency: value })
        }
        className="grid gap-4 md:grid-cols-2"
      >
        {/* Monthly */}
        <Label htmlFor="monthly" className="cursor-pointer">
          <Card
            className={cn(
              "relative transition-all hover:shadow-md h-full",
              data.billingFrequency === "monthly" && "border-primary ring-2 ring-primary/20"
            )}
          >
            {data.billingFrequency === "monthly" && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <CardHeader>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    data.billingFrequency === "monthly"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg">Monthly</CardTitle>
                  <p className="text-2xl font-bold text-primary">
                    {formatPrice(monthlyPrice)}
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-active" />
                  Pay month-to-month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-active" />
                  Cancel anytime
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-active" />
                  No long-term commitment
                </li>
              </ul>
              <RadioGroupItem value="monthly" id="monthly" className="sr-only" />
            </CardContent>
          </Card>
        </Label>

        {/* Annual */}
        <Label htmlFor="annual" className="cursor-pointer">
          <Card
            className={cn(
              "relative transition-all hover:shadow-md h-full",
              data.billingFrequency === "annual" && "border-primary ring-2 ring-primary/20"
            )}
          >
            {/* Best Value Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-status-active text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Best Value
              </span>
            </div>
            {data.billingFrequency === "annual" && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <CardHeader className="pt-8">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    data.billingFrequency === "annual"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg">Annual</CardTitle>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-primary">
                      {formatPrice(annualMonthlyPrice)}
                      <span className="text-sm font-normal text-muted-foreground">/month</span>
                    </p>
                    <span className="text-sm line-through text-muted-foreground">
                      {formatPrice(monthlyPrice)}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-status-active/10 text-status-active rounded-lg p-3 text-center">
                <span className="font-semibold">Save {formatPrice(annualSavings)}/year</span>
                <span className="text-sm ml-1">(2 months free)</span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-active" />
                  Billed annually: {formatPrice(annualTotal)}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-active" />
                  Lock in your rate
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-active" />
                  Priority support
                </li>
              </ul>
              <RadioGroupItem value="annual" id="annual" className="sr-only" />
            </CardContent>
          </Card>
        </Label>
      </RadioGroup>

      {/* Cost Summary */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Selected plan:</span>
            <span className="font-medium">
              {data.membershipType === "single" ? "Single" : "Couple"} -{" "}
              {data.billingFrequency === "monthly" ? "Monthly" : "Annual"}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-muted-foreground">
              {data.billingFrequency === "monthly" ? "Monthly cost:" : "Annual cost:"}
            </span>
            <span className="text-xl font-bold text-primary">
              {formatPrice(data.billingFrequency === "monthly" ? monthlyPrice : annualTotal)}
            </span>
          </div>
          {data.billingFrequency === "annual" && (
            <p className="text-sm text-status-active mt-2 text-right">
              You're saving {formatPrice(annualSavings)} per year (2 months free)!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
