import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface NotificationSettingsData {
  id?: string;
  admin_user_id: string;
  whatsapp_paid_sales: boolean;
  whatsapp_partner_signup: boolean;
  whatsapp_hot_sales: boolean;
  whatsapp_shift_alerts: boolean;
  whatsapp_number: string | null;
}

export function NotificationSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<NotificationSettingsData | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["notification-settings", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("admin_user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as NotificationSettingsData | null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    } else if (user?.id && !isLoading) {
      // Initialize with defaults if no settings exist
      setLocalSettings({
        admin_user_id: user.id,
        whatsapp_paid_sales: true,
        whatsapp_partner_signup: true,
        whatsapp_hot_sales: true,
        whatsapp_shift_alerts: true,
        whatsapp_number: null,
      });
    }
  }, [settings, user?.id, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async (data: NotificationSettingsData) => {
      if (data.id) {
        // Update existing
        const { error } = await supabase
          .from("notification_settings")
          .update({
            whatsapp_paid_sales: data.whatsapp_paid_sales,
            whatsapp_partner_signup: data.whatsapp_partner_signup,
            whatsapp_hot_sales: data.whatsapp_hot_sales,
            whatsapp_shift_alerts: data.whatsapp_shift_alerts,
            whatsapp_number: data.whatsapp_number,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("notification_settings")
          .insert({
            admin_user_id: data.admin_user_id,
            whatsapp_paid_sales: data.whatsapp_paid_sales,
            whatsapp_partner_signup: data.whatsapp_partner_signup,
            whatsapp_hot_sales: data.whatsapp_hot_sales,
            whatsapp_shift_alerts: data.whatsapp_shift_alerts,
            whatsapp_number: data.whatsapp_number,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
      toast.success("Notification settings saved");
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const handleToggle = (field: keyof NotificationSettingsData) => {
    if (!localSettings) return;
    const updated = { ...localSettings, [field]: !localSettings[field] };
    setLocalSettings(updated);
    saveMutation.mutate(updated);
  };

  const handleNumberChange = (value: string) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, whatsapp_number: value });
  };

  const handleSaveNumber = () => {
    if (!localSettings) return;
    saveMutation.mutate(localSettings);
  };

  const handleTestWhatsApp = async () => {
    if (!localSettings?.whatsapp_number) {
      toast.error("Please enter a WhatsApp number first");
      return;
    }

    setIsTesting(true);
    try {
      // First save if not saved
      if (!localSettings.id) {
        await saveMutation.mutateAsync(localSettings);
      }

      const { data, error } = await supabase.functions.invoke("notify-admin", {
        body: {
          event_type: "test",
          payload: {},
        },
      });

      if (error) throw error;

      if (data?.results?.some((r: any) => r.status === "sent")) {
        toast.success("Test WhatsApp sent successfully!");
      } else {
        toast.warning("No WhatsApp sent. Check your Twilio configuration.");
      }
    } catch (error: any) {
      toast.error(`Test failed: ${error.message}`);
    } finally {
      setIsTesting(false);
      queryClient.invalidateQueries({ queryKey: ["notification-log"] });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            WhatsApp Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          WhatsApp Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Notify on PAID sales</Label>
            <p className="text-xs text-muted-foreground">Get notified when a sale is completed</p>
          </div>
          <Switch
            checked={localSettings?.whatsapp_paid_sales ?? true}
            onCheckedChange={() => handleToggle("whatsapp_paid_sales")}
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Notify on partner signup</Label>
            <p className="text-xs text-muted-foreground">Get notified when a new partner joins</p>
          </div>
          <Switch
            checked={localSettings?.whatsapp_partner_signup ?? true}
            onCheckedChange={() => handleToggle("whatsapp_partner_signup")}
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Notify on hot sales escalation</Label>
            <p className="text-xs text-muted-foreground">Get notified on urgent sales opportunities</p>
          </div>
          <Switch
            checked={localSettings?.whatsapp_hot_sales ?? true}
            onCheckedChange={() => handleToggle("whatsapp_hot_sales")}
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Shift monitoring alerts</Label>
            <p className="text-xs text-muted-foreground">No-shows, coverage gaps, staff disconnections</p>
          </div>
          <Switch
            checked={localSettings?.whatsapp_shift_alerts ?? true}
            onCheckedChange={() => handleToggle("whatsapp_shift_alerts")}
            disabled={saveMutation.isPending}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Admin WhatsApp Number</Label>
          <p className="text-xs text-muted-foreground">E.164 format (e.g., +34612345678)</p>
          <div className="flex gap-2">
            <Input
              value={localSettings?.whatsapp_number || ""}
              onChange={(e) => handleNumberChange(e.target.value)}
              placeholder="+34612345678"
              className="flex-1"
            />
            <Button 
              variant="outline" 
              onClick={handleSaveNumber}
              disabled={saveMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>

        <Button 
          variant="outline" 
          className="w-full" 
          onClick={handleTestWhatsApp}
          disabled={isTesting || !localSettings?.whatsapp_number}
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Test WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}
