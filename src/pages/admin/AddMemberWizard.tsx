import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, User, Users, MapPin, Heart, Phone, Smartphone, CreditCard, FileText, CircleDollarSign, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

// Import wizard step components
import { MembershipTypeStep } from "@/components/admin/wizard/MembershipTypeStep";
import { PersonalDetailsStep } from "@/components/admin/wizard/PersonalDetailsStep";
import { AddressStep } from "@/components/admin/wizard/AddressStep";
import { MedicalInfoStep } from "@/components/admin/wizard/MedicalInfoStep";
import { EmergencyContactsStep } from "@/components/admin/wizard/EmergencyContactsStep";
import { PendantOptionStep } from "@/components/admin/wizard/PendantOptionStep";
import { BillingFrequencyStep } from "@/components/admin/wizard/BillingFrequencyStep";
import { OrderSummaryStep } from "@/components/admin/wizard/OrderSummaryStep";
import { PaymentStep } from "@/components/admin/wizard/PaymentStep";
import { ConfirmationStep } from "@/components/admin/wizard/ConfirmationStep";

export interface WizardData {
  // Step 1: Membership Type
  membershipType: "single" | "couple";
  
  // Step 2: Personal Details
  primaryMember: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    nieDni: string;
    preferredLanguage: "en" | "es";
  };
  partnerMember?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    nieDni: string;
    preferredLanguage: "en" | "es";
  };
  
  // Step 3: Address
  address: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  
  // Step 4: Medical Information
  medicalInfo: {
    bloodType: string;
    allergies: string[];
    medications: string[];
    medicalConditions: string[];
    doctorName: string;
    doctorPhone: string;
    hospitalPreference: string;
    additionalNotes: string;
  };
  partnerMedicalInfo?: {
    bloodType: string;
    allergies: string[];
    medications: string[];
    medicalConditions: string[];
    doctorName: string;
    doctorPhone: string;
    hospitalPreference: string;
    additionalNotes: string;
  };
  
  // Step 5: Emergency Contacts
  emergencyContacts: Array<{
    contactName: string;
    relationship: string;
    phone: string;
    email: string;
    speaksSpanish: boolean;
    notes: string;
  }>;
  
  // Step 6: Pendant Option
  includePendant: boolean;
  pendantCount: number;
  
  // Step 7: Billing Frequency
  billingFrequency: "monthly" | "annual";
  
  // Step 8-10: Order & Payment
  orderId?: string;
  paymentComplete: boolean;
}

const initialWizardData: WizardData = {
  membershipType: "single",
  primaryMember: {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    nieDni: "",
    preferredLanguage: "es",
  },
  address: {
    addressLine1: "",
    addressLine2: "",
    city: "",
    province: "",
    postalCode: "",
    country: "Spain",
  },
  medicalInfo: {
    bloodType: "",
    allergies: [],
    medications: [],
    medicalConditions: [],
    doctorName: "",
    doctorPhone: "",
    hospitalPreference: "",
    additionalNotes: "",
  },
  emergencyContacts: [],
  includePendant: true,
  pendantCount: 1,
  billingFrequency: "monthly",
  paymentComplete: false,
};

const steps = [
  { id: 1, title: "Membership", icon: Users },
  { id: 2, title: "Personal Details", icon: User },
  { id: 3, title: "Address", icon: MapPin },
  { id: 4, title: "Medical Info", icon: Heart },
  { id: 5, title: "Emergency Contacts", icon: Phone },
  { id: 6, title: "Pendant", icon: Smartphone },
  { id: 7, title: "Billing", icon: CreditCard },
  { id: 8, title: "Summary", icon: FileText },
  { id: 9, title: "Payment", icon: CircleDollarSign },
  { id: 10, title: "Confirmation", icon: PartyPopper },
];

