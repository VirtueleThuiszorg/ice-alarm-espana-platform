import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Phone,
  Check,
  Eye,
  EyeOff,
  Save,
  Loader2,
  AlertCircle,
  FlaskConical,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { VoiceSettingsSection } from "./VoiceSettingsSection";

interface PhoneSmsSectionProps {
  twilioKeys: {
    account_sid: string;
    phone_number: string;
    whatsapp_number: string;
  };
  setTwilioKeys: React.Dispatch<React.SetStateAction<{
    account_sid: string;
    phone_number: string;
    whatsapp_number: string;
  }>>;
  twilioAuthTokenInput: string;
  setTwilioAuthTokenInput: React.Dispatch<React.SetStateAction<string>>;
  twilioAuthTokenStored: boolean;
  showTwilioToken: boolean;
  setShowTwilioToken: React.Dispatch<React.SetStateAction<boolean>>;
  twilioTestStatus: "idle" | "testing" | "success" | "error";
  twilioTestMessage: string;
  handleSaveTwilio: () => void;
  handleTestTwilio: () => Promise<void>;
  isSaving: boolean;
  isConfigured: boolean;
}

export function PhoneSmsSection({
  twilioKeys,
  setTwilioKeys,
  twilioAuthTokenInput,
  setTwilioAuthTokenInput,
  twilioAuthTokenStored,
  showTwilioToken,
  setShowTwilioToken,
  twilioTestStatus,
  twilioTestMessage,
  handleSaveTwilio,
  handleTestTwilio,
  isSaving,
  isConfigured,
}: PhoneSmsSectionProps) {
  const [webhooksOpen, setWebhooksOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Twilio Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Twilio Credentials
            {isConfigured ? (
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
            Voice calls and SMS messaging. Get credentials from the{" "}
            <a
              href="https://console.twilio.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Twilio Console
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Account SID</Label>
              <Input
                value={twilioKeys.account_sid}
                onChange={(e) => setTwilioKeys((prev) => ({ ...prev, account_sid: e.target.value }))}
                placeholder="AC..."
              />
              <p className="text-xs text-muted-foreground">Found in Twilio Console dashboard</p>
            </div>

            <div className="space-y-2">
              <Label>Auth Token</Label>
              {twilioAuthTokenStored && !twilioAuthTokenInput && (
                <p className="text-xs text-alert-resolved flex items-center gap-1">
                  <Check className="h-3 w-3" /> Stored (hidden)
                </p>
              )}
              {!twilioAuthTokenStored && !twilioAuthTokenInput && (
                <p className="text-xs text-muted-foreground">Not set</p>
              )}
              <div className="relative">
                <Input
                  type={showTwilioToken ? "text" : "password"}
                  value={twilioAuthTokenInput}
                  onChange={(e) => setTwilioAuthTokenInput(e.target.value)}
                  placeholder={twilioAuthTokenStored ? "Paste new token to replace" : "Enter auth token"}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 z-10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowTwilioToken((prev) => !prev)}
                >
                  {showTwilioToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Click "Show" next to Auth Token in Twilio Console
              </p>
            </div>

            <div className="space-y-2">
              <Label>Phone Number (Voice/SMS)</Label>
              <Input
                value={twilioKeys.phone_number}
                onChange={(e) => setTwilioKeys((prev) => ({ ...prev, phone_number: e.target.value }))}
                placeholder="+34..."
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={handleSaveTwilio} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Credentials
            </Button>

            <Button variant="outline" onClick={handleTestTwilio} disabled={twilioTestStatus === "testing"}>
              {twilioTestStatus === "testing" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
          </div>

          {twilioTestStatus !== "idle" && twilioTestStatus !== "testing" && (
            <div
              className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                twilioTestStatus === "success"
                  ? "bg-alert-resolved/10 text-alert-resolved"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {twilioTestStatus === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{twilioTestMessage}</span>
            </div>
          )}

          <Separator className="my-4" />

          {/* Collapsible Webhook URLs */}
          <Collapsible open={webhooksOpen} onOpenChange={setWebhooksOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <span className="font-medium text-sm">Webhook URLs</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${webhooksOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Voice (incoming calls):</p>
                    <code className="block p-2 bg-background rounded border text-xs break-all">
                      {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-voice?action=incoming`}
                    </code>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">SMS (incoming):</p>
                    <code className="block p-2 bg-background rounded border text-xs break-all">
                      {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-sms?action=incoming`}
                    </code>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Voice Settings */}
      <VoiceSettingsSection />
    </div>
  );
}
