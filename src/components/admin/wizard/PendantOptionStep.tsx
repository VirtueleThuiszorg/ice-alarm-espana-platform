import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Smartphone, Phone, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPendantFinalPrice, formatPrice } from "@/config/pricing";

interface PendantOptionStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export function PendantOptionStep({ data, onUpdate }: PendantOptionStepProps) {
  const pendantFinalPrice = getPendantFinalPrice(1);
  
  // Use pendantCount from data, with smart defaults
  const defaultCount = data.membershipType === "couple" ? 2 : 1;
  const currentCount = data.pendantCount || defaultCount;

  const features = [
    { name: "24/7 Emergency Response", pendant: true, phoneOnly: true },
    { name: "GPS Location Tracking", pendant: true, phoneOnly: true },
    { name: "Fall Detection", pendant: true, phoneOnly: false },
    { name: "Waterproof Design", pendant: true, phoneOnly: false },
    { name: "One-Touch SOS Button", pendant: true, phoneOnly: true },
    { name: "Two-Way Voice", pendant: true, phoneOnly: true },
    { name: "No Smartphone Required", pendant: true, phoneOnly: false },
    { name: "Automatic Check-ins", pendant: true, phoneOnly: true },
  ];

  const handlePendantChange = (value: string) => {
    const includePendant = value === "yes";
    if (includePendant) {
      onUpdate({ 
        includePendant: true, 
        pendantCount: data.pendantCount || defaultCount 
      });
    } else {
      onUpdate({ includePendant: false, pendantCount: 0 });
    }
  };

  const handleQuantityChange = (delta: number) => {
    // Admin can select up to 10 pendants
    const newCount = Math.max(1, Math.min(10, currentCount + delta));
    onUpdate({ pendantCount: newCount });
  };

  return (
    <div className="space-y-6">
      <RadioGroup
        value={data.includePendant ? "yes" : "no"}
        onValueChange={handlePendantChange}
        className="grid gap-4 md:grid-cols-2"
      >
        {/* With Pendant */}
        <Label htmlFor="pendant-yes" className="cursor-pointer">
          <Card
            className={cn(
              "relative transition-all hover:shadow-md h-full",
              data.includePendant && "border-primary ring-2 ring-primary/20"
            )}
          >
            {data.includePendant && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <CardHeader>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    data.includePendant
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg">Include Pendant</CardTitle>
                  <p className="text-primary font-semibold">
                    {formatPrice(pendantFinalPrice)} each
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Our medical alert pendant provides complete protection with fall detection
                and works without needing a smartphone.
              </p>
              
              {/* Quantity Selector - Only show when pendant is selected */}
              {data.includePendant && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quantity</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.preventDefault();
                          handleQuantityChange(-1);
                        }}
                        disabled={currentCount <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center font-semibold">
                        {currentCount}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.preventDefault();
                          handleQuantityChange(1);
                        }}
                        disabled={currentCount >= 10}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold text-primary">
                      {formatPrice(getPendantFinalPrice(currentCount))}
                    </span>
                  </div>
                </div>
              )}
              
              <RadioGroupItem value="yes" id="pendant-yes" className="sr-only" />
            </CardContent>
          </Card>
        </Label>

        {/* Phone Only */}
        <Label htmlFor="pendant-no" className="cursor-pointer">
          <Card
            className={cn(
              "relative transition-all hover:shadow-md h-full",
              !data.includePendant && "border-primary ring-2 ring-primary/20"
            )}
          >
            {!data.includePendant && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <CardHeader>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    !data.includePendant
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Phone className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg">Phone Only</CardTitle>
                  <p className="text-primary font-semibold">No additional cost</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use our mobile app for emergency alerts. Requires a smartphone with our
                app installed.
              </p>
              <RadioGroupItem value="no" id="pendant-no" className="sr-only" />
            </CardContent>
          </Card>
        </Label>
      </RadioGroup>

      {/* Feature Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Feature</th>
                  <th className="text-center py-2 font-medium">With Pendant</th>
                  <th className="text-center py-2 font-medium">Phone Only</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => (
                  <tr key={feature.name} className="border-b last:border-0">
                    <td className="py-2">{feature.name}</td>
                    <td className="text-center py-2">
                      {feature.pendant ? (
                        <Check className="h-5 w-5 text-status-active mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="text-center py-2">
                      {feature.phoneOnly ? (
                        <Check className="h-5 w-5 text-status-active mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recommendation */}
      <div className="bg-accent/50 rounded-lg p-4 border border-accent">
        <p className="text-sm">
          <span className="font-medium text-accent-foreground">Recommended:</span>{" "}
          <span className="text-muted-foreground">
            The pendant device is especially recommended for users who may not always have
            their phone nearby, or for those who want the added security of fall detection.
          </span>
        </p>
      </div>
    </div>
  );
}
