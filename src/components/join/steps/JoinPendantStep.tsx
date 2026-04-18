import { useTranslation } from "react-i18next";
import { JoinWizardData } from "@/types/wizard";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Smartphone, Phone, Award, Shield, Droplets, Battery, Wifi, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPendantFinalPrice, formatPrice } from "@/config/pricing";

interface JoinPendantStepProps {
  data: JoinWizardData;
  onUpdate: (data: Partial<JoinWizardData>) => void;
}

export function JoinPendantStep({ data, onUpdate }: JoinPendantStepProps) {
  const { t } = useTranslation();
  const pendantFinalPrice = getPendantFinalPrice(1);
  const defaultCount = data.membershipType === "couple" ? 2 : 1;
  const currentCount = data.pendantCount || defaultCount;

  const features = [
    { nameKey: "joinWizard.device.features.emergencyResponse", pendant: true, phoneOnly: true },
    { nameKey: "joinWizard.device.features.gpsTracking", pendant: true, phoneOnly: true },
    { nameKey: "joinWizard.device.features.fallDetection", pendant: true, phoneOnly: false },
    { nameKey: "joinWizard.device.features.waterproof", pendant: true, phoneOnly: false },
    { nameKey: "joinWizard.device.features.sosButton", pendant: true, phoneOnly: true },
    { nameKey: "joinWizard.device.features.twoWayVoice", pendant: true, phoneOnly: true },
    { nameKey: "joinWizard.device.features.noSmartphone", pendant: true, phoneOnly: false },
    { nameKey: "joinWizard.device.features.works4g", pendant: true, phoneOnly: false },
  ];

  const pendantFeatures = [
    { icon: Shield, textKey: "joinWizard.device.pendantFeatures.fallDetection" },
    { icon: Droplets, textKey: "joinWizard.device.pendantFeatures.waterproof" },
    { icon: Battery, textKey: "joinWizard.device.pendantFeatures.battery" },
    { icon: Wifi, textKey: "joinWizard.device.pendantFeatures.connectivity" },
  ];

  const handlePendantChange = (value: string) => {
    const includePendant = value === "yes";
    if (includePendant) {
      onUpdate({ includePendant: true, pendantCount: data.pendantCount || defaultCount });
    } else {
      onUpdate({ includePendant: false, pendantCount: 0 });
    }
  };

  const handleQuantityChange = (delta: number) => {
    const newCount = Math.max(1, Math.min(4, currentCount + delta));
    onUpdate({ pendantCount: newCount });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{t("joinWizard.device.title")}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">{t("joinWizard.device.subtitle")}</p>
      </div>

      <RadioGroup value={data.includePendant ? "yes" : "no"} onValueChange={handlePendantChange} className="grid gap-4 md:grid-cols-2">
        <Label htmlFor="pendant-yes" className="cursor-pointer">
          <Card className={cn("relative transition-all hover:shadow-lg h-full", data.includePendant && "border-primary ring-2 ring-primary/20")}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                <Award className="h-3 w-3" />{t("joinWizard.device.recommended")}
              </span>
            </div>
            {data.includePendant && <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center"><Check className="h-4 w-4 text-primary-foreground" /></div>}
            <CardHeader className="pt-8">
              <div className="flex flex-col items-center text-center gap-3">
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", data.includePendant ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Smartphone className="h-8 w-8" /></div>
                <div>
                  <CardTitle className="text-xl">{t("joinWizard.device.gpsPendant")}</CardTitle>
                  <p className="text-2xl font-bold text-primary mt-2">{formatPrice(pendantFinalPrice)}<span className="text-sm font-normal text-muted-foreground ml-1">{t("joinWizard.device.each")}</span></p>
                  <p className="text-xs text-muted-foreground">{t("joinWizard.device.oneTimePurchase")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">{t("joinWizard.device.pendantDesc")}</p>
              {data.includePendant && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t("joinWizard.device.quantity")}</span>
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={(e) => { e.preventDefault(); handleQuantityChange(-1); }} disabled={currentCount <= 1}><Minus className="h-4 w-4" /></Button>
                      <span className="w-8 text-center font-semibold text-lg">{currentCount}</span>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={(e) => { e.preventDefault(); handleQuantityChange(1); }} disabled={currentCount >= 4}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("joinWizard.device.total")}</span>
                    <span className="font-bold text-primary text-lg">{formatPrice(getPendantFinalPrice(currentCount))}</span>
                  </div>
                  {data.membershipType === "couple" && currentCount < 2 && <p className="text-xs text-amber-600 text-center">{t("joinWizard.device.tipCouple")}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {pendantFeatures.map((feature) => (<div key={feature.textKey} className="flex items-center gap-2 text-xs"><feature.icon className="h-4 w-4 text-primary" /><span>{t(feature.textKey)}</span></div>))}
              </div>
              <RadioGroupItem value="yes" id="pendant-yes" className="sr-only" />
            </CardContent>
          </Card>
        </Label>

        <Label htmlFor="pendant-no" className="cursor-pointer">
          <Card className={cn("relative transition-all hover:shadow-lg h-full", !data.includePendant && "border-primary ring-2 ring-primary/20")}>
            {!data.includePendant && <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center"><Check className="h-4 w-4 text-primary-foreground" /></div>}
            <CardHeader className="pt-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", !data.includePendant ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Phone className="h-8 w-8" /></div>
                <div>
                  <CardTitle className="text-xl">{t("joinWizard.device.phoneOnly")}</CardTitle>
                  <p className="text-2xl font-bold text-status-active mt-2">{t("joinWizard.device.free")}</p>
                  <p className="text-xs text-muted-foreground">{t("joinWizard.device.noAdditionalCost")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">{t("joinWizard.device.phoneOnlyDesc")}</p>
              <div className="text-center py-2"><p className="text-xs text-muted-foreground italic">{t("joinWizard.device.requiresSmartphone")}</p></div>
              <RadioGroupItem value="no" id="pendant-no" className="sr-only" />
            </CardContent>
          </Card>
        </Label>
      </RadioGroup>

      <Card>
        <CardHeader><CardTitle className="text-base text-center">{t("joinWizard.device.featureComparison")}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2 font-medium">{t("joinWizard.device.feature")}</th><th className="text-center py-2 font-medium">{t("joinWizard.device.gpsPendant")}</th><th className="text-center py-2 font-medium">{t("joinWizard.device.phoneOnly")}</th></tr></thead>
              <tbody>
                {features.map((feature) => (
                  <tr key={feature.nameKey} className="border-b last:border-0">
                    <td className="py-2">{t(feature.nameKey)}</td>
                    <td className="text-center py-2">{feature.pendant ? <Check className="h-5 w-5 text-status-active mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />}</td>
                    <td className="text-center py-2">{feature.phoneOnly ? <Check className="h-5 w-5 text-status-active mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}