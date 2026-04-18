import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  WifiOff, 
  User, 
  Phone,
  Clock,
  ArrowRight,
  Check,
  Eye,
  CheckCircle
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";

interface DeviceOfflineAlert {
  id: string;
  device_id: string | null;
  member_id: string;
  alert_type: string;
  status: string;
  message: string | null;
  received_at: string | null;
  device?: {
    imei: string;
    sim_phone_number: string;
    offline_since: string | null;
    last_checkin_at: string | null;
  } | null;
  member?: {
    first_name: string;
    last_name: string;
    phone: string;
  } | null;
}

export function DeviceOfflineAlertsCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Subscribe to realtime alert updates
  useEffect(() => {
    const channel = supabase
      .channel("staff-device-offline-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-device-offline-alerts"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["staff-device-offline-alerts"],
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
          device:devices(imei, sim_phone_number, offline_since, last_checkin_at),
          member:members(first_name, last_name, phone)
        `)
        .eq("alert_type", "device_offline")
        .in("status", ["incoming", "in_progress"])
        .order("received_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as unknown as DeviceOfflineAlert[];
    },
    refetchInterval: 30000,
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
      toast.success(t("callCentre.offlineAlerts.alertClosed", "Alert closed"));
      queryClient.invalidateQueries({ queryKey: ["staff-device-offline-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["staff-ev07b-stats"] });
    },
    onError: (error) => {
      toast.error(t("callCentre.offlineAlerts.failedToClose", "Failed to close alert"));
      console.error("Close alert error:", error);
    },
  });

  if (isLoading) {
    return (
      <Card className="shadow-sm bg-background/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <WifiOff className="h-5 w-5" />
            {t("callCentre.offlineAlerts.title", "Device Offline Alerts")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const alertCount = alerts?.length || 0;
  const hasAlerts = alertCount > 0;

  const getPriorityBadge = (alert: DeviceOfflineAlert) => {
    if (!alert.received_at) return null;
    const minutesSinceAlert = differenceInMinutes(new Date(), new Date(alert.received_at));
    
    if (minutesSinceAlert > 30) {
      return <Badge variant="destructive">{t("callCentre.offlineAlerts.critical", "Critical")}</Badge>;
    } else if (minutesSinceAlert > 10) {
      return <Badge className="bg-orange-500">{t("callCentre.offlineAlerts.high", "High")}</Badge>;
    }
    return <Badge variant="secondary">{t("callCentre.offlineAlerts.normal", "Normal")}</Badge>;
  };

  return (
    <Card className={cn(
      "shadow-sm bg-background/80",
      hasAlerts && "border-destructive/50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <WifiOff className={cn(
                "h-5 w-5",
                hasAlerts ? "text-destructive" : "text-muted-foreground"
              )} />
              {t("callCentre.offlineAlerts.title", "Device Offline Alerts")}
              {hasAlerts && (
                <Badge variant="destructive" className="ml-1">
                  {alertCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="truncate">{t("callCentre.offlineAlerts.subtitle", "EV-07B devices that have gone offline")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/ev07b">
              {t("callCentre.offlineAlerts.viewAll", "View All")} <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasAlerts ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>{t("callCentre.offlineAlerts.noAlerts", "No offline alerts")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts?.map((alert) => {
              const device = alert.device;
              const member = alert.member;
              
              return (
                <div 
                  key={alert.id} 
                  className="p-3 border rounded-lg border-destructive/30 bg-destructive/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <WifiOff className="h-4 w-4 text-destructive mt-1 shrink-0" />
                      <div className="min-w-0">
                        {member ? (
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">
                              {member.first_name} {member.last_name}
                            </p>
                            <a 
                              href={`tel:${member.phone}`}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3 w-3" />
                            </a>
                          </div>
                        ) : (
                          <p className="font-medium text-muted-foreground">{t("callCentre.offlineAlerts.unassigned", "Unassigned Device")}</p>
                        )}
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          IMEI: {device?.imei || "Unknown"}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {device?.offline_since && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Offline {formatDistanceToNow(new Date(device.offline_since), { addSuffix: false })}
                            </span>
                          )}
                          {device?.last_checkin_at && (
                            <span>
                              Last: {formatDistanceToNow(new Date(device.last_checkin_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getPriorityBadge(alert)}
                      <div className="flex gap-1 mt-1">
                        {member && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(`/call-centre/members/${alert.member_id}`)}
                            title="Open Member"
                          >
                            <User className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {device && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(`/admin/devices/${alert.device_id}`)}
                            title="View Device"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600 hover:text-green-700"
                          onClick={() => closeAlertMutation.mutate(alert.id)}
                          disabled={closeAlertMutation.isPending}
                          title="Close Alert"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
