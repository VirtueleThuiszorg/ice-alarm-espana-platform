import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Package, Users, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeviceRealtime } from "@/hooks/useDeviceRealtime";

interface EV07BStats {
  total: number;
  in_stock: number;
  allocated: number;
  with_staff: number;
  live: number;
  offline: number;
  open_alerts: number;
}

export function EV07BStatusWidget() {
  const { t } = useTranslation();
  // Subscribe to realtime device updates
  useDeviceRealtime();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["ev07b-status-summary"],
    queryFn: async () => {
      // Get all EV-07B devices
      const { data: devices, error: devicesError } = await supabase
        .from("devices")
        .select("id, status, is_online")
        .eq("model", "EV-07B");

      if (devicesError) throw devicesError;

      // Get open device_offline alerts
      const { count: alertCount } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("alert_type", "device_offline")
        .eq("status", "incoming");

      const total = devices?.length || 0;
      const in_stock = devices?.filter(d => d.status === "in_stock").length || 0;
      const allocated = devices?.filter(d => d.status === "allocated").length || 0;
      const with_staff = devices?.filter(d => d.status === "with_staff").length || 0;
      const live = devices?.filter(d => d.status === "live").length || 0;

      // Offline = devices that should be online but aren't (using 2-minute threshold)
      // Note: is_online is set by the offline monitor running every minute
      const monitoredStatuses = ["allocated", "with_staff", "live"];
      const offline = devices?.filter(
        d => monitoredStatuses.includes(d.status || "") && d.is_online === false
      ).length || 0;

      return {
        total,
        in_stock,
        allocated,
        with_staff,
        live,
        offline,
        open_alerts: alertCount || 0,
      } as EV07BStats;
    },
    refetchInterval: 30000, // Refresh every 30s as fallback
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {t("adminEV07B.widget.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              {t("adminEV07B.widget.title")}
            </CardTitle>
            <CardDescription>{t("adminEV07B.widget.subtitle")}</CardDescription>
          </div>
          <Badge variant="outline" className="text-lg font-bold">
            {stats?.total || 0} {t("adminEV07B.widget.total")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* In Stock */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Package className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xl font-bold">{stats?.in_stock || 0}</p>
              <p className="text-xs text-muted-foreground">{t("adminEV07B.widget.inStock")}</p>
            </div>
          </div>

          {/* Allocated */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10">
            <Users className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xl font-bold">{stats?.allocated || 0}</p>
              <p className="text-xs text-muted-foreground">{t("adminEV07B.widget.allocated")}</p>
            </div>
          </div>

          {/* Live */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10">
            <Wifi className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xl font-bold">{stats?.live || 0}</p>
              <p className="text-xs text-muted-foreground">{t("adminEV07B.widget.live")}</p>
            </div>
          </div>

          {/* With Staff */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10">
            <Users className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-xl font-bold">{stats?.with_staff || 0}</p>
              <p className="text-xs text-muted-foreground">{t("adminEV07B.widget.withStaff")}</p>
            </div>
          </div>

          {/* Offline */}
          <div className={`flex items-center gap-2 p-3 rounded-lg ${(stats?.offline || 0) > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
            <WifiOff className={`h-4 w-4 ${(stats?.offline || 0) > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <div>
              <p className={`text-xl font-bold ${(stats?.offline || 0) > 0 ? "text-destructive" : ""}`}>
                {stats?.offline || 0}
              </p>
              <p className="text-xs text-muted-foreground">{t("adminEV07B.widget.offline")}</p>
            </div>
          </div>

          {/* Open Alerts */}
          <div className={`flex items-center gap-2 p-3 rounded-lg ${(stats?.open_alerts || 0) > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
            <AlertTriangle className={`h-4 w-4 ${(stats?.open_alerts || 0) > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <div>
              <p className={`text-xl font-bold ${(stats?.open_alerts || 0) > 0 ? "text-destructive" : ""}`}>
                {stats?.open_alerts || 0}
              </p>
              <p className="text-xs text-muted-foreground">{t("adminEV07B.widget.alerts")}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
