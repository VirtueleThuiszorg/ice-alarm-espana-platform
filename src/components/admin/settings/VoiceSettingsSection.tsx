import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Voice setting keys (exact match to twilio-voice edge function)
const VOICE_KEYS = [
  "voice_greeting_es",
  "voice_greeting_en",
  "voice_recording_notice_es",
  "voice_recording_notice_en",
  "voice_hold_es",
  "voice_hold_en",
  "voice_error_es",
  "voice_error_en",
] as const;

type VoiceKey = (typeof VOICE_KEYS)[number];

interface VoiceSettings {
  voice_greeting_es: string;
  voice_greeting_en: string;
  voice_recording_notice_es: string;
  voice_recording_notice_en: string;
  voice_hold_es: string;
  voice_hold_en: string;
  voice_error_es: string;
  voice_error_en: string;
}

const PLACEHOLDERS: VoiceSettings = {
  voice_greeting_es: "Gracias por llamar a ICE Alarm España. Soy Isabel, su asistente virtual.",
  voice_greeting_en: "Thank you for calling ICE Alarm Spain. I'm Isabel, your virtual assistant.",
  voice_recording_notice_es: "Esta llamada puede ser grabada para mejorar el servicio.",
  voice_recording_notice_en: "This call may be recorded to improve our service.",
  voice_hold_es: "Por favor, permanezca en la línea. Le conectamos en breve.",
  voice_hold_en: "Please stay on the line. We are connecting you now.",
  voice_error_es: "Lo sentimos, ha ocurrido un error. Por favor, intente de nuevo más tarde.",
  voice_error_en: "We're sorry, an error occurred. Please try again later.",
};

export function VoiceSettingsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState<VoiceSettings>({
    voice_greeting_es: "",
    voice_greeting_en: "",
    voice_recording_notice_es: "",
    voice_recording_notice_en: "",
    voice_hold_es: "",
    voice_hold_en: "",
    voice_error_es: "",
    voice_error_en: "",
  });

  // Fetch voice settings from system_settings
  const { data: voiceData, isLoading } = useQuery({
    queryKey: ["voice-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", VOICE_KEYS);
      
      if (error) throw error;
      return data || [];
    },
    refetchOnWindowFocus: false,
  });

  // Populate state from fetched data
  useEffect(() => {
    if (!voiceData) return;

    const settingsMap = voiceData.reduce((acc, item) => {
      acc[item.key as VoiceKey] = item.value || "";
      return acc;
    }, {} as Record<VoiceKey, string>);

    setSettings({
      voice_greeting_es: settingsMap.voice_greeting_es || "",
      voice_greeting_en: settingsMap.voice_greeting_en || "",
      voice_recording_notice_es: settingsMap.voice_recording_notice_es || "",
      voice_recording_notice_en: settingsMap.voice_recording_notice_en || "",
      voice_hold_es: settingsMap.voice_hold_es || "",
      voice_hold_en: settingsMap.voice_hold_en || "",
      voice_error_es: settingsMap.voice_error_es || "",
      voice_error_en: settingsMap.voice_error_en || "",
    });
  }, [voiceData]);

  // Save mutation using UPSERT
  const saveMutation = useMutation({
    mutationFn: async (updates: VoiceSettings) => {
      // Build upsert array for all 8 keys
      const upsertData = VOICE_KEYS.map((key) => ({
        key,
        value: updates[key] || "",
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("system_settings")
        .upsert(upsertData, { onConflict: "key" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voice-settings"] });
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast({
        title: "Voice settings saved",
        description: "Changes apply immediately to incoming calls.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving voice settings",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const updateSetting = (key: VoiceKey, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <Card>
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
          <Mic className="h-5 w-5" />
          Voice Settings
        </CardTitle>
        <CardDescription>
          Configure voice prompts for the AI phone system. Changes apply immediately without redeploy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Call Greeting */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Call Greeting
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voice_greeting_es">Greeting (Spanish)</Label>
              <Textarea
                id="voice_greeting_es"
                rows={4}
                value={settings.voice_greeting_es}
                onChange={(e) => updateSetting("voice_greeting_es", e.target.value)}
                placeholder={PLACEHOLDERS.voice_greeting_es}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice_greeting_en">Greeting (English)</Label>
              <Textarea
                id="voice_greeting_en"
                rows={4}
                value={settings.voice_greeting_en}
                onChange={(e) => updateSetting("voice_greeting_en", e.target.value)}
                placeholder={PLACEHOLDERS.voice_greeting_en}
              />
            </div>
          </div>
        </div>

        {/* Recording / GDPR Notice */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Recording / GDPR Notice
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voice_recording_notice_es">Recording Notice (Spanish)</Label>
              <Textarea
                id="voice_recording_notice_es"
                rows={4}
                value={settings.voice_recording_notice_es}
                onChange={(e) => updateSetting("voice_recording_notice_es", e.target.value)}
                placeholder={PLACEHOLDERS.voice_recording_notice_es}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice_recording_notice_en">Recording Notice (English)</Label>
              <Textarea
                id="voice_recording_notice_en"
                rows={4}
                value={settings.voice_recording_notice_en}
                onChange={(e) => updateSetting("voice_recording_notice_en", e.target.value)}
                placeholder={PLACEHOLDERS.voice_recording_notice_en}
              />
            </div>
          </div>
        </div>

        {/* Hold / Processing Message */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Hold / Processing Message
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voice_hold_es">Hold Message (Spanish)</Label>
              <Textarea
                id="voice_hold_es"
                rows={4}
                value={settings.voice_hold_es}
                onChange={(e) => updateSetting("voice_hold_es", e.target.value)}
                placeholder={PLACEHOLDERS.voice_hold_es}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice_hold_en">Hold Message (English)</Label>
              <Textarea
                id="voice_hold_en"
                rows={4}
                value={settings.voice_hold_en}
                onChange={(e) => updateSetting("voice_hold_en", e.target.value)}
                placeholder={PLACEHOLDERS.voice_hold_en}
              />
            </div>
          </div>
        </div>

        {/* Error / Fallback Message */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Error / Fallback Message
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voice_error_es">Error Message (Spanish)</Label>
              <Textarea
                id="voice_error_es"
                rows={4}
                value={settings.voice_error_es}
                onChange={(e) => updateSetting("voice_error_es", e.target.value)}
                placeholder={PLACEHOLDERS.voice_error_es}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice_error_en">Error Message (English)</Label>
              <Textarea
                id="voice_error_en"
                rows={4}
                value={settings.voice_error_en}
                onChange={(e) => updateSetting("voice_error_en", e.target.value)}
                placeholder={PLACEHOLDERS.voice_error_en}
              />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Voice Settings
        </Button>
      </CardContent>
    </Card>
  );
}
