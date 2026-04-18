import { useTranslation } from "react-i18next";
import { JoinWizardData } from "@/types/wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { User, MapPin, Smartphone, CreditCard, Calendar, CalendarDays, Sparkles, Check, Shield, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubscriptionFinalPrice, getSubscriptionMonthlyFinal, getAnnualSavings, formatPrice, calculateOrder } from "@/config/pricing";
import { usePricingSettings } from "@/hooks/usePricingSettings";

interface JoinSummaryStepProps {
  data: JoinWizardData;
  onUpdate: (data: Partial<JoinWizardData>) => void;
}

export function JoinSummaryStep({ data, onUpdate }: JoinSummaryStepProps) {
  const { t } = useTranslation();
  const { registrationFeeEnabled, registrationFeeDiscount } = usePricingSettings();
  
  const monthlyFinal = getSubscriptionMonthlyFinal(data.membershipType);
  const annualFinal = getSubscriptionFinalPrice(data.membershipType, 'annual');
  const annualMonthlyEquiv = annualFinal / 12;
  const annualSavings = getAnnualSavings(data.membershipType);
  const savingsPercentage = Math.round((annualSavings / (monthlyFinal * 12)) * 100);
  
  // Pass pricing settings to order calculation
  const order = calculateOrder({ 
    membershipType: data.membershipType, 
    billingFrequency: data.billingFrequency, 
    includePendant: data.includePendant, 
    pendantCount: data.pendantCount,
    includeShipping: data.includePendant,
    registrationFeeEnabled,
    registrationFeeDiscount
  });

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{t("joinWizard.summary.title")}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">{t("joinWizard.summary.subtitle")}</p>
      </div>

      <RadioGroup value={data.billingFrequency} onValueChange={(value: "monthly" | "annual") => onUpdate({ billingFrequency: value })} className="grid gap-4 md:grid-cols-2">
        <Label htmlFor="monthly" className="cursor-pointer">
          <Card className={cn("relative transition-all hover:shadow-md h-full", data.billingFrequency === "monthly" && "border-primary ring-2 ring-primary/20")}>
            {data.billingFrequency === "monthly" && <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center"><Check className="h-4 w-4 text-primary-foreground" /></div>}
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", data.billingFrequency === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Calendar className="h-5 w-5" /></div>
                <div><CardTitle className="text-base">{t("joinWizard.summary.monthly")}</CardTitle><p className="text-xl font-bold text-primary">{formatPrice(monthlyFinal)}<span className="text-sm font-normal text-muted-foreground">{t("joinWizard.summary.perMo")}</span></p></div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{t("joinWizard.summary.cancelAnytime")}<RadioGroupItem value="monthly" id="monthly" className="sr-only" /></CardContent>
          </Card>
        </Label>
        <Label htmlFor="annual" className="cursor-pointer">
          <Card className={cn("relative transition-all hover:shadow-md h-full", data.billingFrequency === "annual" && "border-primary ring-2 ring-primary/20")}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="bg-status-active text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1"><Sparkles className="h-3 w-3" />{t("joinWizard.summary.savePercent", { percent: savingsPercentage })}</span></div>
            {data.billingFrequency === "annual" && <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center"><Check className="h-4 w-4 text-primary-foreground" /></div>}
            <CardHeader className="pb-3 pt-8">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", data.billingFrequency === "annual" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><CalendarDays className="h-5 w-5" /></div>
                <div><CardTitle className="text-base">{t("joinWizard.summary.annual")}</CardTitle><div className="flex items-baseline gap-2"><p className="text-xl font-bold text-primary">{formatPrice(annualMonthlyEquiv)}<span className="text-sm font-normal text-muted-foreground">{t("joinWizard.summary.perMo")}</span></p><span className="text-xs line-through text-muted-foreground">{formatPrice(monthlyFinal)}</span></div></div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-status-active font-medium">{t("joinWizard.summary.savePerYear", { amount: formatPrice(annualSavings) })}<RadioGroupItem value="annual" id="annual" className="sr-only" /></CardContent>
          </Card>
        </Label>
      </RadioGroup>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />{t("joinWizard.summary.memberDetails")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">{t("joinWizard.summary.plan")}</span><Badge variant="outline">{data.membershipType === "single" ? t("joinWizard.summary.individual") : t("joinWizard.summary.couple")}</Badge></div><p className="font-medium">{data.primaryMember.firstName} {data.primaryMember.lastName}</p><p className="text-muted-foreground">{data.primaryMember.email}</p>{data.membershipType === "couple" && data.partnerMember && (<><Separator className="my-2" /><p className="font-medium">{data.partnerMember.firstName} {data.partnerMember.lastName}</p></>)}</CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" />{t("joinWizard.summary.serviceAddress")}</CardTitle></CardHeader><CardContent className="text-sm"><p>{data.address.addressLine1}</p>{data.address.addressLine2 && <p>{data.address.addressLine2}</p>}<p>{data.address.city}, {data.address.province} {data.address.postalCode}</p></CardContent></Card>
      </div>

      <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />{t("joinWizard.summary.orderSummary")}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex justify-between items-start"><div><p className="font-medium">{data.membershipType === "single" ? t("joinWizard.summary.individual") : t("joinWizard.summary.couple")} {t("joinWizard.summary.membership")}</p><p className="text-sm text-muted-foreground">{data.billingFrequency === "monthly" ? t("joinWizard.summary.monthlySubscription") : t("joinWizard.summary.annualSubscription")}</p></div><p className="font-medium">{formatPrice(order.subscriptionFinal)}</p></div>
        {order.pendantCount > 0 && <div className="flex justify-between items-start"><div><p className="font-medium flex items-center gap-2"><Smartphone className="h-4 w-4" />{t("joinWizard.summary.gpsSafetyPendant")}{order.pendantCount > 1 && <span>× {order.pendantCount}</span>}</p><p className="text-sm text-muted-foreground">{t("joinWizard.summary.oneTimePurchaseIva")}</p></div><p className="font-medium">{formatPrice(order.pendantFinal)}</p></div>}
        {order.shipping > 0 && <div className="flex justify-between items-start"><div><p className="font-medium">{t("joinWizard.summary.shipping")}</p><p className="text-sm text-muted-foreground">{t("joinWizard.summary.deliveryAddress")}</p></div><p className="font-medium">{formatPrice(order.shipping)}</p></div>}
        {/* Registration Fee - with discount display */}
        {order.registrationFeeEnabled && (
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium flex items-center gap-2">
                {t("joinWizard.summary.registrationFee")}
                {order.registrationFeeDiscount === 100 && (
                  <Badge className="bg-status-active/20 text-status-active border-0 gap-1">
                    <Gift className="h-3 w-3" />
                    {t("common.free") || "FREE"}
                  </Badge>
                )}
                {order.registrationFeeDiscount > 0 && order.registrationFeeDiscount < 100 && (
                  <Badge className="bg-status-active/20 text-status-active border-0">
                    {order.registrationFeeDiscount}% {t("common.off") || "off"}
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">{t("joinWizard.summary.oneTimeSetupFee")}</p>
            </div>
            <div className="text-right">
              {order.registrationFeeDiscount > 0 && (
                <p className="text-sm text-muted-foreground line-through">{formatPrice(order.registrationFeeOriginal)}</p>
              )}
              <p className="font-medium">
                {order.registrationFeeDiscount === 100 ? (t("common.free") || "FREE") : formatPrice(order.registrationFee)}
              </p>
            </div>
          </div>
        )}
        <Separator /><div className="flex justify-between text-lg font-bold"><span>{t("joinWizard.summary.totalDueToday")}</span><span className="text-primary">{formatPrice(order.grandTotal)}</span></div>
        {data.billingFrequency === "monthly" && <p className="text-sm text-muted-foreground text-center">{t("joinWizard.summary.thenMonthly", { amount: formatPrice(monthlyFinal) })}</p>}
      </CardContent></Card>

      <Card className="bg-muted/30"><CardContent className="pt-6 space-y-4">
        <div className="flex items-start space-x-3"><Checkbox id="terms" checked={data.acceptTerms} onCheckedChange={(checked) => onUpdate({ acceptTerms: checked === true })} /><div className="grid gap-1.5 leading-none"><label htmlFor="terms" className="text-sm font-medium leading-none cursor-pointer">{t("joinWizard.summary.acceptTerms")}</label><p className="text-xs text-muted-foreground">{t("joinWizard.summary.termsNote")}</p></div></div>
        <div className="flex items-start space-x-3"><Checkbox id="privacy" checked={data.acceptPrivacy} onCheckedChange={(checked) => onUpdate({ acceptPrivacy: checked === true })} /><div className="grid gap-1.5 leading-none"><label htmlFor="privacy" className="text-sm font-medium leading-none cursor-pointer">{t("joinWizard.summary.acceptMedical")}</label><p className="text-xs text-muted-foreground">{t("joinWizard.summary.medicalNote")}</p></div></div>
      </CardContent></Card>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Shield className="h-4 w-4" /><span>{t("joinWizard.summary.securityNote")}</span></div>
    </div>
  );
}