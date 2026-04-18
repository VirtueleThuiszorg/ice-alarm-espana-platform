import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Key, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function DeviceApiKeyConfig() {
  const { t } = useTranslation();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate a sample key for display/testing purposes
  const sampleKey = "ev07b_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t("adminEV07B.apiConfig.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const copyEndpointUrl = async () => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ev07b-checkin`;
    await navigator.clipboard.writeText(url);
    toast.success(t("adminEV07B.apiConfig.endpointCopied"));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("adminEV07B.apiConfig.title")}
            </CardTitle>
            <CardDescription>
              {t("adminEV07B.apiConfig.description")}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
            {t("adminEV07B.apiConfig.setupRequired")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 space-y-3">
          <h4 className="font-medium text-sm">{t("adminEV07B.apiConfig.setupInstructions")}</h4>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>{t("adminEV07B.apiConfig.step1")}</li>
            <li>{t("adminEV07B.apiConfig.step2")}</li>
            <li>{t("adminEV07B.apiConfig.step3")} <code className="bg-background px-1 rounded">{t("adminEV07B.apiConfig.step3Secret")}</code></li>
            <li>{t("adminEV07B.apiConfig.step4")}</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label>{t("adminEV07B.apiConfig.sampleKey")}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                readOnly
                type={showKey ? "text" : "password"}
                value={sampleKey}
                className="font-mono pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(sampleKey)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("adminEV07B.apiConfig.endpoint")}</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ev07b-checkin`}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="icon" onClick={copyEndpointUrl}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <h4 className="font-medium text-sm">{t("adminEV07B.apiConfig.exampleRequest")}</h4>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {`curl -X POST \\
  ${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ev07b-checkin \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"imei": "123456789012345", "battery_level": 85}'`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
