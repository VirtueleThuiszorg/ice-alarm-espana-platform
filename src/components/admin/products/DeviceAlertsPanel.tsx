import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Wifi, WifiOff, User, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, format } from "date-fns";
import { useAlertsRealtime } from "@/hooks/useAlertsRealtime";

interface DeviceAlert {
  id: string;
  device_id: string | null;
  member_id: string | null;
  alert_type: string;
  status: string;
  message: string | null;
  received_at: string | null;
  resolved_at: string | null;
  device?: {
    imei: string;
    sim_phone_number: string;
    offline_since: string | null;
    last_checkin_at: string | null;
  };
  member?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export function DeviceAlertsPanel() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Subscribe to realtime alert updates
  useAlertsRealtime();

  // Fetch open device_offline alerts
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["device-offline-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select(`
          id,
          device_id,
          member_id,
          alert_type,
          status,
          message,
          received_at,
          resolved_at,
          device:devices(imei, sim_phone_number, offline_since, last_checkin_at),
          member:members(first_name, last_name, email)
        `)
        .eq("alert_type", "device_offline")
        .eq("status", "incoming")
        .order("received_at", { ascending: false });

      if (error) throw error;
      return data as unknown as DeviceAlert[];
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Close alert mutation
  const closeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("adminEV07B.alerts.alertClosed"));
      queryClient.invalidateQueries({ queryKey: ["device-offline-alerts"] });
    },
    onError: (error) => {
      toast.error(t("adminEV07B.alerts.failedToClose"));
      console.error("Close alert error:", error);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t("adminEV07B.alerts.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const alertCount = alerts?.length ?? 0;

  return (
    <Card className={alertCount > 0 ? "border-destructive/50" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${alertCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              {t("adminEV07B.alerts.title")}
              {alertCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {alertCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {t("adminEV07B.alerts.description")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {alertCount === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Wifi className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t("adminEV07B.alerts.allOnline")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminEV07B.alerts.device")}</TableHead>
                <TableHead>{t("adminEV07B.alerts.member")}</TableHead>
                <TableHead>{t("adminEV07B.alerts.offlineSince")}</TableHead>
                <TableHead>{t("adminEV07B.alerts.lastCheckin")}</TableHead>
                <TableHead>{t("adminEV07B.alerts.alertCreated")}</TableHead>
                <TableHead className="text-right">{t("adminEV07B.alerts.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts?.map((alert) => {
                const device = alert.device as DeviceAlert["device"];
                const member = alert.member as DeviceAlert["member"];

                return (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <WifiOff className="h-4 w-4 text-destructive" />
                        <div>
                          <p className="font-mono text-sm">{device?.imei || t("adminEV07B.alerts.unknown")}</p>
                          <p className="text-xs text-muted-foreground">{device?.sim_phone_number}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {member ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm">{member.first_name} {member.last_name}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t("adminEV07B.alerts.unassigned")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {device?.offline_since ? (
                        <div className="flex items-center gap-1 text-destructive">
                          <Clock className="h-3 w-3" />
                          <span className="text-sm">
                            {formatDistanceToNow(new Date(device.offline_since), { addSuffix: true })}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {device?.last_checkin_at ? (
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(device.last_checkin_at), "dd MMM, HH:mm")}
                        </span>
                      ) : (
                        t("adminEV07B.alerts.never")
                      )}
                    </TableCell>
                    <TableCell>
                      {alert.received_at ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(alert.received_at), { addSuffix: true })}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => closeAlertMutation.mutate(alert.id)}
                        disabled={closeAlertMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        {t("adminEV07B.alerts.close")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
