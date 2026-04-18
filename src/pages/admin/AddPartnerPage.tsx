import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, UserPlus, Building2, MapPin, Bell, DollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PARTNER_TYPES, REGIONS, HOW_HEARD_OPTIONS, isB2BPartnerType, getPartnerTypeLabel } from "@/config/partnerTypes";

const partnerFormSchema = z.object({
  contact_name: z.string().min(2, "Contact name is required"),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  preferred_language: z.enum(["en", "es"]),
  payout_beneficiary_name: z.string().optional(),
  payout_iban: z.string().optional(),
  notes_internal: z.string().optional(),
  // B2B fields
  partner_type: z.enum(["referral", "care", "residential", "pharmacy", "insurance", "healthcare_provider", "real_estate", "expat_community", "corporate_other"]),
  organization_type: z.string().optional(),
  organization_registration: z.string().optional(),
  organization_website: z.string().optional(),
  estimated_monthly_referrals: z.string().optional(),
  facility_address: z.string().optional(),
  facility_resident_count: z.number().optional(),
  alert_visibility_enabled: z.boolean(),
  billing_model: z.enum(["commission", "per_resident", "custom"]),
  custom_rate_monthly: z.number().optional(),
  // New fields
  region: z.string().optional(),
  how_heard_about_us: z.string().optional(),
  position_title: z.string().optional(),
});

type PartnerFormValues = z.infer<typeof partnerFormSchema>;

