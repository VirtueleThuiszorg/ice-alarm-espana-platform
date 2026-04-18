import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerData } from "@/hooks/usePartnerData";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Save, Eye, Building2, User, CreditCard, Languages, Home, Bell, MapPin } from "lucide-react";
import { toast } from "sonner";
import { REGIONS, isB2BPartnerType, getPartnerTypeLabel } from "@/config/partnerTypes";
import { useTranslation } from "react-i18next";

export default function PartnerSettingsPage() {
  useTranslation();
  const queryClient = useQueryClient();
  const { isStaff, staffRole } = useAuth();
  const [searchParams] = useSearchParams();

  // Admin view mode detection
  const isAdminRole = isStaff && (staffRole === "admin" || staffRole === "super_admin");
  const partnerIdParam = searchParams.get("partnerId");
  const isAdminViewMode = isAdminRole && !!partnerIdParam;

  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  // Determine partner type
  const partnerType = partner?.partner_type || "referral";
  const isB2B = isB2BPartnerType(partnerType);
  const isResidential = partnerType === "residential";

  // Profile form data
  const [profileData, setProfileData] = useState({
    contactName: "",
    companyName: "",
    cif: "",
    email: "",
    phone: "",
    region: "",
    positionTitle: "",
  });

  // Organization form data
  const [orgData, setOrgData] = useState({
    organizationType: "",
    organizationRegistration: "",
    organizationWebsite: "",
    estimatedMonthlyReferrals: "",
  });

  // Facility form data (for residential partners)
  const [facilityData, setFacilityData] = useState({
    facilityAddress: "",
    facilityResidentCount: "",
    alertVisibilityEnabled: false,
  });

  // Payout form data
  const [payoutData, setPayoutData] = useState({
    payoutBeneficiaryName: "",
    payoutIban: "",
    preferredLanguage: "en",
  });

  // Update forms when partner data loads
  useEffect(() => {
    if (partner) {
      setProfileData({
        contactName: partner.contact_name || "",
        companyName: partner.company_name || "",
        cif: (partner as Record<string, unknown>).cif as string || "",
        email: partner.email || "",
        phone: partner.phone || "",
        region: (partner as Record<string, unknown>).region as string || "",
        positionTitle: (partner as Record<string, unknown>).position_title as string || "",
      });
      setOrgData({
        organizationType: partner.organization_type || "",
        organizationRegistration: partner.organization_registration || "",
        organizationWebsite: partner.organization_website || "",
        estimatedMonthlyReferrals: partner.estimated_monthly_referrals || "",
      });
      setFacilityData({
        facilityAddress: partner.facility_address || "",
        facilityResidentCount: partner.facility_resident_count?.toString() || "",
        alertVisibilityEnabled: partner.alert_visibility_enabled || false,
      });
      setPayoutData({
        payoutBeneficiaryName: partner.payout_beneficiary_name || "",
        payoutIban: partner.payout_iban || "",
        preferredLanguage: partner.preferred_language || "en",
      });
    }
  }, [partner]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("partners")
        .update({
          contact_name: profileData.contactName,
          company_name: profileData.companyName || null,
          cif: profileData.cif || null,
          email: profileData.email,
          phone: profileData.phone || null,
          region: profileData.region || null,
          position_title: profileData.positionTitle || null,
        } as Record<string, unknown>)
        .eq("id", partner!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["my-partner-data"] });
      if (partnerIdParam) {
        queryClient.invalidateQueries({ queryKey: ["partner-data", partnerIdParam] });
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });

  // Update organization mutation
  const updateOrgMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("partners")
        .update({
          organization_type: orgData.organizationType || null,
          organization_registration: orgData.organizationRegistration || null,
          organization_website: orgData.organizationWebsite || null,
          estimated_monthly_referrals: orgData.estimatedMonthlyReferrals || null,
        })
        .eq("id", partner!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organization details updated!");
      queryClient.invalidateQueries({ queryKey: ["my-partner-data"] });
      if (partnerIdParam) {
        queryClient.invalidateQueries({ queryKey: ["partner-data", partnerIdParam] });
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update organization: ${error.message}`);
    },
  });

  // Update facility mutation
  const updateFacilityMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("partners")
        .update({
          facility_address: facilityData.facilityAddress || null,
          facility_resident_count: facilityData.facilityResidentCount 
            ? parseInt(facilityData.facilityResidentCount) 
            : null,
          alert_visibility_enabled: facilityData.alertVisibilityEnabled,
        })
        .eq("id", partner!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Facility settings updated!");
      queryClient.invalidateQueries({ queryKey: ["my-partner-data"] });
      if (partnerIdParam) {
        queryClient.invalidateQueries({ queryKey: ["partner-data", partnerIdParam] });
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update facility: ${error.message}`);
    },
  });

  // Update payout settings mutation
  const updatePayoutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("partners")
        .update({
          payout_beneficiary_name: payoutData.payoutBeneficiaryName || null,
          payout_iban: payoutData.payoutIban || null,
          preferred_language: payoutData.preferredLanguage,
        })
        .eq("id", partner!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payout settings updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["my-partner-data"] });
      if (partnerIdParam) {
        queryClient.invalidateQueries({ queryKey: ["partner-data", partnerIdParam] });
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update payout settings: ${error.message}`);
    },
  });

  // Get partner type display name
  const getPartnerTypeDisplay = (type: string) => {
    return getPartnerTypeLabel(type);
  };

  // Get organization type options
  const getOrgTypeOptions = () => {
    if (partnerType === "care") {
      return [
        { value: "charity", label: "Charity / Non-profit" },
        { value: "care_agency", label: "Care Agency" },
        { value: "home_care", label: "Home Care Provider" },
        { value: "other", label: "Other" },
      ];
    }
    if (partnerType === "residential") {
      return [
        { value: "care_home", label: "Care Home" },
        { value: "urbanization", label: "Urbanization / Community" },
        { value: "retirement_community", label: "Retirement Community" },
        { value: "other", label: "Other" },
      ];
    }
    return [{ value: "individual", label: "Individual" }];
  };

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-64" />
        </div>
        
        {/* Profile card skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          {isAdminViewMode 
            ? `Viewing ${partner?.contact_name}'s settings`
            : "Manage your partner account settings"
          }
        </p>
      </div>

      {/* Admin View Mode Notice */}
      {isAdminViewMode && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <Eye className="h-4 w-4" />
              <span className="text-sm">
                You are viewing this partner's settings. Changes made here will update their account.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Partner Type</Label>
              <p className="font-medium">{getPartnerTypeDisplay(partnerType)}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <Label className="text-muted-foreground text-xs">Referral Code</Label>
              <p className="font-mono font-medium">{partner?.referral_code}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <Label className="text-muted-foreground text-xs">Status</Label>
              <div className="mt-0.5">
                <Badge 
                  variant={partner?.status === "active" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {partner?.status}
                </Badge>
              </div>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <Label className="text-muted-foreground text-xs">Member Since</Label>
              <p className="font-medium">
                {partner?.created_at 
                  ? new Date(partner.created_at).toLocaleDateString()
                  : "-"
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Your contact and company details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProfileMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contactName">Contact Name *</Label>
                <Input
                  id="contactName"
                  value={profileData.contactName}
                  onChange={(e) =>
                    setProfileData({ ...profileData, contactName: e.target.value })
                  }
                  placeholder="Your full name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) =>
                    setProfileData({ ...profileData, email: e.target.value })
                  }
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) =>
                    setProfileData({ ...profileData, phone: e.target.value })
                  }
                  placeholder="+34 600 000 000"
                />
              </div>

              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={profileData.companyName}
                  onChange={(e) =>
                    setProfileData({ ...profileData, companyName: e.target.value })
                  }
                  placeholder="Your company (if applicable)"
                />
              </div>

              <div>
                <Label htmlFor="cif">CIF / NIF</Label>
                <Input
                  id="cif"
                  value={profileData.cif}
                  onChange={(e) =>
                    setProfileData({ ...profileData, cif: e.target.value.toUpperCase() })
                  }
                  placeholder="B12345678"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Spanish tax identification number (required for companies)
                </p>
              </div>

              <div>
                <Label htmlFor="region">
                  <MapPin className="h-3.5 w-3.5 inline mr-1" />
                  Region
                </Label>
                <Select
                  value={profileData.region}
                  onValueChange={(value) =>
                    setProfileData({ ...profileData, region: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.labelKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isB2B && (
                <div>
                  <Label htmlFor="positionTitle">Position / Title</Label>
                  <Input
                    id="positionTitle"
                    value={profileData.positionTitle}
                    onChange={(e) =>
                      setProfileData({ ...profileData, positionTitle: e.target.value })
                    }
                    placeholder="e.g. Director, Manager"
                  />
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={updateProfileMutation.isPending || !profileData.contactName || !profileData.email}
            >
              {updateProfileMutation.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Profile
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Organization Details - Only for B2B partners */}
      {isB2B && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Details
            </CardTitle>
            <CardDescription>
              Information about your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateOrgMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="organizationType">Organization Type</Label>
                  <Select
                    value={orgData.organizationType}
                    onValueChange={(value) =>
                      setOrgData({ ...orgData, organizationType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {getOrgTypeOptions().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="organizationRegistration">Registration Number</Label>
                  <Input
                    id="organizationRegistration"
                    value={orgData.organizationRegistration}
                    onChange={(e) =>
                      setOrgData({ ...orgData, organizationRegistration: e.target.value })
                    }
                    placeholder="Charity/Company registration"
                  />
                </div>

                <div>
                  <Label htmlFor="organizationWebsite">Website</Label>
                  <Input
                    id="organizationWebsite"
                    value={orgData.organizationWebsite}
                    onChange={(e) =>
                      setOrgData({ ...orgData, organizationWebsite: e.target.value })
                    }
                    placeholder="https://example.com"
                  />
                </div>

                {partnerType === "care" && (
                  <div>
                    <Label htmlFor="estimatedMonthlyReferrals">Est. Monthly Referrals</Label>
                    <Select
                      value={orgData.estimatedMonthlyReferrals}
                      onValueChange={(value) =>
                        setOrgData({ ...orgData, estimatedMonthlyReferrals: value })
                      }
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

              <Button
                type="submit"
                disabled={updateOrgMutation.isPending}
              >
                {updateOrgMutation.isPending ? (
                  "Saving..."
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Organization Details
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Facility Information - Only for Residential partners */}
      {isResidential && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Facility Information
            </CardTitle>
            <CardDescription>
              Details about your care facility or community
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateFacilityMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="facilityAddress">Facility Address</Label>
                  <Input
                    id="facilityAddress"
                    value={facilityData.facilityAddress}
                    onChange={(e) =>
                      setFacilityData({ ...facilityData, facilityAddress: e.target.value })
                    }
                    placeholder="Full address of your facility"
                  />
                </div>

                <div>
                  <Label htmlFor="facilityResidentCount">Number of Residents</Label>
                  <Input
                    id="facilityResidentCount"
                    type="number"
                    value={facilityData.facilityResidentCount}
                    onChange={(e) =>
                      setFacilityData({ ...facilityData, facilityResidentCount: e.target.value })
                    }
                    placeholder="Approximate number"
                  />
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <Label className="text-base">Alert Visibility</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications when your residents trigger SOS alerts
                  </p>
                </div>
                <Switch
                  checked={facilityData.alertVisibilityEnabled}
                  onCheckedChange={(checked) =>
                    setFacilityData({ ...facilityData, alertVisibilityEnabled: checked })
                  }
                />
              </div>

              {facilityData.alertVisibilityEnabled && (
                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="text-muted-foreground">
                    When enabled, you'll receive email notifications for alerts from your subscribed residents.
                    You can manage individual subscriptions on the <strong>Members</strong> page.
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={updateFacilityMutation.isPending}
              >
                {updateFacilityMutation.isPending ? (
                  "Saving..."
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Facility Settings
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Payout Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payout Information
          </CardTitle>
          <CardDescription>
            Bank details for receiving commission payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updatePayoutMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="beneficiaryName">Beneficiary Name</Label>
                <Input
                  id="beneficiaryName"
                  value={payoutData.payoutBeneficiaryName}
                  onChange={(e) =>
                    setPayoutData({ ...payoutData, payoutBeneficiaryName: e.target.value })
                  }
                  placeholder="Full name as it appears on your bank account"
                />
              </div>

              <div>
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  value={payoutData.payoutIban}
                  onChange={(e) =>
                    setPayoutData({ ...payoutData, payoutIban: e.target.value.toUpperCase() })
                  }
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your IBAN for bank transfers
                </p>
              </div>
            </div>

            <Button
              type="submit"
              disabled={updatePayoutMutation.isPending}
            >
              {updatePayoutMutation.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Payout Details
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Preferences
          </CardTitle>
          <CardDescription>
            Language and communication settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updatePayoutMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="max-w-xs">
              <Label htmlFor="language">Preferred Language</Label>
              <Select
                value={payoutData.preferredLanguage}
                onValueChange={(value) =>
                  setPayoutData({ ...payoutData, preferredLanguage: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Language for emails and notifications
              </p>
            </div>

            <Button
              type="submit"
              disabled={updatePayoutMutation.isPending}
            >
              {updatePayoutMutation.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Preferences
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
