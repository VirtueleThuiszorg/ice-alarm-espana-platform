import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, MapPin, Bell, Save, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface PartnerOrganizationTabProps {
  partner: {
    id: string;
    partner_type: string;
    organization_type: string | null;
    organization_registration: string | null;
    organization_website: string | null;
    estimated_monthly_referrals: string | null;
    facility_address: string | null;
    facility_resident_count: number | null;
    alert_visibility_enabled: boolean;
    billing_model: string;
    custom_rate_monthly: number | null;
  };
}

const partnerTypeLabels: Record<string, string> = {
  referral: "Referral Partner",
  care: "Care Partner",
  residential: "Residential Partner",
};

const organizationTypeLabels: Record<string, string> = {
  individual: "Individual",
  charity: "Charity / Non-Profit",
  care_agency: "Care Agency",
  home_care: "Home Care Provider",
  care_home: "Care Home",
  urbanization: "Urbanization / Community",
  retirement_community: "Retirement Community",
  other: "Other",
};

const billingModelLabels: Record<string, string> = {
  commission: "Commission-based",
  per_resident: "Per Resident",
  custom: "Custom Rate",
};

export function PartnerOrganizationTab({ partner }: PartnerOrganizationTabProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    partner_type: partner.partner_type || "referral",
    organization_type: partner.organization_type || "individual",
    organization_registration: partner.organization_registration || "",
    organization_website: partner.organization_website || "",
    estimated_monthly_referrals: partner.estimated_monthly_referrals || "",
    facility_address: partner.facility_address || "",
    facility_resident_count: partner.facility_resident_count?.toString() || "",
    alert_visibility_enabled: partner.alert_visibility_enabled || false,
    billing_model: partner.billing_model || "commission",
    custom_rate_monthly: partner.custom_rate_monthly?.toString() || "",
  });
  const [hasChanges, setHasChanges] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("partners")
        .update({
          partner_type: data.partner_type,
          organization_type: data.organization_type,
          organization_registration: data.organization_registration || null,
          organization_website: data.organization_website || null,
          estimated_monthly_referrals: data.estimated_monthly_referrals || null,
          facility_address: data.facility_address || null,
          facility_resident_count: data.facility_resident_count ? parseInt(data.facility_resident_count) : null,
          alert_visibility_enabled: data.alert_visibility_enabled,
          billing_model: data.billing_model,
          custom_rate_monthly: data.custom_rate_monthly ? parseFloat(data.custom_rate_monthly) : null,
        })
        .eq("id", partner.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organization details updated");
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["partner", partner.id] });
    },
    onError: (error) => {
      console.error("Failed to update:", error);
      toast.error("Failed to update organization details");
    },
  });

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const isCareOrResidential = formData.partner_type === "care" || formData.partner_type === "residential";
  const isResidential = formData.partner_type === "residential";

  return (
    <div className="space-y-6">
      {/* Partner Type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Partner Classification
          </CardTitle>
          <CardDescription>
            Categorize this partner to enable appropriate features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Partner Type</Label>
            <Select
              value={formData.partner_type}
              onValueChange={(v) => handleChange("partner_type", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="referral">Referral Partner (Individual Affiliate)</SelectItem>
                <SelectItem value="care">Care Partner (Agency / Charity)</SelectItem>
                <SelectItem value="residential">Residential Partner (Care Home / Urbanization)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant={formData.partner_type === "referral" ? "default" : "outline"}>
              {partnerTypeLabels[formData.partner_type]}
            </Badge>
            {isCareOrResidential && (
              <Badge variant="secondary">
                {organizationTypeLabels[formData.organization_type] || formData.organization_type}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Organization Details - Only for Care/Residential */}
      {isCareOrResidential && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Organization Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Organization Type</Label>
                <Select
                  value={formData.organization_type}
                  onValueChange={(v) => handleChange("organization_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(organizationTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Registration Number</Label>
                <Input
                  value={formData.organization_registration}
                  onChange={(e) => handleChange("organization_registration", e.target.value)}
                  placeholder="Charity/Company registration"
                />
              </div>

              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={formData.organization_website}
                  onChange={(e) => handleChange("organization_website", e.target.value)}
                  placeholder="https://..."
                />
              </div>

              {formData.partner_type === "care" && (
                <div className="space-y-2">
                  <Label>Estimated Monthly Referrals</Label>
                  <Select
                    value={formData.estimated_monthly_referrals}
                    onValueChange={(v) => handleChange("estimated_monthly_referrals", v)}
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Facility Details - Only for Residential */}
      {isResidential && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Facility Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Facility Address</Label>
                <Input
                  value={formData.facility_address}
                  onChange={(e) => handleChange("facility_address", e.target.value)}
                  placeholder="Full address of the facility"
                />
              </div>

              <div className="space-y-2">
                <Label>Number of Residents</Label>
                <Input
                  type="number"
                  value={formData.facility_resident_count}
                  onChange={(e) => handleChange("facility_resident_count", e.target.value)}
                  placeholder="Total resident count"
                />
              </div>
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
                checked={formData.alert_visibility_enabled}
                onCheckedChange={(v) => handleChange("alert_visibility_enabled", v)}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Billing Model</Label>
                <Select
                  value={formData.billing_model}
                  onValueChange={(v) => handleChange("billing_model", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(billingModelLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.billing_model === "custom" && (
                <div className="space-y-2">
                  <Label>Custom Monthly Rate (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.custom_rate_monthly}
                    onChange={(e) => handleChange("custom_rate_monthly", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
