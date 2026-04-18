import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Mail, Package, Phone, FileText, Download } from "lucide-react";

interface ConfirmationStepProps {
  data: WizardData;
}

export function ConfirmationStep({ data }: ConfirmationStepProps) {
  const nextSteps = [
    {
      icon: Mail,
      title: "Welcome Email Sent",
      description: `A welcome email has been sent to ${data.primaryMember.email} with login instructions.`,
    },
    {
      icon: Package,
      title: data.includePendant ? "Pendant Shipping" : "Mobile App Setup",
      description: data.includePendant
        ? "The pendant device will be shipped within 1-2 business days. Tracking info will be emailed."
        : "The member will receive instructions to download and set up the mobile app.",
    },
    {
      icon: Phone,
      title: "Activation Call",
      description: "Our team will call within 24 hours to complete device setup and test the service.",
    },
    {
      icon: FileText,
      title: "Documentation",
      description: "Membership contract and service terms have been sent to the member's email.",
    },
  ];

  return (
    <div className="text-center space-y-8">
      {/* Success Header */}
      <div>
        <div className="w-20 h-20 bg-status-active/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="h-10 w-10 text-status-active" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Member Registration Complete!
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {data.primaryMember.firstName} {data.primaryMember.lastName} has been successfully
          registered as a{" "}
          {data.membershipType === "single" ? "single" : "couple"} member.
        </p>
      </div>

      {/* Member ID Card */}
      <Card className="max-w-sm mx-auto">
        <CardContent className="pt-6 text-left">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-lg">
              {data.primaryMember.firstName.charAt(0)}
              {data.primaryMember.lastName.charAt(0)}
            </div>
            <div>
              <p className="font-semibold">
                {data.primaryMember.firstName} {data.primaryMember.lastName}
              </p>
              <p className="text-sm text-muted-foreground">
                Member ID: {data.orderId?.slice(0, 8).toUpperCase() || "ICE-XXXXX"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <div className="space-y-4 text-left max-w-lg mx-auto">
        <h3 className="font-semibold text-lg text-center">What Happens Next</h3>
        {nextSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={index} className="flex gap-4">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Download Contract
        </Button>
        <Button variant="outline" className="gap-2">
          <Mail className="h-4 w-4" />
          Resend Welcome Email
        </Button>
      </div>
    </div>
  );
}
