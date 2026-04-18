import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, Heart, Phone, Smartphone, CreditCard, Gift } from "lucide-react";
import { 
  calculateOrder, 
  formatPrice, 
  getSubscriptionMonthlyFinal 
} from "@/config/pricing";
import { usePricingSettings } from "@/hooks/usePricingSettings";

interface OrderSummaryStepProps {
  data: WizardData;
}

export function OrderSummaryStep({ data }: OrderSummaryStepProps) {
  const { registrationFeeEnabled, registrationFeeDiscount } = usePricingSettings();
  
  // Use centralized pricing calculations with registration fee settings
  const order = calculateOrder({
    membershipType: data.membershipType,
    billingFrequency: data.billingFrequency,
    includePendant: data.includePendant,
    includeShipping: data.includePendant,
    registrationFeeEnabled,
    registrationFeeDiscount,
  });
  
  const monthlyFinal = getSubscriptionMonthlyFinal(data.membershipType);

  return (
    <div className="space-y-6">
      {/* Member Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Member Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Membership Type</span>
            <Badge variant="outline">{data.membershipType === "single" ? "Single" : "Couple"}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Primary Member</span>
            <p className="font-medium">
              {data.primaryMember.firstName} {data.primaryMember.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{data.primaryMember.email}</p>
          </div>
          {data.membershipType === "couple" && data.partnerMember && (
            <div>
              <span className="text-muted-foreground">Partner</span>
              <p className="font-medium">
                {data.partnerMember.firstName} {data.partnerMember.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{data.partnerMember.email}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Shipping & Service Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>{data.address.addressLine1}</p>
          {data.address.addressLine2 && <p>{data.address.addressLine2}</p>}
          <p>
            {data.address.city}, {data.address.province} {data.address.postalCode}
          </p>
          <p>{data.address.country}</p>
        </CardContent>
      </Card>

      {/* Medical & Contacts Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Medical Info
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data.medicalInfo.bloodType && (
              <p>Blood Type: {data.medicalInfo.bloodType}</p>
            )}
            {data.medicalInfo.allergies.length > 0 && (
              <p>Allergies: {data.medicalInfo.allergies.join(", ")}</p>
            )}
            {data.medicalInfo.medications.length > 0 && (
              <p>Medications: {data.medicalInfo.medications.length}</p>
            )}
            {!data.medicalInfo.bloodType &&
              data.medicalInfo.allergies.length === 0 &&
              data.medicalInfo.medications.length === 0 && (
                <p className="text-muted-foreground italic">No medical info provided</p>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Emergency Contacts
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {data.emergencyContacts.map((contact, index) => (
              <div key={index}>
                <p className="font-medium">{contact.contactName}</p>
                <p className="text-muted-foreground">{contact.relationship}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Order Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Subscription */}
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">
                {data.membershipType === "single" ? "Single" : "Couple"} Membership
              </p>
              <p className="text-sm text-muted-foreground">
                {data.billingFrequency === "monthly"
                  ? "Monthly subscription"
                  : "Annual subscription (10 months price)"}
              </p>
            </div>
            <p className="font-medium">{formatPrice(order.subscriptionFinal)}</p>
          </div>

          {/* Pendant */}
          {order.pendantCount > 0 && (
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Medical Alert Pendant
                  {order.pendantCount > 1 && <span>× {order.pendantCount}</span>}
                </p>
                <p className="text-sm text-muted-foreground">One-time purchase (incl. 21% IVA)</p>
              </div>
              <p className="font-medium">{formatPrice(order.pendantFinal)}</p>
            </div>
          )}

          {/* Shipping */}
          {order.shipping > 0 && (
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Shipping</p>
                <p className="text-sm text-muted-foreground">Delivery to address</p>
              </div>
              <p className="font-medium">{formatPrice(order.shipping)}</p>
            </div>
          )}

          {/* Registration Fee */}
          {order.registrationFeeEnabled && (
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium flex items-center gap-2">
                  Registration Fee
                  {order.registrationFeeDiscount === 100 && (
                    <Badge className="bg-status-active/20 text-status-active border-0 gap-1">
                      <Gift className="h-3 w-3" />
                      FREE
                    </Badge>
                  )}
                  {order.registrationFeeDiscount > 0 && order.registrationFeeDiscount < 100 && (
                    <Badge className="bg-status-active/20 text-status-active border-0">
                      {order.registrationFeeDiscount}% off
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">One-time setup fee (no IVA)</p>
              </div>
              <div className="text-right">
                {order.registrationFeeDiscount > 0 && (
                  <p className="text-sm text-muted-foreground line-through">{formatPrice(order.registrationFeeOriginal)}</p>
                )}
                <p className="font-medium">
                  {order.registrationFeeDiscount === 100 ? "FREE" : formatPrice(order.registrationFee)}
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Total */}
          <div className="flex justify-between text-lg font-bold">
            <span>Total Due Today</span>
            <span className="text-primary">{formatPrice(order.grandTotal)}</span>
          </div>

          {data.billingFrequency === "monthly" && (
            <p className="text-sm text-muted-foreground text-center">
              Then {formatPrice(monthlyFinal)}/month starting next month
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
