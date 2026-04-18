import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Smartphone, 
  Package, 
  Users, 
  Wifi, 
  WifiOff, 
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface EV07BStats {
  total: number;
  in_stock: number;
  allocated: number;
  with_staff: number;
  live: number;
  online: number;
  offline: number;
  open_alerts: number;
}

export function EV07BLiveStatusCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Subscribe to realtime device updates
  useEffect(() => {
    const devicesChannel = supabase
      .channel("staff-ev07b-devices")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-ev07b-stats"] });
        }
      )
      .subscribe();

    const alertsChannel = supabase
      .channel("staff-ev07b-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-ev07b-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(devicesChannel);
      supabase.removeChannel(alertsChannel);
    };
  }, [queryClient]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["staff-ev07b-stats"],
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
      
      // Monitored devices = allocated, with_staff, or live
      const monitoredStatuses = ["allocated", "with_staff", "live"];
      const monitoredDevices = devices?.filter(d => monitoredStatuses.includes(d.status || "")) || [];
      const online = monitoredDevices.filter(d => d.is_online === true).length;
      const offline = monitoredDevices.filter(d => d.is_online === false).length;

      return {
        total,
        in_stock,
        allocated,
        with_staff,
        live,
        online,
        offline,
        open_alerts: alertCount || 0,
      } as EV07BStats;
    },
    refetchInterval: 30000, // Fallback refresh
  });

  if (isLoading) {
    return (
      <Card className="shadow-sm bg-background/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {t("callCentre.ev07b.title", "EV-07B Live Status")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasIssues = (stats?.offline || 0) > 0 || (stats?.open_alerts || 0) > 0;

  const StatBox = ({ 
    icon: Icon, 
    value, 
    label, 
    className, 
    iconClassName,
    onClick 
  }: { 
    icon: React.ElementType;
    value: number;
    label: string;
    className?: string;
    iconClassName?: string;
    onClick?: () => void;
  }) => (
    <div 
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg transition-colors",
        onClick && "cursor-pointer hover:opacity-80",
        className
      )}
      onClick={onClick}
    >
      <Icon className={cn("h-4 w-4", iconClassName)} />
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );

  return (
    <Card className={cn(
      "shadow-sm bg-background/80",
      hasIssues && "border-destructive/50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              {t("callCentre.ev07b.title", "EV-07B Live Status")}
            </CardTitle>
            <CardDescription>{t("callCentre.ev07b.subtitle", "Real-time device fleet")}</CardDescription>
          </div>
          <Badge variant="outline" className="font-bold">
            {stats?.total || 0} {t("callCentre.ev07b.total", "total")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatBox
            icon={Package}
            value={stats?.in_stock || 0}
            label={t("callCentre.ev07b.inStock", "In Stock")}
            className="bg-muted/50"
            iconClassName="text-muted-foreground"
            onClick={() => navigate("/admin/devices?status=in_stock")}
          />
          <StatBox
            icon={Users}
            value={(stats?.allocated || 0) + (stats?.with_staff || 0)}
            label={t("callCentre.ev07b.allocated", "Allocated")}
            className="bg-blue-500/10"
            iconClassName="text-blue-500"
            onClick={() => navigate("/admin/devices?status=allocated")}
          />
          <StatBox
            icon={CheckCircle}
            value={stats?.live || 0}
            label={t("callCentre.ev07b.live", "Live")}
            className="bg-green-500/10"
            iconClassName="text-green-500"
            onClick={() => navigate("/admin/devices?status=live")}
          />
          <StatBox
            icon={Wifi}
            value={stats?.online || 0}
            label={t("callCentre.ev07b.online", "Online")}
            className="bg-green-500/10"
            iconClassName="text-green-500"
          />
        </div>

        {/* Alerts Row */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <StatBox
            icon={WifiOff}
            value={stats?.offline || 0}
            label={t("callCentre.ev07b.offline", "Offline")}
            className={cn(
              (stats?.offline || 0) > 0 ? "bg-destructive/10" : "bg-muted/50"
            )}
            iconClassName={cn(
              (stats?.offline || 0) > 0 ? "text-destructive" : "text-muted-foreground"
            )}
            onClick={() => navigate("/admin/ev07b")}
          />
          <StatBox
            icon={AlertTriangle}
            value={stats?.open_alerts || 0}
            label={t("callCentre.ev07b.openAlerts", "Open Alerts")}
            className={cn(
              (stats?.open_alerts || 0) > 0 ? "bg-destructive/10" : "bg-muted/50"
            )}
            iconClassName={cn(
              (stats?.open_alerts || 0) > 0 ? "text-destructive" : "text-muted-foreground"
            )}
            onClick={() => navigate("/admin/ev07b")}
          />
        </div>
      </CardContent>
    </Card>
  );
}
