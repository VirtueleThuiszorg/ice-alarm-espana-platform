import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Building2,
  CreditCard,
  Check,
  Eye,
  EyeOff,
  Save,
  Loader2,
  AlertCircle,
  Percent,
  Tag,
  FlaskConical,
  ToggleLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagesSettingsTab } from "@/components/admin/settings/ImagesSettingsTab";
import { DocumentationSettingsTab } from "@/components/admin/settings/DocumentationSettingsTab";
import { CommunicationsTab } from "@/components/admin/settings/CommunicationsTab";
import { DevicesSettingsTab } from "@/components/admin/settings/DevicesSettingsTab";
import { PRICING } from "@/config/pricing";

interface SystemSetting {
  key: string;
  value: string;
  updated_at?: string;
}

const mask = (val?: string | null) => (val ? "••••••••••••" : "");

// ✅ Canonical keys in `system_settings`
const KEY = {
  // Company (these are stored with settings_ prefix)
  COMPANY_NAME: "settings_company_name",
  EMERGENCY_PHONE: "settings_emergency_phone",
  SUPPORT_EMAIL: "settings_support_email",
  ADDRESS: "settings_address",

  // Registration fee settings (stored with settings_ prefix)
  REG_FEE_ENABLED: "settings_registration_fee_enabled",
  REG_FEE_DISCOUNT: "settings_registration_fee_discount",
  TEST_MODE_ENABLED: "registration_test_mode_enabled",

  // Stripe (no settings_ prefix in your current DB usage)
  STRIPE_SECRET: "stripe_secret_key",
  STRIPE_PUBLISHABLE: "stripe_publishable_key",
  STRIPE_WEBHOOK: "stripe_webhook_secret",

  // Twilio (stored with settings_ prefix)
  TWILIO_SID: "settings_twilio_account_sid",
  TWILIO_TOKEN: "settings_twilio_auth_token",
  TWILIO_PHONE: "settings_twilio_phone_number",
  TWILIO_WA: "settings_twilio_whatsapp_number",

  // Maps
  GOOGLE_MAPS: "google_maps_api_key",

  // Mollie
  ACTIVE_GATEWAY: "settings_active_payment_gateway",
  MOLLIE_API_KEY: "settings_mollie_api_key",
  MOLLIE_WEBHOOK_SECRET: "settings_mollie_webhook_secret",

  // Facebook (✅ MUST match your edge function + reads)
  FB_PAGE_ID: "settings_facebook_page_id",
  FB_PAGE_TOKEN: "settings_facebook_page_access_token",
} as const;

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Company settings state (UI values)
  const [companySettings, setCompanySettings] = useState({
    company_name: "ICE Alarm España",
    emergency_phone: "+34 900 123 456",
    support_email: "info@icealarm.es",
    address: "Calle Principal 1, Albox, 04800 Almería",
  });

  // Pricing settings state (stored WITHOUT settings_ prefix in your codebase)
  const [pricingSettings, setPricingSettings] = useState({
    single_monthly: "27.49",
    single_annual: "274.89",
    couple_monthly: "38.49",
    couple_annual: "384.89",
    registration_fee: "59.99",
    pendant_price: "151.25",
    shipping: "14.99",
  });

  // Registration fee settings state
  const [registrationFeeSettings, setRegistrationFeeSettings] = useState({
    enabled: true,
    discount: 0,
  });

  // Test mode state
  const [testModeEnabled, setTestModeEnabled] = useState(false);

  // Payment gateway state
  const [activeGateway, setActiveGateway] = useState<"stripe" | "mollie">("stripe");

  // Integration keys state
  const [stripeKeys, setStripeKeys] = useState({
    secret_key: "",
    publishable_key: "",
    webhook_secret: "",
  });

  const [mollieKeys, setMollieKeys] = useState({
    api_key: "",
    webhook_secret: "",
  });

  // Twilio non-secret fields (safe to populate from DB)
  const [twilioKeys, setTwilioKeys] = useState({
    account_sid: "",
    phone_number: "",
    whatsapp_number: "",
  });

  // Twilio secret inputs - NEVER auto-filled from DB, only user input
  const [twilioAuthTokenInput, setTwilioAuthTokenInput] = useState("");
  
  // Twilio stored flags - derived from whether backend has a value
  const [twilioAuthTokenStored, setTwilioAuthTokenStored] = useState(false);
  
  // Twilio test state
  const [twilioTestStatus, setTwilioTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [twilioTestMessage, setTwilioTestMessage] = useState("");

  const [googleMapsKey, setGoogleMapsKey] = useState("");

  // Facebook settings state - split into stored flag + new input
  const [facebookPageId, setFacebookPageId] = useState("");
  const [facebookTokenInput, setFacebookTokenInput] = useState("");
  const [facebookTokenStored, setFacebookTokenStored] = useState(false);
  const [showFacebookToken, setShowFacebookToken] = useState(false);

  // Track recently saved sections to prevent useEffect from resetting form values
  const [recentlySavedSection, setRecentlySavedSection] = useState<string | null>(null);

  // Password visibility toggles
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);

  // Fetch settings from database
  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("key, value, updated_at");
      if (error) throw error;
      return (data || []) as SystemSetting[];
    },
    // Avoid surprise refetches while typing/pasting long tokens
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const settingsMap: Record<string, string> =
    settings?.reduce(
      (acc, s) => {
        acc[s.key] = s.value;
        return acc;
      },
      {} as Record<string, string>,
    ) || {};

  // Populate state from fetched settings
  useEffect(() => {
    if (!settings) return;

    // Company
    setCompanySettings((prev) => ({
      company_name: settingsMap[KEY.COMPANY_NAME] || prev.company_name,
      emergency_phone: settingsMap[KEY.EMERGENCY_PHONE] || prev.emergency_phone,
      support_email: settingsMap[KEY.SUPPORT_EMAIL] || prev.support_email,
      address: settingsMap[KEY.ADDRESS] || prev.address,
    }));

    // Pricing
    setPricingSettings((prev) => ({
      single_monthly: settingsMap.single_monthly || prev.single_monthly,
      single_annual: settingsMap.single_annual || prev.single_annual,
      couple_monthly: settingsMap.couple_monthly || prev.couple_monthly,
      couple_annual: settingsMap.couple_annual || prev.couple_annual,
      registration_fee: settingsMap.registration_fee || prev.registration_fee,
      pendant_price: settingsMap.pendant_price || prev.pendant_price,
      shipping: settingsMap.shipping || prev.shipping,
    }));

    // Active gateway
    setActiveGateway((settingsMap[KEY.ACTIVE_GATEWAY] as "stripe" | "mollie") || "stripe");

    // Stripe (masked)
    setStripeKeys({
      secret_key: mask(settingsMap[KEY.STRIPE_SECRET]),
      publishable_key: settingsMap[KEY.STRIPE_PUBLISHABLE] || "",
      webhook_secret: mask(settingsMap[KEY.STRIPE_WEBHOOK]),
    });

    // Mollie (masked)
    setMollieKeys({
      api_key: mask(settingsMap[KEY.MOLLIE_API_KEY]),
      webhook_secret: mask(settingsMap[KEY.MOLLIE_WEBHOOK_SECRET]),
    });

    // Twilio non-secret fields - safe to populate
    setTwilioKeys({
      account_sid: settingsMap[KEY.TWILIO_SID] || "",
      phone_number: settingsMap[KEY.TWILIO_PHONE] || "",
      whatsapp_number: settingsMap[KEY.TWILIO_WA] || "",
    });
    
    // Twilio secret stored flags - NEVER touch the input fields
    setTwilioAuthTokenStored(!!settingsMap[KEY.TWILIO_TOKEN]);

    setGoogleMapsKey(settingsMap[KEY.GOOGLE_MAPS] || "");

    // Facebook (don’t overwrite while saving/pasting)
    if (recentlySavedSection !== "facebook") {
      setFacebookPageId(settingsMap[KEY.FB_PAGE_ID] || "");
      setFacebookTokenStored(!!settingsMap[KEY.FB_PAGE_TOKEN]);
      // IMPORTANT: never fill the input with masked dots from DB
      // keep facebookTokenInput as-is
    }

    // Registration fee (stored with settings_ prefix)
    setRegistrationFeeSettings({
      enabled: (settingsMap[KEY.REG_FEE_ENABLED] ?? "true") !== "false",
      discount: parseFloat(settingsMap[KEY.REG_FEE_DISCOUNT] || "0"),
    });

    // Test mode
    setTestModeEnabled(settingsMap[KEY.TEST_MODE_ENABLED] === "true");
  }, [settings, recentlySavedSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save settings mutation (writes through your edge function save-api-keys)
  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("save-api-keys", {
        body: { service: "settings", keys: updates },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      if (recentlySavedSection === "facebook") {
        setFacebookTokenInput("");
        setFacebookTokenStored(true);
      }
      
      if (recentlySavedSection === "twilio") {
        // Clear secret inputs after successful save
        setTwilioAuthTokenInput("");
        // Flags will be set to true by the subsequent refetch
      }

      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["pricing-settings"] });

      toast({
        title: "Settings saved",
        description: "Your changes have been saved successfully.",
      });

      setTimeout(() => setRecentlySavedSection(null), 1200);
    },
    onError: (error: any) => {
      toast({
        title: "Error saving settings",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  // ✅ Correctly map UI state -> DB keys
  const handleSaveCompany = () => {
    saveMutation.mutate({
      [KEY.COMPANY_NAME]: companySettings.company_name,
      [KEY.EMERGENCY_PHONE]: companySettings.emergency_phone,
      [KEY.SUPPORT_EMAIL]: companySettings.support_email,
      [KEY.ADDRESS]: companySettings.address,
    });
  };

  const handleSavePricing = () => {
    // pricing keys in your DB are currently WITHOUT settings_ prefix
    saveMutation.mutate({ ...pricingSettings });
  };

  const handleSaveRegistrationFee = () => {
    saveMutation.mutate({
      [KEY.REG_FEE_ENABLED]: registrationFeeSettings.enabled.toString(),
      [KEY.REG_FEE_DISCOUNT]: registrationFeeSettings.discount.toString(),
    });
  };

  const handleToggleTestMode = (checked: boolean) => {
    setTestModeEnabled(checked);
    saveMutation.mutate({
      [KEY.TEST_MODE_ENABLED]: checked.toString(),
    });
  };

  const handleSaveGateway = (gateway: "stripe" | "mollie") => {
    setActiveGateway(gateway);
    saveMutation.mutate({ [KEY.ACTIVE_GATEWAY]: gateway });
  };

  const handleSaveMollie = () => {
    const updates: Record<string, string> = {};

    if (mollieKeys.api_key && !mollieKeys.api_key.includes("•")) {
      updates[KEY.MOLLIE_API_KEY] = mollieKeys.api_key;
    }
    if (mollieKeys.webhook_secret && !mollieKeys.webhook_secret.includes("•")) {
      updates[KEY.MOLLIE_WEBHOOK_SECRET] = mollieKeys.webhook_secret;
    }

    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes to save", description: "Enter new values to update the keys." });
      return;
    }

    saveMutation.mutate(updates);
  };

  const handleSaveStripe = () => {
    const updates: Record<string, string> = {};

    if (stripeKeys.secret_key && !stripeKeys.secret_key.includes("•")) {
      updates[KEY.STRIPE_SECRET] = stripeKeys.secret_key;
    }
    if (stripeKeys.publishable_key) {
      updates[KEY.STRIPE_PUBLISHABLE] = stripeKeys.publishable_key;
    }
    if (stripeKeys.webhook_secret && !stripeKeys.webhook_secret.includes("•")) {
      updates[KEY.STRIPE_WEBHOOK] = stripeKeys.webhook_secret;
    }

    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes to save", description: "Enter new values to update the keys." });
      return;
    }

    saveMutation.mutate(updates);
  };

  const handleSaveTwilio = () => {
    const updates: Record<string, string> = {};

    // Non-secret fields
    if (twilioKeys.account_sid) updates[KEY.TWILIO_SID] = twilioKeys.account_sid;
    if (twilioKeys.phone_number) updates[KEY.TWILIO_PHONE] = twilioKeys.phone_number;
    if (twilioKeys.whatsapp_number) updates[KEY.TWILIO_WA] = twilioKeys.whatsapp_number;

    // Secret fields - only include if user typed something new
    const trimmedAuthToken = twilioAuthTokenInput.trim();
    
    if (trimmedAuthToken.length > 0) {
      updates[KEY.TWILIO_TOKEN] = trimmedAuthToken;
    }

    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes to save", description: "Enter new values to update the keys." });
      return;
    }

    setRecentlySavedSection("twilio");
    saveMutation.mutate(updates);
  };

  const handleSaveGoogleMaps = () => {
    if (!googleMapsKey.trim()) return;
    saveMutation.mutate({ [KEY.GOOGLE_MAPS]: googleMapsKey.trim() });
  };

  const handleSaveFacebook = () => {
    const updates: Record<string, string> = {};

    // ✅ These MUST be the settings_* keys because your edge function reads settings_facebook_*
    if (facebookPageId.trim()) updates[KEY.FB_PAGE_ID] = facebookPageId.trim();

    const newToken = facebookTokenInput.trim();
    if (newToken.length > 0) updates[KEY.FB_PAGE_TOKEN] = newToken;

    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes to save", description: "Enter a Page ID or paste a new token to save." });
      return;
    }

    setRecentlySavedSection("facebook");
    saveMutation.mutate(updates);
  };

  const handleSaveWhatsApp = () => {
    if (!twilioKeys.whatsapp_number.trim()) {
      toast({ title: "No changes to save", description: "Enter a WhatsApp number to save." });
      return;
    }
    saveMutation.mutate({ [KEY.TWILIO_WA]: twilioKeys.whatsapp_number.trim() });
  };

  const handleTestTwilio = async () => {
    // Warn if there are unsaved secret inputs
    if (twilioAuthTokenInput.trim()) {
      toast({
        title: "Unsaved changes",
        description: "Please save your changes before testing the connection.",
        variant: "destructive",
      });
      return;
    }

    setTwilioTestStatus("testing");
    setTwilioTestMessage("");
    try {
      const response = await supabase.functions.invoke("test-twilio");
      if (response.error) throw response.error;

      const data = response.data;
      if (data.success) {
        setTwilioTestStatus("success");
        setTwilioTestMessage(data.message || "Connection verified - Twilio is working");
      } else {
        setTwilioTestStatus("error");
        setTwilioTestMessage(data.error || "Connection test failed");
      }
    } catch (error: any) {
      setTwilioTestStatus("error");
      setTwilioTestMessage(error?.message || "Failed to test connection");
    }
  };

  const getIntegrationStatus = (keys: string[]) => {
    return keys.every((k) => !!settingsMap[k]);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("adminSettings.title", "Settings")}</h1>
        <p className="text-muted-foreground">{t("adminSettings.subtitle", "Manage system configuration and integrations.")}</p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="company">{t("adminSettings.company", "Company")}</TabsTrigger>
          <TabsTrigger value="pricing">{t("adminSettings.pricing", "Pricing")}</TabsTrigger>
          <TabsTrigger value="payments">{t("adminSettings.payments", "Payments")}</TabsTrigger>
          <TabsTrigger value="communications">{t("adminSettings.communications", "Communications")}</TabsTrigger>
          <TabsTrigger value="devices">{t("adminSettings.devices", "Devices")}</TabsTrigger>
          <TabsTrigger value="images">{t("adminSettings.images", "Images")}</TabsTrigger>
          <TabsTrigger value="documentation">{t("adminSettings.documentation", "Docs")}</TabsTrigger>
        </TabsList>

        {/* Company Tab */}
        <TabsContent value="company">
          <Card>
            <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {t("adminSettings.companyProfile", "Company Profile")}
              </CardTitle>
              <CardDescription>{t("adminSettings.companyProfileDesc", "Basic company information displayed to members")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                   <Label>{t("adminSettings.companyName", "Company Name")}</Label>
                  <Input
                    value={companySettings.company_name}
                    onChange={(e) => setCompanySettings((prev) => ({ ...prev, company_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                   <Label>{t("adminSettings.emergencyPhone", "Emergency Phone")}</Label>
                  <Input
                    value={companySettings.emergency_phone}
                    onChange={(e) => setCompanySettings((prev) => ({ ...prev, emergency_phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                   <Label>{t("adminSettings.supportEmail", "Support Email")}</Label>
                  <Input
                    value={companySettings.support_email}
                    onChange={(e) => setCompanySettings((prev) => ({ ...prev, support_email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                   <Label>{t("adminSettings.address", "Address")}</Label>
                  <Input
                    value={companySettings.address}
                    onChange={(e) => setCompanySettings((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </div>
              </div>
              <Button onClick={handleSaveCompany} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                   <Save className="h-4 w-4 mr-2" />
                )}
                {t("common.saveChanges", "Save Changes")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pricing Tab */}
        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Pricing Configuration
              </CardTitle>
              <CardDescription>Configure membership and product pricing (prices include IVA)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium mb-3">Membership Fees</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Single Monthly (€)</Label>
                      <Input
                        value={pricingSettings.single_monthly}
                        onChange={(e) => setPricingSettings((prev) => ({ ...prev, single_monthly: e.target.value }))}
                        type="number"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Single Annual (€)</Label>
                      <Input
                        value={pricingSettings.single_annual}
                        onChange={(e) => setPricingSettings((prev) => ({ ...prev, single_annual: e.target.value }))}
                        type="number"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Couple Monthly (€)</Label>
                      <Input
                        value={pricingSettings.couple_monthly}
                        onChange={(e) => setPricingSettings((prev) => ({ ...prev, couple_monthly: e.target.value }))}
                        type="number"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Couple Annual (€)</Label>
                      <Input
                        value={pricingSettings.couple_annual}
                        onChange={(e) => setPricingSettings((prev) => ({ ...prev, couple_annual: e.target.value }))}
                        type="number"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-3">One-time Fees</h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Registration Fee (€)</Label>
                      <Input
                        value={pricingSettings.registration_fee}
                        onChange={(e) => setPricingSettings((prev) => ({ ...prev, registration_fee: e.target.value }))}
                        type="number"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pendant Device (€)</Label>
                      <Input
                        value={pricingSettings.pendant_price}
                        onChange={(e) => setPricingSettings((prev) => ({ ...prev, pendant_price: e.target.value }))}
                        type="number"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Shipping (€)</Label>
                      <Input
                        value={pricingSettings.shipping}
                        onChange={(e) => setPricingSettings((prev) => ({ ...prev, shipping: e.target.value }))}
                        type="number"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSavePricing} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Pricing
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Registration Fee Settings Card */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Registration Fee Settings
              </CardTitle>
              <CardDescription>Toggle the registration fee on/off and apply discounts for promotions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                  <div className="space-y-0.5">
                    <Label className="text-base">Enable Registration Fee</Label>
                    <p className="text-sm text-muted-foreground">
                      Base Price: €{PRICING.registration.amount.toFixed(2)}
                    </p>
                  </div>
                  <Switch
                    checked={registrationFeeSettings.enabled}
                    onCheckedChange={(checked) => setRegistrationFeeSettings((prev) => ({ ...prev, enabled: checked }))}
                  />
                </div>

                {registrationFeeSettings.enabled && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Percent className="h-4 w-4" />
                        Discount
                      </Label>
                      <span className="text-lg font-semibold">{registrationFeeSettings.discount}%</span>
                    </div>

                    <Slider
                      value={[registrationFeeSettings.discount]}
                      onValueChange={(value) => setRegistrationFeeSettings((prev) => ({ ...prev, discount: value[0] }))}
                      max={100}
                      step={5}
                      className="py-4"
                    />

                    <div className="flex flex-wrap gap-2">
                      {[0, 25, 50, 75, 100].map((preset) => (
                        <Button
                          key={preset}
                          variant={registrationFeeSettings.discount === preset ? "default" : "outline"}
                          size="sm"
                          onClick={() => setRegistrationFeeSettings((prev) => ({ ...prev, discount: preset }))}
                        >
                          {preset}%{preset === 100 && " (FREE)"}
                        </Button>
                      ))}
                    </div>

                    <div className="p-4 rounded-lg border bg-card">
                      <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                      <div className="flex items-center gap-3">
                        {registrationFeeSettings.discount > 0 ? (
                          <>
                            <span className="text-muted-foreground line-through">
                              €{PRICING.registration.amount.toFixed(2)}
                            </span>
                            <span className="text-xl font-bold text-primary">
                              {registrationFeeSettings.discount === 100
                                ? "FREE"
                                : `€${(PRICING.registration.amount * (1 - registrationFeeSettings.discount / 100)).toFixed(2)}`}
                            </span>
                            {registrationFeeSettings.discount === 100 ? (
                              <Badge variant="secondary" className="bg-status-active/20 text-status-active border-0">
                                🎉 Free Promotion
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-status-active/20 text-status-active border-0">
                                {registrationFeeSettings.discount}% off
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-xl font-bold">€{PRICING.registration.amount.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!registrationFeeSettings.enabled && (
                  <div className="p-4 rounded-lg border bg-muted/50 text-center">
                    <p className="text-muted-foreground">
                      Registration fee is currently <span className="font-semibold text-foreground">disabled</span>. New
                      members will not be charged a registration fee.
                    </p>
                  </div>
                )}

                <Button onClick={handleSaveRegistrationFee} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Registration Fee Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Test Mode Card */}
          <Card className="mt-6 border-orange-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-orange-500" />
                Test Mode
                {testModeEnabled && (
                  <Badge className="bg-orange-500/20 text-orange-600 border-0 ml-2">
                    Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Allow completing registrations without payment for testing purposes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-lg border bg-orange-50 border-orange-200">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Test Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Shows a "Complete FREE (Test Mode)" button on the payment step
                  </p>
                </div>
                <Switch
                  checked={testModeEnabled}
                  onCheckedChange={handleToggleTestMode}
                />
              </div>
              {testModeEnabled && (
                <div className="mt-4 p-4 rounded-lg border border-orange-300 bg-orange-100">
                  <p className="text-sm text-orange-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Warning:</strong> Test mode is enabled. Orders completed via test mode will be marked 
                      with "TEST MODE - No payment collected" and all records will be set to active/completed status.
                    </span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          {/* Active Gateway Selector */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ToggleLeft className="h-5 w-5" />
                Active Payment Gateway
              </CardTitle>
              <CardDescription>
                Choose which payment provider handles new member checkouts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleSaveGateway("stripe")}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    activeGateway === "stripe"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-lg">Stripe</span>
                    {activeGateway === "stripe" && (
                      <Badge className="bg-alert-resolved text-alert-resolved-foreground">
                        <Check className="mr-1 h-3 w-3" />Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Cards, Apple Pay, Google Pay. Global coverage.
                  </p>
                </button>
                <button
                  onClick={() => handleSaveGateway("mollie")}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    activeGateway === "mollie"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-lg">Mollie</span>
                    {activeGateway === "mollie" && (
                      <Badge className="bg-alert-resolved text-alert-resolved-foreground">
                        <Check className="mr-1 h-3 w-3" />Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    iDEAL, Bancontact, SEPA, cards. EU-focused.
                  </p>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Stripe Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Stripe Configuration
                {getIntegrationStatus([KEY.STRIPE_SECRET, KEY.STRIPE_PUBLISHABLE]) ? (
                  <Badge className="bg-alert-resolved text-alert-resolved-foreground ml-2">
                    <Check className="mr-1 h-3 w-3" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 ml-2">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Not Configured
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Connect your Stripe account for payment processing. Get your API keys from the{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Stripe Dashboard
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Publishable Key</Label>
                  <Input
                    value={stripeKeys.publishable_key}
                    onChange={(e) => setStripeKeys((prev) => ({ ...prev, publishable_key: e.target.value }))}
                    placeholder="pk_live_..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Starts with pk_live_ (production) or pk_test_ (testing)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <div className="relative">
                    <Input
                      type={showStripeSecret ? "text" : "password"}
                      value={stripeKeys.secret_key}
                      onChange={(e) => setStripeKeys((prev) => ({ ...prev, secret_key: e.target.value }))}
                      placeholder="sk_live_..."
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 z-10"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowStripeSecret((prev) => !prev)}
                    >
                      {showStripeSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Starts with sk_live_ (production) or sk_test_ (testing)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input
                    type="password"
                    value={stripeKeys.webhook_secret}
                    onChange={(e) => setStripeKeys((prev) => ({ ...prev, webhook_secret: e.target.value }))}
                    placeholder="whsec_..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in Stripe Dashboard → Webhooks → Your endpoint → Signing secret
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveStripe} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Stripe Configuration
              </Button>

              <Separator className="my-6" />

              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">Webhook URL</h4>
                <p className="text-sm text-muted-foreground mb-2">Add this URL to your Stripe webhook endpoints:</p>
                <code className="block p-2 bg-background rounded border text-sm break-all">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`}
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Events to listen for: checkout.session.completed, payment_intent.succeeded,
                  payment_intent.payment_failed, customer.subscription.updated, customer.subscription.deleted,
                  invoice.paid, invoice.payment_failed
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mollie Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Mollie Configuration
                {getIntegrationStatus([KEY.MOLLIE_API_KEY]) ? (
                  <Badge className="bg-alert-resolved text-alert-resolved-foreground ml-2">
                    <Check className="mr-1 h-3 w-3" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 ml-2">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Not Configured
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Connect your Mollie account for EU payment processing. Get your API key from the{" "}
                <a
                  href="https://my.mollie.com/dashboard/developers/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Mollie Dashboard
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      value={mollieKeys.api_key}
                      onChange={(e) => setMollieKeys((prev) => ({ ...prev, api_key: e.target.value }))}
                      placeholder="live_..."
                      className="pr-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Starts with live_ (production) or test_ (testing)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Webhook Secret (optional)</Label>
                  <Input
                    type="password"
                    value={mollieKeys.webhook_secret}
                    onChange={(e) => setMollieKeys((prev) => ({ ...prev, webhook_secret: e.target.value }))}
                    placeholder="Optional additional security"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional extra verification for webhook callbacks
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveMollie} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Mollie Configuration
              </Button>

              <Separator className="my-6" />

              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">Webhook URL</h4>
                <p className="text-sm text-muted-foreground mb-2">Mollie sends webhook callbacks automatically. Ensure this URL is reachable:</p>
                <code className="block p-2 bg-background rounded border text-sm break-all">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mollie-webhook`}
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="communications">
          <CommunicationsTab
            twilioKeys={twilioKeys}
            setTwilioKeys={setTwilioKeys}
            twilioAuthTokenInput={twilioAuthTokenInput}
            setTwilioAuthTokenInput={setTwilioAuthTokenInput}
            twilioAuthTokenStored={twilioAuthTokenStored}
            showTwilioToken={showTwilioToken}
            setShowTwilioToken={setShowTwilioToken}
            twilioTestStatus={twilioTestStatus}
            twilioTestMessage={twilioTestMessage}
            handleSaveTwilio={handleSaveTwilio}
            handleTestTwilio={handleTestTwilio}
            facebookPageId={facebookPageId}
            setFacebookPageId={setFacebookPageId}
            facebookTokenInput={facebookTokenInput}
            setFacebookTokenInput={setFacebookTokenInput}
            facebookTokenStored={facebookTokenStored}
            showFacebookToken={showFacebookToken}
            setShowFacebookToken={setShowFacebookToken}
            handleSaveFacebook={handleSaveFacebook}
            googleMapsKey={googleMapsKey}
            setGoogleMapsKey={setGoogleMapsKey}
            handleSaveGoogleMaps={handleSaveGoogleMaps}
            handleSaveWhatsApp={handleSaveWhatsApp}
            isSaving={saveMutation.isPending}
            twilioConfigured={getIntegrationStatus([KEY.TWILIO_SID, KEY.TWILIO_TOKEN])}
            whatsappConfigured={!!settingsMap[KEY.TWILIO_WA]}
            facebookConfigured={getIntegrationStatus([KEY.FB_PAGE_ID, KEY.FB_PAGE_TOKEN])}
            mapsConfigured={!!settingsMap[KEY.GOOGLE_MAPS]}
          />
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices">
          <DevicesSettingsTab isSaving={saveMutation.isPending} />
        </TabsContent>

        {/* Images Tab */}
        <TabsContent value="images">
          <ImagesSettingsTab />
        </TabsContent>

        {/* Documentation Tab */}
        <TabsContent value="documentation">
          <DocumentationSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
