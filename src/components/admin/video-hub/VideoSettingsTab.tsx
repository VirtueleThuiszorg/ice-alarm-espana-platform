import { useTranslation } from "react-i18next";
import { Settings, Type, Loader2, Phone, Globe, Youtube, Accessibility, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useVideoBrandSettings } from "@/hooks/useVideoBrandSettings";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoUploadSection } from "./LogoUploadSection";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export function VideoSettingsTab() {
  const { t } = useTranslation();
  const { settings, isLoading, updateSettings, isUpdating } = useVideoBrandSettings();

  const [formData, setFormData] = useState({
    logo_url: null as string | null,
    watermark_enabled: true,
    disclaimers_en: "",
    disclaimers_es: "",
    default_cta_en: "",
    default_cta_es: "",
    // Contact info
    phone_en: "",
    phone_es: "",
    whatsapp_en: "",
    whatsapp_es: "",
    web_url_en: "",
    web_url_es: "",
    // YouTube
    youtube_footer_en: "",
    youtube_footer_es: "",
    // Accessibility
    captions_enabled_default: true,
    safe_margins_enabled: true,
    transition_style: "fade",
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        logo_url: settings.logo_url,
        watermark_enabled: settings.watermark_enabled ?? true,
        disclaimers_en: settings.disclaimers_en || "",
        disclaimers_es: settings.disclaimers_es || "",
        default_cta_en: settings.default_cta_en || "",
        default_cta_es: settings.default_cta_es || "",
        phone_en: settings.phone_en || "",
        phone_es: settings.phone_es || "",
        whatsapp_en: settings.whatsapp_en || "",
        whatsapp_es: settings.whatsapp_es || "",
        web_url_en: settings.web_url_en || "",
        web_url_es: settings.web_url_es || "",
        youtube_footer_en: settings.youtube_footer_en || "",
        youtube_footer_es: settings.youtube_footer_es || "",
        captions_enabled_default: settings.captions_enabled_default ?? true,
        safe_margins_enabled: settings.safe_margins_enabled ?? true,
        transition_style: settings.transition_style || "fade",
      });
    }
  }, [settings]);

  const handleLogoChange = async (url: string | null) => {
    setFormData(prev => ({ ...prev, logo_url: url }));
    await updateSettings({ logo_url: url });
    toast.success(url ? t("videoHub.logo.updated") : t("videoHub.logo.removed"));
  };

  const handleSave = async () => {
    try {
      await updateSettings(formData);
      toast.success(t("videoHub.settings.saved"));
    } catch (error: any) {
      toast.error(error?.message || t("common.error", "Failed to save settings"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Brand Identity (Locked) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t("videoHub.settings.brandIdentity")}
              </CardTitle>
              <CardDescription>{t("videoHub.settings.brandIdentityDesc")}</CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3 w-3" />
              {t("videoHub.settings.locked")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Logo - Editable */}
            <LogoUploadSection
              currentLogoUrl={formData.logo_url}
              onLogoChange={handleLogoChange}
              isUpdating={isUpdating}
            />

            {/* Colors (Locked display) */}
            <div>
              <Label className="text-muted-foreground">{t("videoHub.settings.colors")}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t("videoHub.settings.colorsLocked")}</p>
              <div className="mt-2 flex gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-md border shadow-sm"
                    style={{ backgroundColor: settings?.primary_color || "#B91C1C" }}
                  />
                  <span className="text-sm">{t("videoHub.settings.iceRed")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-md border shadow-sm"
                    style={{ backgroundColor: settings?.secondary_color || "#1E3A8A" }}
                  />
                  <span className="text-sm">{t("videoHub.settings.trustBlue")}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">{t("videoHub.settings.fontFamily")}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t("videoHub.settings.fontLocked")}</p>
              <div className="mt-2 flex items-center gap-2">
                <Type className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{settings?.font_family || "Inter"}</span>
              </div>
            </div>

            {/* Watermark */}
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("videoHub.settings.watermark")}</Label>
                <p className="text-sm text-muted-foreground">{t("videoHub.settings.watermarkEnabled")}</p>
              </div>
              <Switch
                checked={formData.watermark_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, watermark_enabled: checked })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accessibility & Safety */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Accessibility className="h-5 w-5" />
            {t("videoHub.settings.accessibility")}
          </CardTitle>
          <CardDescription>{t("videoHub.settings.accessibilityDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("videoHub.settings.captionsDefault")}</Label>
              <p className="text-sm text-muted-foreground">{t("videoHub.settings.captionsDefaultDesc")}</p>
            </div>
            <Switch
              checked={formData.captions_enabled_default}
              onCheckedChange={(checked) => setFormData({ ...formData, captions_enabled_default: checked })}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>{t("videoHub.settings.safeMargins")}</Label>
              <p className="text-sm text-muted-foreground">{t("videoHub.settings.safeMarginsDesc")}</p>
            </div>
            <Switch
              checked={formData.safe_margins_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, safe_margins_enabled: checked })}
            />
          </div>

          <Separator />

          <div>
            <Label>{t("videoHub.settings.transitionStyle")}</Label>
            <p className="text-sm text-muted-foreground mb-2">{t("videoHub.settings.transitionStyleDesc")}</p>
            <div className="flex gap-2">
              {["fade", "slide"].map((style) => (
                <Button
                  key={style}
                  variant={formData.transition_style === style ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, transition_style: style })}
                >
                  {t(`videoHub.settings.transitions.${style}`)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default CTAs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("videoHub.settings.defaultCtas")}
          </CardTitle>
          <CardDescription>{t("videoHub.settings.defaultCtasDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{t("videoHub.settings.ctaEn")}</Label>
              <Input
                value={formData.default_cta_en}
                onChange={(e) => setFormData({ ...formData, default_cta_en: e.target.value })}
                className="mt-1"
                placeholder="Get Protected Now"
              />
            </div>
            <div>
              <Label>{t("videoHub.settings.ctaEs")}</Label>
              <Input
                value={formData.default_cta_es}
                onChange={(e) => setFormData({ ...formData, default_cta_es: e.target.value })}
                className="mt-1"
                placeholder="Protégete Ahora"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {t("videoHub.settings.contactInfo")}
          </CardTitle>
          <CardDescription>{t("videoHub.settings.contactInfoDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Phone */}
          <div>
            <Label className="text-base font-medium">{t("videoHub.settings.phoneNumbers")}</Label>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm">{t("videoHub.settings.phoneEn")}</Label>
                <Input
                  value={formData.phone_en}
                  onChange={(e) => setFormData({ ...formData, phone_en: e.target.value })}
                  className="mt-1"
                  placeholder="+34 900 123 456"
                />
              </div>
              <div>
                <Label className="text-sm">{t("videoHub.settings.phoneEs")}</Label>
                <Input
                  value={formData.phone_es}
                  onChange={(e) => setFormData({ ...formData, phone_es: e.target.value })}
                  className="mt-1"
                  placeholder="+34 900 123 456"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* WhatsApp */}
          <div>
            <Label className="text-base font-medium">{t("videoHub.settings.whatsapp")}</Label>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm">{t("videoHub.settings.whatsappEn")}</Label>
                <Input
                  value={formData.whatsapp_en}
                  onChange={(e) => setFormData({ ...formData, whatsapp_en: e.target.value })}
                  className="mt-1"
                  placeholder="+34 600 000 000"
                />
              </div>
              <div>
                <Label className="text-sm">{t("videoHub.settings.whatsappEs")}</Label>
                <Input
                  value={formData.whatsapp_es}
                  onChange={(e) => setFormData({ ...formData, whatsapp_es: e.target.value })}
                  className="mt-1"
                  placeholder="+34 600 000 000"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Web URL */}
          <div>
            <Label className="text-base font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t("videoHub.settings.webUrl")}
            </Label>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm">{t("videoHub.settings.webUrlEn")}</Label>
                <Input
                  value={formData.web_url_en}
                  onChange={(e) => setFormData({ ...formData, web_url_en: e.target.value })}
                  className="mt-1"
                  placeholder="www.icealarm.es"
                />
              </div>
              <div>
                <Label className="text-sm">{t("videoHub.settings.webUrlEs")}</Label>
                <Input
                  value={formData.web_url_es}
                  onChange={(e) => setFormData({ ...formData, web_url_es: e.target.value })}
                  className="mt-1"
                  placeholder="www.icealarm.es"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* YouTube Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5" />
            {t("videoHub.settings.youtubeSettings")}
          </CardTitle>
          <CardDescription>{t("videoHub.settings.youtubeSettingsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{t("videoHub.settings.youtubeFooterEn")}</Label>
              <Textarea
                value={formData.youtube_footer_en}
                onChange={(e) => setFormData({ ...formData, youtube_footer_en: e.target.value })}
                className="mt-1 min-h-[80px]"
                placeholder="ICE Alarm España - 24/7 Emergency Response for Seniors"
              />
            </div>
            <div>
              <Label>{t("videoHub.settings.youtubeFooterEs")}</Label>
              <Textarea
                value={formData.youtube_footer_es}
                onChange={(e) => setFormData({ ...formData, youtube_footer_es: e.target.value })}
                className="mt-1 min-h-[80px]"
                placeholder="ICE Alarm España - Respuesta de Emergencia 24/7 para Mayores"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("videoHub.settings.disclaimers")}
          </CardTitle>
          <CardDescription>{t("videoHub.settings.disclaimersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{t("videoHub.settings.disclaimersEn")}</Label>
              <Textarea
                value={formData.disclaimers_en}
                onChange={(e) => setFormData({ ...formData, disclaimers_en: e.target.value })}
                className="mt-1 min-h-[100px]"
                placeholder="ICE Alarm España is a personal emergency response service..."
              />
            </div>
            <div>
              <Label>{t("videoHub.settings.disclaimersEs")}</Label>
              <Textarea
                value={formData.disclaimers_es}
                onChange={(e) => setFormData({ ...formData, disclaimers_es: e.target.value })}
                className="mt-1 min-h-[100px]"
                placeholder="ICE Alarm España es un servicio de respuesta de emergencia personal..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating} size="lg">
          {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
