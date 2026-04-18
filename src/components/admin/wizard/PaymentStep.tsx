import { useState } from "react";
import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CreditCard, Building2, Loader2, Lock, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateOrder, formatPrice, getSubscriptionNetPrice } from "@/config/pricing";

interface PaymentStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export function PaymentStep({ data, onUpdate }: PaymentStepProps) {
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardDetails, setCardDetails] = useState({
    number: "",
    expiry: "",
    cvc: "",
    name: "",
  });

  // Calculate order using centralized pricing
  const order = calculateOrder({
    membershipType: data.membershipType,
    billingFrequency: data.billingFrequency,
    includePendant: data.includePendant,
    includeShipping: data.includePendant,
  });

  const total = order.grandTotal;
  const subscriptionAmount = getSubscriptionNetPrice(data.membershipType, data.billingFrequency);

  const handleProcessPayment = async () => {
    setIsProcessing(true);

    try {
      // Simulate payment processing (in production, integrate with Stripe)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create member in database
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .insert({
          first_name: data.primaryMember.firstName,
          last_name: data.primaryMember.lastName,
          email: data.primaryMember.email,
          phone: data.primaryMember.phone,
          date_of_birth: data.primaryMember.dateOfBirth,
          nie_dni: data.primaryMember.nieDni || null,
          preferred_language: data.primaryMember.preferredLanguage,
          address_line_1: data.address.addressLine1,
          address_line_2: data.address.addressLine2 || null,
          city: data.address.city,
          province: data.address.province,
          postal_code: data.address.postalCode,
          country: data.address.country,
          status: "active",
        })
        .select()
        .single();

      if (memberError) throw memberError;

      const { error: subError } = await supabase.from("subscriptions").insert({
        member_id: memberData.id,
        plan_type: data.membershipType,
        billing_frequency: data.billingFrequency,
        amount: subscriptionAmount,
        start_date: new Date().toISOString().split("T")[0],
        renewal_date: new Date(
          data.billingFrequency === "monthly"
            ? Date.now() + 30 * 24 * 60 * 60 * 1000
            : Date.now() + 365 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0],
        has_pendant: data.includePendant,
        registration_fee_paid: true,
        status: "active",
        payment_method: paymentMethod === "card" ? "stripe" : "bank_transfer",
      });

      if (subError) throw subError;

      // Create medical information
      if (data.medicalInfo.bloodType || data.medicalInfo.allergies.length > 0) {
        await supabase.from("medical_information").insert({
          member_id: memberData.id,
          blood_type: data.medicalInfo.bloodType || null,
          allergies: data.medicalInfo.allergies,
          medications: data.medicalInfo.medications,
          medical_conditions: data.medicalInfo.medicalConditions,
          doctor_name: data.medicalInfo.doctorName || null,
          doctor_phone: data.medicalInfo.doctorPhone || null,
          hospital_preference: data.medicalInfo.hospitalPreference || null,
          additional_notes: data.medicalInfo.additionalNotes || null,
        });
      }

      // Create emergency contacts
      for (let i = 0; i < data.emergencyContacts.length; i++) {
        const contact = data.emergencyContacts[i];
        await supabase.from("emergency_contacts").insert({
          member_id: memberData.id,
          contact_name: contact.contactName,
          relationship: contact.relationship,
          phone: contact.phone,
          email: contact.email || null,
          speaks_spanish: contact.speaksSpanish,
          notes: contact.notes || null,
          priority_order: i + 1,
          is_primary: i === 0,
        });
      }

      // Mark payment as complete
      onUpdate({ paymentComplete: true, orderId: memberData.id });
      toast.success("Payment processed successfully!");
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (data.paymentComplete) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-status-active/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-status-active" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Payment Successful!</h3>
        <p className="text-muted-foreground">
          Click "Next" to view the confirmation details.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Method Selection */}
      <RadioGroup
        value={paymentMethod}
        onValueChange={(value: "card" | "bank") => setPaymentMethod(value)}
        className="grid gap-4 md:grid-cols-2"
      >
        <Label htmlFor="card" className="cursor-pointer">
          <Card className={paymentMethod === "card" ? "border-primary ring-2 ring-primary/20" : ""}>
            <CardContent className="pt-6 flex items-center gap-3">
              <CreditCard className="h-5 w-5" />
              <div>
                <p className="font-medium">Credit/Debit Card</p>
                <p className="text-sm text-muted-foreground">Pay securely by card</p>
              </div>
              <RadioGroupItem value="card" id="card" className="sr-only" />
            </CardContent>
          </Card>
        </Label>

        <Label htmlFor="bank" className="cursor-pointer">
          <Card className={paymentMethod === "bank" ? "border-primary ring-2 ring-primary/20" : ""}>
            <CardContent className="pt-6 flex items-center gap-3">
              <Building2 className="h-5 w-5" />
              <div>
                <p className="font-medium">Bank Transfer</p>
                <p className="text-sm text-muted-foreground">Manual bank transfer</p>
              </div>
              <RadioGroupItem value="bank" id="bank" className="sr-only" />
            </CardContent>
          </Card>
        </Label>
      </RadioGroup>

      {/* Card Details Form */}
      {paymentMethod === "card" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Card Details</CardTitle>
            <CardDescription>Your payment is secured with 256-bit encryption</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cardName">Name on Card</Label>
              <Input
                id="cardName"
                value={cardDetails.name}
                onChange={(e) => setCardDetails({ ...cardDetails, name: e.target.value })}
                placeholder="John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardNumber">Card Number</Label>
              <Input
                id="cardNumber"
                value={cardDetails.number}
                onChange={(e) => setCardDetails({ ...cardDetails, number: e.target.value })}
                placeholder="4242 4242 4242 4242"
                maxLength={19}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry Date</Label>
                <Input
                  id="expiry"
                  value={cardDetails.expiry}
                  onChange={(e) => setCardDetails({ ...cardDetails, expiry: e.target.value })}
                  placeholder="MM/YY"
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <Input
                  id="cvc"
                  value={cardDetails.cvc}
                  onChange={(e) => setCardDetails({ ...cardDetails, cvc: e.target.value })}
                  placeholder="123"
                  maxLength={4}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bank Transfer Info */}
      {paymentMethod === "bank" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bank Transfer Details</CardTitle>
            <CardDescription>
              Transfer the amount below and include your email as reference
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 font-mono text-sm">
              <p><span className="text-muted-foreground">Bank:</span> Banco Santander</p>
              <p><span className="text-muted-foreground">IBAN:</span> ES12 1234 5678 9012 3456 7890</p>
              <p><span className="text-muted-foreground">BIC/SWIFT:</span> BSCHESMM</p>
              <p><span className="text-muted-foreground">Reference:</span> {data.primaryMember.email}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Membership will be activated once payment is confirmed (1-3 business days).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Total and Pay Button */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-medium">Total to Pay</span>
            <span className="text-2xl font-bold text-primary">{formatPrice(total)}</span>
          </div>

          <Button
            onClick={handleProcessPayment}
            disabled={isProcessing}
            className="w-full h-12 text-lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-5 w-5" />
                {paymentMethod === "card" ? "Pay Now" : "Confirm Order"}
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-4 flex items-center justify-center gap-1">
            <Lock className="h-3 w-3" />
            Secured by 256-bit SSL encryption
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
