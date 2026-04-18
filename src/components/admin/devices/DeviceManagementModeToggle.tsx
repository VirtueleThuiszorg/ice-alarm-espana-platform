import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wifi, Terminal } from "lucide-react";
import { toast } from "sonner";

interface DeviceManagementModeToggleProps {
  deviceId: string;
  currentMode: string | null;
}

export function DeviceManagementModeToggle({ deviceId, currentMode }: DeviceManagementModeToggleProps) {
  const queryClient = useQueryClient();
  const isApiMode = currentMode === "api";

  const toggleMode = useMutation({
    mutationFn: async () => {
      const newMode = isApiMode ? "manual" : "api";
      const { error } = await supabase
        .from("devices")
        .update({ management_mode: newMode } as any)
        .eq("id", deviceId);

      if (error) throw error;
      return newMode;
    },
    onSuccess: (newMode) => {
      queryClient.invalidateQueries({ queryKey: ["admin-device-detail", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["device-stock"] });
      toast.success(`Switched to ${newMode === "api" ? "API" : "Manual"} mode`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to switch mode: ${error.message}`);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Device Management Mode</CardTitle>
        <CardDescription>
          Choose how this device is configured and monitored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal className={`h-4 w-4 ${!isApiMode ? "text-primary" : "text-muted-foreground"}`} />
              <Label
                htmlFor="management-mode"
                className={`text-sm ${!isApiMode ? "font-medium" : "text-muted-foreground"}`}
              >
                Manual (SMS)
              </Label>
            </div>

            <Switch
              id="management-mode"
              checked={isApiMode}
              onCheckedChange={() => toggleMode.mutate()}
              disabled={toggleMode.isPending}
            />

            <div className="flex items-center gap-2">
              <Wifi className={`h-4 w-4 ${isApiMode ? "text-primary" : "text-muted-foreground"}`} />
              <Label
                htmlFor="management-mode"
                className={`text-sm ${isApiMode ? "font-medium" : "text-muted-foreground"}`}
              >
                API
              </Label>
            </div>
          </div>

          <Badge variant={isApiMode ? "default" : "secondary"}>
            {isApiMode ? "API Mode" : "Manual Mode"}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          {isApiMode
            ? "Device communicates via the external EV-07B Check-in API. Configuration is managed automatically."
            : "Device is configured manually via SMS commands. Use the provisioning checklist and SMS command panel below."}
        </p>
      </CardContent>
    </Card>
  );
}