export default function AddPartnerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerFormSchema),
    defaultValues: {
      contact_name: "",
      last_name: "",
      company_name: "",
      email: "",
      phone: "",
      preferred_language: "es",
      payout_beneficiary_name: "",
      payout_iban: "",
      notes_internal: "",
      partner_type: "referral",
      organization_type: "individual",
      organization_registration: "",
      organization_website: "",
      estimated_monthly_referrals: "",
      facility_address: "",
      facility_resident_count: undefined,
      alert_visibility_enabled: false,
      billing_model: "commission",
      custom_rate_monthly: undefined,
      region: "",
      how_heard_about_us: "",
      position_title: "",
    },
  });

  const partnerType = form.watch("partner_type");
  const billingModel = form.watch("billing_model");
  const isCareOrResidential = isB2BPartnerType(partnerType);
  const isResidential = partnerType === "residential";

  const onSubmit = async (data: PartnerFormValues) => {
    setIsSubmitting(true);
    try {
      // Get the current session for auth header
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Not authenticated");
      }

      // Call the edge function to create partner with auth user and email
      const response = await supabase.functions.invoke("partner-admin-create", {
        body: {
          contact_name: data.contact_name,
          last_name: data.last_name || null,
          company_name: data.company_name || null,
          email: data.email,
          phone: data.phone || null,
          preferred_language: data.preferred_language,
          payout_beneficiary_name: data.payout_beneficiary_name || null,
          payout_iban: data.payout_iban || null,
          notes_internal: data.notes_internal || null,
          // B2B fields
          partner_type: data.partner_type,
          organization_type: data.organization_type || "individual",
          organization_registration: data.organization_registration || null,
          organization_website: data.organization_website || null,
          estimated_monthly_referrals: data.estimated_monthly_referrals || null,
          facility_address: data.facility_address || null,
          facility_resident_count: data.facility_resident_count || null,
          alert_visibility_enabled: data.alert_visibility_enabled,
          billing_model: data.billing_model,
          custom_rate_monthly: data.custom_rate_monthly || null,
          // New fields
          region: data.region || null,
          how_heard_about_us: data.how_heard_about_us || null,
          position_title: data.position_title || null,
        },
      });

      // Handle edge function errors - parse the response body for details
      if (response.error) {
        // Try to get the actual error message from the response
        const errorData = response.data;
        const errorMessage = errorData?.error || response.error.message || "Failed to create partner";
        throw new Error(errorMessage);
      }

      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || "Failed to create partner");
      }

      toast.success("Partner created successfully! Login credentials sent via email.");
      navigate(`/admin/partners/${result.partner_id}`);
    } catch (error: unknown) {
      console.error("Error creating partner:", error);
      const message = error instanceof Error ? error.message : "Failed to create partner";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/partners")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
         <div>
           <h1 className="text-2xl font-bold">{t("adminAddPartner.title", "Add New Partner")}</h1>
           <p className="text-muted-foreground">
             {t("adminAddPartner.subtitle", "Create a new affiliate partner manually")}
           </p>
         </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Partner Type Selection */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Partner Type
              </CardTitle>
              <CardDescription>
                Select the type of partner to enable appropriate features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Partner Type *</Label>
                <Select
                  value={form.watch("partner_type")}
                  onValueChange={(value: PartnerFormValues["partner_type"]) =>
                    form.setValue("partner_type", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTNER_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>
                        {getPartnerTypeLabel(pt.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Contact Information
              </CardTitle>
              <CardDescription>
                Basic details about the partner
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name *</Label>
                <Input
                  id="contact_name"
                  {...form.register("contact_name")}
                  placeholder="Full name"
                />
                {form.formState.errors.contact_name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.contact_name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  {...form.register("company_name")}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                  placeholder="partner@example.com"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  {...form.register("last_name")}
                  placeholder="Last name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  {...form.register("phone")}
                  placeholder="+34 600 000 000"
                />
              </div>

              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={form.watch("region") || ""}
                  onValueChange={(value) => form.setValue("region", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.value.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>How Heard About Us</Label>
                <Select
                  value={form.watch("how_heard_about_us") || ""}
                  onValueChange={(value) => form.setValue("how_heard_about_us", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOW_HEARD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.value.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferred_language">Preferred Language</Label>
                <Select
                  value={form.watch("preferred_language")}
                  onValueChange={(value: "en" | "es") =>
                    form.setValue("preferred_language", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Payout Information */}
          <Card>
            <CardHeader>
              <CardTitle>Payout Information</CardTitle>
              <CardDescription>
                Bank details for commission payments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="payout_beneficiary_name">Beneficiary Name</Label>
                <Input
                  id="payout_beneficiary_name"
                  {...form.register("payout_beneficiary_name")}
                  placeholder="Name on bank account"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payout_iban">IBAN</Label>
                <Input
                  id="payout_iban"
                  {...form.register("payout_iban")}
                  placeholder="ES00 0000 0000 0000 0000 0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes_internal">Internal Notes</Label>
                <Textarea
                  id="notes_internal"
                  {...form.register("notes_internal")}
                  placeholder="Private notes about this partner (not visible to partner)"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Organization Details - Only for Care/Residential */}
          {isCareOrResidential && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organization Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Organization Type</Label>
                  <Select
                    value={form.watch("organization_type") || "individual"}
                    onValueChange={(value) => form.setValue("organization_type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="charity">Charity / Non-Profit</SelectItem>
                      <SelectItem value="care_agency">Care Agency</SelectItem>
                      <SelectItem value="home_care">Home Care Provider</SelectItem>
                      <SelectItem value="care_home">Care Home</SelectItem>
                      <SelectItem value="urbanization">Urbanization / Community</SelectItem>
                      <SelectItem value="retirement_community">Retirement Community</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organization_registration">Registration Number</Label>
                  <Input
                    id="organization_registration"
                    {...form.register("organization_registration")}
                    placeholder="Charity/Company registration"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organization_website">Website</Label>
                  <Input
                    id="organization_website"
                    {...form.register("organization_website")}
                    placeholder="https://..."
                  />
                </div>

                {partnerType === "care" && (
                  <div className="space-y-2">
                    <Label>Estimated Monthly Referrals</Label>
                    <Select
                      value={form.watch("estimated_monthly_referrals") || ""}
                      onValueChange={(value) => form.setValue("estimated_monthly_referrals", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-5">1-5 per month</SelectItem>
                        <SelectItem value="5-10">5-10 per month</SelectItem>
                        <SelectItem value="10-20">10-20 per month</SelectItem>
                        <SelectItem value="20+">20+ per month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Facility Information - Only for Residential */}
          {isResidential && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Facility Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="facility_address">Facility Address</Label>
                  <Input
                    id="facility_address"
                    {...form.register("facility_address")}
                    placeholder="Full address of the facility"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="facility_resident_count">Number of Residents</Label>
                  <Input
                    id="facility_resident_count"
                    type="number"
                    {...form.register("facility_resident_count", { valueAsNumber: true })}
                    placeholder="Total resident count"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Alert Visibility - Only for Residential */}
          {isResidential && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Alert Visibility
                </CardTitle>
                <CardDescription>
                  Allow this partner to receive notifications when their residents trigger alerts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable Alert Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Partner will receive email/SMS when subscribed members have alerts
                    </p>
                  </div>
                  <Switch
                    checked={form.watch("alert_visibility_enabled")}
                    onCheckedChange={(v) => form.setValue("alert_visibility_enabled", v)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Billing Model - Only for Residential */}
          {isResidential && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Billing Model
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Billing Model</Label>
                  <Select
                    value={form.watch("billing_model")}
                    onValueChange={(value: "commission" | "per_resident" | "custom") =>
                      form.setValue("billing_model", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="commission">Commission-based</SelectItem>
                      <SelectItem value="per_resident">Per Resident</SelectItem>
                      <SelectItem value="custom">Custom Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {billingModel === "custom" && (
                  <div className="space-y-2">
                    <Label htmlFor="custom_rate_monthly">Custom Monthly Rate (€)</Label>
                    <Input
                      id="custom_rate_monthly"
                      type="number"
                      step="0.01"
                      {...form.register("custom_rate_monthly", { valueAsNumber: true })}
                      placeholder="0.00"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/partners")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? "Creating..." : "Create Partner"}
          </Button>
        </div>
      </form>
    </div>
  );
}