export default function AddMemberWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>(initialWizardData);
  const [stepValidation, setStepValidation] = useState<Record<number, boolean>>({});

  const updateWizardData = (data: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...data }));
  };

  const validateCurrentStep = (): boolean => {
    // Add validation logic per step
    switch (currentStep) {
      case 1:
        return !!wizardData.membershipType;
      case 2:
        return !!(
          wizardData.primaryMember.firstName &&
          wizardData.primaryMember.lastName &&
          wizardData.primaryMember.email &&
          wizardData.primaryMember.phone &&
          wizardData.primaryMember.dateOfBirth
        );
      case 3:
        return !!(
          wizardData.address.addressLine1 &&
          wizardData.address.city &&
          wizardData.address.province &&
          wizardData.address.postalCode
        );
      case 4:
        return true; // Medical info is optional
      case 5:
        return wizardData.emergencyContacts.length >= 1;
      case 6:
        return true; // Pendant option always valid
      case 7:
        return !!wizardData.billingFrequency;
      case 8:
        return true; // Summary is always valid
      case 9:
        return wizardData.paymentComplete;
      case 10:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setStepValidation((prev) => ({ ...prev, [currentStep]: true }));
      if (currentStep < steps.length) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepId: number) => {
    // Allow navigation to completed steps or current step
    if (stepId <= currentStep) {
      setCurrentStep(stepId);
    }
  };

  const progress = ((currentStep - 1) / (steps.length - 1)) * 100;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <MembershipTypeStep data={wizardData} onUpdate={updateWizardData} />;
      case 2:
        return <PersonalDetailsStep data={wizardData} onUpdate={updateWizardData} />;
      case 3:
        return <AddressStep data={wizardData} onUpdate={updateWizardData} />;
      case 4:
        return <MedicalInfoStep data={wizardData} onUpdate={updateWizardData} />;
      case 5:
        return <EmergencyContactsStep data={wizardData} onUpdate={updateWizardData} />;
      case 6:
        return <PendantOptionStep data={wizardData} onUpdate={updateWizardData} />;
      case 7:
        return <BillingFrequencyStep data={wizardData} onUpdate={updateWizardData} />;
      case 8:
        return <OrderSummaryStep data={wizardData} />;
      case 9:
        return <PaymentStep data={wizardData} onUpdate={updateWizardData} />;
      case 10:
        return <ConfirmationStep data={wizardData} />;
      default:
        return null;
    }
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Add New Member</h1>
          <p className="text-muted-foreground">Complete all steps to register a new member</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/members")}>
          Cancel
        </Button>
      </div>

      {/* Progress Bar */}
      <Progress value={progress} className="h-2" />

      {/* Step Indicators */}
      <div className="flex justify-between overflow-x-auto pb-2">
        {steps.map((step) => {
          const StepIcon = step.icon;
          const isCompleted = stepValidation[step.id];
          const isCurrent = step.id === currentStep;
          const isClickable = step.id <= currentStep;

          return (
            <button
              key={step.id}
              onClick={() => handleStepClick(step.id)}
              disabled={!isClickable}
              className={cn(
                "flex flex-col items-center gap-1 min-w-[80px] p-2 rounded-lg transition-colors",
                isClickable && "cursor-pointer hover:bg-accent",
                !isClickable && "opacity-50 cursor-not-allowed"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  isCurrent && "bg-primary text-primary-foreground",
                  isCompleted && !isCurrent && "bg-status-active text-white",
                  !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted && !isCurrent ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <StepIcon className="h-5 w-5" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium text-center",
                  isCurrent && "text-primary",
                  !isCurrent && "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const StepIcon = steps[currentStep - 1].icon;
              return <StepIcon className="h-5 w-5" />;
            })()}
            Step {currentStep}: {steps[currentStep - 1].title}
          </CardTitle>
          <CardDescription>
            {currentStep === 1 && "Choose the type of membership"}
            {currentStep === 2 && "Enter personal details for the member(s)"}
            {currentStep === 3 && "Enter the residential address"}
            {currentStep === 4 && "Add medical information (optional but recommended)"}
            {currentStep === 5 && "Add at least one emergency contact"}
            {currentStep === 6 && "Choose whether to include a pendant device"}
            {currentStep === 7 && "Select billing frequency"}
            {currentStep === 8 && "Review the order before payment"}
            {currentStep === 9 && "Complete payment to activate membership"}
            {currentStep === 10 && "Membership created successfully!"}
          </CardDescription>
        </CardHeader>
        <CardContent>{renderStepContent()}</CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {currentStep < 10 ? (
          <Button onClick={handleNext} className="gap-2">
            {currentStep === 9 ? "Complete Registration" : "Next"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => navigate("/admin/members")} className="gap-2">
            <Check className="h-4 w-4" />
            Go to Members
          </Button>
        )}
      </div>
    </div>
  );
}
