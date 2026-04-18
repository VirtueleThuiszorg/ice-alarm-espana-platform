import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  MessageCircle,
  Check,
  Save,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

interface WhatsAppSectionProps {
  whatsappNumber: string;
  setWhatsappNumber: (value: string) => void;
  handleSave: () => void;
  isSaving: boolean;
  isConfigured: boolean;
}

export function WhatsAppSection({
  whatsappNumber,
  setWhatsappNumber,
  handleSave,
  isSaving,
  isConfigured,
}: WhatsAppSectionProps) {
  const [webhooksOpen, setWebhooksOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            WhatsApp Business
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
            WhatsApp Business messaging via Twilio. Configure your WhatsApp-enabled number for member communications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>WhatsApp Number</Label>
            <Input
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+34..."
            />
            <p className="text-xs text-muted-foreground">
              The phone number registered with WhatsApp Business via Twilio
            </p>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save WhatsApp Number
          </Button>

          {/* Collapsible Webhook URL */}
          <Collapsible open={webhooksOpen} onOpenChange={setWebhooksOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent mt-4">
                <span className="font-medium text-sm">Webhook Configuration</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${webhooksOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">WhatsApp (incoming):</p>
                  <code className="block p-2 bg-background rounded border text-xs break-all">
                    {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-whatsapp?action=incoming`}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add this URL to your Twilio WhatsApp Sandbox or production number configuration.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}
