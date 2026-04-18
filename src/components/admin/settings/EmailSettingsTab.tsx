import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mail,
  Check,
  AlertCircle,
  Save,
  Loader2,
  Send,
  Info,
} from "lucide-react";
import { useEmailSettings, type EmailSettingsUpdate } from "@/hooks/useEmailSettings";

export const EmailSettingsTab = React.forwardRef<HTMLDivElement, object>(
  function EmailSettingsTab(_props, ref) {
    const {
      settings,
      isLoading,
      updateSettings,
      isUpdating,
      sendTestEmail,
      isSendingTest,
    } = useEmailSettings();

    // Form state
    const [formState, setFormState] = useState<EmailSettingsUpdate>({
      provider: "resend",
      from_name: "",
      from_email: "",
      reply_to_email: "",
      signature_html: "",
      daily_send_limit: 300,
      hourly_send_limit: 50,
      enable_member_emails: true,
      enable_outreach_emails: true,
      enable_system_emails: true,
      gmail_mode: "smtp",
      gmail_smtp_host: "smtp.gmail.com",
      gmail_smtp_port: 465,
      gmail_smtp_user: "",
    });

    const [testEmail, setTestEmail] = useState("");

    // Sync form state with loaded settings
    useEffect(() => {
      if (settings) {
        setFormState({
          provider: settings.provider || "resend",
          from_name: settings.from_name || "",
          from_email: settings.from_email || "",
          reply_to_email: settings.reply_to_email || "",
          signature_html: settings.signature_html || "",
          daily_send_limit: settings.daily_send_limit,
          hourly_send_limit: settings.hourly_send_limit,
          enable_member_emails: settings.enable_member_emails,
          enable_outreach_emails: settings.enable_outreach_emails,
          enable_system_emails: settings.enable_system_emails,
          gmail_mode: settings.gmail_mode || "smtp",
          gmail_smtp_host: settings.gmail_smtp_host || "smtp.gmail.com",
          gmail_smtp_port: settings.gmail_smtp_port || 465,
          gmail_smtp_user: settings.gmail_smtp_user || "",
        });
      }
    }, [settings]);

    const handleSave = () => {
      updateSettings(formState);
    };

    const isValidEmail = (email: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    const handleSendTest = () => {
      const email = testEmail.trim();
      if (email && isValidEmail(email)) {
        sendTestEmail(email);
      }
    };

    if (isLoading) {
      return (
        <div ref={ref} className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    const isResend = formState.provider === "resend";
    const isGmail = formState.provider === "gmail";

    return (
      <div ref={ref} className="space-y-6">
        {/* Provider Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Provider
            </CardTitle>
            <CardDescription>
              Choose your outbound email service. All emails are logged and tracked regardless of provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={formState.provider}
              onValueChange={(value: 'resend' | 'gmail') => 
                setFormState((prev) => ({ ...prev, provider: value }))
              }
              className="space-y-4"
            >
              {/* Resend Option */}
              <div className={`flex items-start space-x-3 p-4 rounded-lg border ${isResend ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="resend" id="resend" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="resend" className="font-medium cursor-pointer">
                      Resend (API-based)
                    </Label>
                    <Badge className="bg-alert-resolved text-alert-resolved-foreground">
                      <Check className="mr-1 h-3 w-3" />
                      Connected
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Recommended for production. Requires verified domain (icealarm.es).
                  </p>
                </div>
              </div>

              {/* Gmail SMTP Option */}
              <div className={`flex items-start space-x-3 p-4 rounded-lg border ${isGmail ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="gmail" id="gmail" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="gmail" className="font-medium cursor-pointer">
                      Gmail SMTP
                    </Label>
                    {settings?.gmail_smtp_user && (
                      <Badge variant="secondary">
                        {settings.gmail_smtp_user}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use Gmail temporarily until DNS verification for Resend is complete.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {/* Gmail SMTP Configuration */}
            {isGmail && (
              <div className="space-y-4 pt-4 border-t">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Gmail Setup Instructions:</strong>
                    <ol className="list-decimal ml-4 mt-2 space-y-1 text-sm">
                      <li>Enable 2-Step Verification on your Google account</li>
                      <li>Generate an App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary underline">security.google.com</a></li>
                      <li>Enter the 16-character App Password below</li>
                      <li>Add it as <code className="bg-muted px-1 rounded">GMAIL_APP_PASSWORD</code> in project secrets</li>
                    </ol>
                  </AlertDescription>
                </Alert>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>SMTP Host</Label>
                    <Input
                      value={formState.gmail_smtp_host || "smtp.gmail.com"}
                      onChange={(e) => setFormState((prev) => ({ ...prev, gmail_smtp_host: e.target.value }))}
                      placeholder="smtp.gmail.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>SMTP Port</Label>
                    <Input
                      type="number"
                      value={formState.gmail_smtp_port || 465}
                      onChange={(e) => setFormState((prev) => ({ ...prev, gmail_smtp_port: parseInt(e.target.value) || 465 }))}
                      placeholder="465"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use 465 (SSL). Port 587 (STARTTLS) is not supported in this environment.
                    </p>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Gmail Account</Label>
                    <Input
                      type="email"
                      value={formState.gmail_smtp_user || ""}
                      onChange={(e) => setFormState((prev) => ({ ...prev, gmail_smtp_user: e.target.value }))}
                      placeholder="your-account@gmail.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      The Gmail address that will send emails
                    </p>
                  </div>
                </div>

                <Alert variant="destructive" className="bg-amber-500/10 border-amber-500/50 text-amber-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>App Password Required:</strong> Add your Gmail App Password as <code className="bg-muted px-1 rounded">GMAIL_APP_PASSWORD</code> in the project secrets. Never use your regular Gmail password.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Email Configuration</CardTitle>
            <CardDescription>
              Configure sender details and email settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>From Name</Label>
                <Input
                  value={formState.from_name || ""}
                  onChange={(e) => setFormState((prev) => ({ ...prev, from_name: e.target.value }))}
                  placeholder="ICE Alarm España"
                />
                <p className="text-xs text-muted-foreground">
                  The name that appears in the "From" field
                </p>
              </div>

              <div className="space-y-2">
                <Label>From Email</Label>
                <Input
                  type="email"
                  value={formState.from_email || ""}
                  onChange={(e) => setFormState((prev) => ({ ...prev, from_email: e.target.value }))}
                  placeholder={isGmail ? formState.gmail_smtp_user || "your@gmail.com" : "noreply@icealarm.es"}
                />
                <p className="text-xs text-muted-foreground">
                  {isGmail 
                    ? "Should match your Gmail account" 
                    : "Must be a verified domain in Resend"
                  }
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Reply-To Email (optional)</Label>
                <Input
                  type="email"
                  value={formState.reply_to_email || ""}
                  onChange={(e) => setFormState((prev) => ({ ...prev, reply_to_email: e.target.value }))}
                  placeholder="support@icealarm.es"
                />
                <p className="text-xs text-muted-foreground">
                  Where replies should be directed (if different from sender)
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Email Signature (HTML)</Label>
              <Textarea
                value={formState.signature_html || ""}
                onChange={(e) => setFormState((prev) => ({ ...prev, signature_html: e.target.value }))}
                placeholder="<p>Best regards,<br/>ICE Alarm España Team</p>"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                HTML signature appended to all outgoing emails
              </p>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-4">Sending Limits</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Daily Send Limit</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formState.daily_send_limit}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        daily_send_limit: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Max emails per day (0 = unlimited)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Hourly Send Limit</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formState.hourly_send_limit}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        hourly_send_limit: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Max emails per hour (0 = unlimited)
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-4">Email Toggles</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Member Emails</Label>
                    <p className="text-sm text-muted-foreground">
                      Registration, welcome, verification emails
                    </p>
                  </div>
                  <Switch
                    checked={formState.enable_member_emails}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, enable_member_emails: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Outreach Emails</Label>
                    <p className="text-sm text-muted-foreground">
                      AI Outreach campaign emails
                    </p>
                  </div>
                  <Switch
                    checked={formState.enable_outreach_emails}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, enable_outreach_emails: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>System Emails</Label>
                    <p className="text-sm text-muted-foreground">
                      Internal notifications, alerts, reports
                    </p>
                  </div>
                  <Switch
                    checked={formState.enable_system_emails}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({ ...prev, enable_system_emails: checked }))
                    }
                  />
                </div>
              </div>
            </div>

            <Button onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Email Settings
            </Button>
          </CardContent>
        </Card>

        {/* Test Email Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Test Email
            </CardTitle>
            <CardDescription>
              Verify your email configuration by sending a test message via {isGmail ? "Gmail SMTP" : "Resend"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                />
              </div>
              <Button
                onClick={handleSendTest}
                disabled={!testEmail.trim() || isSendingTest}
              >
                {isSendingTest ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Test
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              A test email will be sent using your configured {isGmail ? "Gmail SMTP" : "Resend"} settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
);
