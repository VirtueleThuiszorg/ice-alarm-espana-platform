import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Wifi,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  Key,
  
  Smartphone,
  BookOpen,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEVICE_KEYS = {
  GPS_GATEWAY_URL: "settings_gps_gateway_url",
  GPS_GATEWAY_API_KEY: "settings_gps_gateway_api_key",
  GPS_GATEWAY_PORT: "settings_gps_gateway_port",
  DEFAULT_APN: "settings_default_apn",
  DEFAULT_SERVER_IP_PORT: "settings_default_server_ip_port",
  DEFAULT_SOS_NUMBER: "settings_default_sos_number",
  DEFAULT_REPORTING_MODE: "settings_default_reporting_mode",
  EV07B_CHECKIN_KEY: "settings_ev07b_checkin_key",
} as const;

interface DevicesSettingsTabProps {
  isSaving: boolean;
}

export function DevicesSettingsTab({ isSaving }: DevicesSettingsTabProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showCheckinKey, setShowCheckinKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", Object.values(DEVICE_KEYS));

      if (error) throw error;

      const map: Record<string, string> = {};
      data?.forEach((s) => {
        map[s.key] = s.value;
      });
      setSettings(map);
    } catch (error) {
      console.error("Error loading device settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSavingLocal(true);
    try {
      const upserts = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
      }));

      for (const item of upserts) {
        const { error } = await supabase
          .from("system_settings")
          .upsert(item, { onConflict: "key" });
        if (error) throw error;
      }

      toast.success(t("adminSettings.devicesSaved", "Device settings saved"));
    } catch (error) {
      console.error("Error saving device settings:", error);
      toast.error(t("adminSettings.saveFailed", "Failed to save settings"));
    } finally {
      setIsSavingLocal(false);
    }
  };

  const handleTestConnection = async () => {
    const url = settings[DEVICE_KEYS.GPS_GATEWAY_URL];
    if (!url) {
      toast.error(t("adminSettings.enterGatewayUrl", "Enter a gateway URL first"));
      return;
    }

    setTestStatus("testing");
    setTestMessage("");

    try {
      const cleanUrl = url.replace(/\/+$/, "");
      const res = await fetch(`${cleanUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setTestStatus("success");
      setTestMessage(
        t("adminSettings.gatewayConnected", "Connected — {{count}} device(s) online", {
          count: data.connectedDevices ?? 0,
        })
      );
    } catch (error: any) {
      setTestStatus("error");
      setTestMessage(error.message || "Connection failed");
    }
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const checkinEndpoint = `${supabaseUrl}/functions/v1/ev07b-checkin`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("common.copied", "Copied to clipboard"));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: GPS Gateway Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            {t("adminSettings.gpsGateway", "GPS Gateway Connection")}
          </CardTitle>
          <CardDescription>
            {t("adminSettings.gpsGatewayDesc", "Configure the TCP bridge server that receives data from EV-07B pendants")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("adminSettings.gatewayUrl", "Gateway URL")}</Label>
              <Input
                value={settings[DEVICE_KEYS.GPS_GATEWAY_URL] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.GPS_GATEWAY_URL, e.target.value)}
                placeholder="https://gps-gateway.yourserver.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminSettings.gatewayPort", "Gateway Port")}</Label>
              <Input
                value={settings[DEVICE_KEYS.GPS_GATEWAY_PORT] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.GPS_GATEWAY_PORT, e.target.value)}
                placeholder="5001"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("adminSettings.gatewayApiKey", "API Key")}</Label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? "text" : "password"}
                value={settings[DEVICE_KEYS.GPS_GATEWAY_API_KEY] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.GPS_GATEWAY_API_KEY, e.target.value)}
                placeholder="Gateway API key"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testStatus === "testing"}
            >
              {testStatus === "testing" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="mr-2 h-4 w-4" />
              )}
              {t("adminSettings.testConnection", "Test Connection")}
            </Button>
            {testStatus === "success" && (
              <Badge className="bg-green-600 gap-1">
                <CheckCircle className="h-3 w-3" />
                {testMessage}
              </Badge>
            )}
            {testStatus === "error" && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                {testMessage}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: EV-07B Check-in Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t("adminSettings.checkinEndpoint", "EV-07B Check-in Endpoint")}
          </CardTitle>
          <CardDescription>
            {t("adminSettings.checkinEndpointDesc", "The GPS gateway forwards device data to this Supabase edge function")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("adminSettings.endpointUrl", "Endpoint URL")}</Label>
            <div className="flex gap-2">
              <Input
                value={checkinEndpoint}
                readOnly
                className="font-mono text-xs bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(checkinEndpoint)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("adminSettings.checkinApiKey", "API Key")}</Label>
            <div className="flex gap-2">
              <Input
                type={showCheckinKey ? "text" : "password"}
                value={settings[DEVICE_KEYS.EV07B_CHECKIN_KEY] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.EV07B_CHECKIN_KEY, e.target.value)}
                placeholder="Must match EV07B_CHECKIN_KEY in Supabase secrets"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowCheckinKey(!showCheckinKey)}
              >
                {showCheckinKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("adminSettings.checkinKeyNote", "This must match the EV07B_CHECKIN_KEY secret configured in your Supabase project")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Default Provisioning Values */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {t("adminSettings.provisioningDefaults", "Default Provisioning Values")}
          </CardTitle>
          <CardDescription>
            {t("adminSettings.provisioningDefaultsDesc", "These values pre-fill the Quick Provision and SMS Command panels")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("adminSettings.defaultApn", "APN Name")}</Label>
              <Input
                value={settings[DEVICE_KEYS.DEFAULT_APN] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.DEFAULT_APN, e.target.value)}
                placeholder="e.g. internet"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminSettings.defaultServerIpPort", "Server IP:Port")}</Label>
              <Input
                value={settings[DEVICE_KEYS.DEFAULT_SERVER_IP_PORT] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.DEFAULT_SERVER_IP_PORT, e.target.value)}
                placeholder="e.g. 203.0.113.10,5001"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminSettings.defaultSosNumber", "SOS Number")}</Label>
              <Input
                value={settings[DEVICE_KEYS.DEFAULT_SOS_NUMBER] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.DEFAULT_SOS_NUMBER, e.target.value)}
                placeholder="+34612345678"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminSettings.defaultReportingMode", "Reporting Mode")}</Label>
              <Input
                value={settings[DEVICE_KEYS.DEFAULT_REPORTING_MODE] || ""}
                onChange={(e) => updateSetting(DEVICE_KEYS.DEFAULT_REPORTING_MODE, e.target.value)}
                placeholder="e.g. 1,300 (time mode, 5min)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Deployment Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t("adminSettings.deploymentGuide", "Deployment Guide")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="guide">
              <AccordionTrigger className="text-sm">
                {t("adminSettings.gpsGatewaySetup", "GPS Gateway Setup Instructions")}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-1">1. Deploy the GPS Gateway Server</h4>
                    <p className="text-muted-foreground">
                      The GPS gateway is a standalone Node.js server in <code className="text-xs bg-muted px-1 rounded">gps-gateway/</code>.
                      Deploy it on any VPS or cloud provider with a public IP.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">2. Configure Environment Variables</h4>
                    <pre className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto">
{`SUPABASE_URL=https://your-project.supabase.co
EV07B_CHECKIN_KEY=your-secret-key
GATEWAY_PORT=5001
HTTP_PORT=3000`}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">3. Open Firewall Ports</h4>
                    <p className="text-muted-foreground">
                      Open TCP port 5001 (or your configured port) for device connections,
                      and port 3000 for the health check HTTP API.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">4. Configure Devices</h4>
                    <p className="text-muted-foreground">
                      Use the SMS Command Panel to set each device's IP:Port to your gateway server.
                      The Quick Provision button can configure all settings at once.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">5. Verify Connection</h4>
                    <p className="text-muted-foreground">
                      Use the "Test Connection" button above to verify the gateway is running.
                      Devices should appear online within their reporting interval.
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSavingLocal || isSaving}>
          {isSavingLocal ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t("adminSettings.saveDeviceSettings", "Save Device Settings")}
        </Button>
      </div>
    </div>
  );
}
