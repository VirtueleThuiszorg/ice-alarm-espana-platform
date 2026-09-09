import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES, INTERVALS } from "@/config/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Bell,
  Smartphone,
  ShoppingCart,
  DollarSign,
  Calendar,
  TrendingUp,
  Package,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/formatDate";
import { updateDailyMetrics } from "@/lib/syncHub";
import { LeadsWidget } from "@/components/dashboard/LeadsWidget";
import { SalesTodayPill } from "@/components/admin/dashboard/SalesTodayPill";
import { PaidSalesFeed } from "@/components/admin/dashboard/PaidSalesFeed";
import { AISalesDesk } from "@/components/admin/dashboard/AISalesDesk";
import { NotificationSettings } from "@/components/admin/dashboard/NotificationSettings";
import { NotificationLog } from "@/components/admin/dashboard/NotificationLog";
import { EV07BStatusWidget } from "@/components/admin/dashboard/EV07BStatusWidget";
import { useDeviceRealtime } from "@/hooks/useDeviceRealtime";
import { useAlertsRealtime } from "@/hooks/useAlertsRealtime";
import { IsabellaHealthPill } from "@/components/admin/dashboard/IsabellaHealthPill";
import { useOnShiftNow } from "@/hooks/useStaffShifts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMonitoringReadiness } from "@/hooks/useMonitoringReadiness";
import { AdminMobileHome, type AdminMobileHomeProps } from "@/components/admin/dashboard/AdminMobileHome";
import { SHIFT_TYPES } from "@/config/shifts";
import type { ShiftType } from "@/config/shifts";

/** The alert shape the phone home reads — a subset of the dashboard's own alert rows. */
type AdminMobileHomeAlert = AdminMobileHomeProps["alerts"][number];

interface DashboardStats {
  active_members: number;
  new_members_30d: number;
  active_alerts: number;
  devices_in_stock: number;
  devices_assigned: number;
  pending_orders: number;
  monthly_revenue: number;
  expiring_subscriptions: number;
}

export default function AdminDashboard() {
  const { t } = useTranslation();

  // Subscribe to realtime updates for devices and alerts
  useDeviceRealtime();
  useAlertsRealtime();

  const { data: onShiftNow = [] } = useOnShiftNow();

  // 768px, from the shared hook — the same breakpoint Tailwind's `md:` uses, so the phone home
  // and the responsive classes elsewhere cannot disagree about what "a phone" is.
  const isMobile = useIsMobile();

  // Paid members who are not yet monitored. Read here as well as on the phone home, from the
  // SAME hook: the number that says money has been taken and nobody is watching belongs on both
  // surfaces, and two derivations of it would eventually disagree.
  const readiness = useMonitoringReadiness();

  // Single RPC call replaces 7 separate queries
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_dashboard_stats");
      if (error) throw error;

      const statsData = data as unknown as DashboardStats;

      try {
        updateDailyMetrics({
          activeUsers: statsData.active_members || 0,
          totalUsers: statsData.active_members || 0
        });
      } catch (e) {
        console.warn('[SyncHub] Admin metric update failed', e);
      }

      return statsData;
    },
    staleTime: STALE_TIMES.MEDIUM,
    refetchInterval: INTERVALS.DASHBOARD_REFRESH,
  });

  // Fetch active alerts list (separate query for the detail cards)
  const { data: alertsData } = useQuery({
    queryKey: ["admin-alerts-list"],
    queryFn: async () => {
      const { data: alerts } = await supabase
        .from("alerts")
        .select("*, member:members(first_name, last_name)")
        .in("status", ["incoming", "in_progress"])
        .order("received_at", { ascending: false })
        .limit(5);

      return alerts || [];
    },
    staleTime: STALE_TIMES.SHORT,
    refetchInterval: INTERVALS.DASHBOARD_REFRESH,
  });

  // Fetch recent activity
  const { data: activityData } = useQuery({
    queryKey: ["admin-recent-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select(`
          *,
          staff:staff_id (first_name, last_name)
        `)
        .order("created_at", { ascending: false })
        .limit(10);

      return data || [];
    },
    staleTime: STALE_TIMES.MEDIUM,
  });

  /*
    THE PHONE HOME. Under 768px /admin renders the five things Lee opens his phone for, each one
    a tap-through, instead of a twenty-card column.

    IT IS A BRANCH INSIDE THIS COMPONENT, not a second route and not a second set of queries:
    `stats` and `alertsData` are handed over already fetched, so the phone and the desktop cannot
    show different numbers and rotating the device costs no round trip. That is what "same data
    hooks as desktop" has to mean to be worth anything.
  */
  if (isMobile) {
    return (
      <AdminMobileHome
        stats={stats}
        statsLoading={statsLoading}
        statsError={!!statsError}
        alerts={(alertsData ?? []) as AdminMobileHomeAlert[]}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/*
        Page header — title, then the two status pills, then Add Member, all on one line.

        Lee's correction (9 Sep): these were CARDS in a row of their own between the header and
        the stat tiles, which cost a screenful of height for two numbers. They are pills now,
        header-height, sitting immediately left of the primary action, with the detail they used
        to print inline moved into a popover behind each.

        `flex-wrap` with the title as its own non-shrinking block is what makes the narrow-screen
        behaviour Lee asked for fall out: on a wide viewport the pills sit on the title line; when
        there is no room they wrap underneath it, still above the tiles, because they are inside
        this header block rather than in a row of their own.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{t('adminDashboard.title')}</h1>
          <p className="text-muted-foreground">
            {t('adminDashboard.welcome')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IsabellaHealthPill />
          <SalesTodayPill />
          <Button asChild>
            <Link to="/admin/members/new">{t('adminDashboard.addMember')}</Link>
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {statsError && (
        <div className="flex items-center justify-between p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-sm text-destructive">{t("adminDashboard.statsError", "Failed to load dashboard stats.")}</p>
          <Button variant="outline" size="sm" onClick={() => refetchStats()}>{t("common.refresh")}</Button>
        </div>
      )}

      {/* Stats Grid - Now using single RPC data */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminDashboard.activeMembers')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{stats?.active_members || 0}</div>}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {stats?.new_members_30d ? (
                <>
                  <TrendingUp className="h-3 w-3 text-alert-resolved" />
                  <span className="text-alert-resolved">+{stats.new_members_30d}</span> {t('common.thisMonth')}
                </>
              ) : (
                t('common.noNewMembersThisMonth')
              )}
            </p>
          </CardContent>
        </Card>

        <Card className={stats?.active_alerts ? "border-alert-sos/50 bg-alert-sos/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminDashboard.activeAlerts')}</CardTitle>
            <Bell className={`h-4 w-4 ${stats?.active_alerts ? "text-alert-sos" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className={`text-2xl font-bold ${stats?.active_alerts ? "text-alert-sos" : ""}`}>
                {stats?.active_alerts || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats?.active_alerts ? t('common.requireAttention') : t('common.noActiveAlerts')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminDashboard.devices')}</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">
                {stats?.devices_in_stock || 0} / {stats?.devices_assigned || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('common.inStockAssigned')}</p>
          </CardContent>
        </Card>

        <Card className={stats?.pending_orders ? "border-amber-500/50 bg-amber-500/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminDashboard.pendingOrders')}</CardTitle>
            <ShoppingCart className={`h-4 w-4 ${stats?.pending_orders ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className={`text-2xl font-bold ${stats?.pending_orders ? "text-amber-500" : ""}`}>
                {stats?.pending_orders || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('common.needProcessing')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminDashboard.revenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">€{(stats?.monthly_revenue || 0).toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground">{t('common.thisMonth')}</p>
          </CardContent>
        </Card>

        <Card className={stats?.expiring_subscriptions ? "border-amber-500/50 bg-amber-500/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminDashboard.expiringSoon')}</CardTitle>
            <Calendar className={`h-4 w-4 ${stats?.expiring_subscriptions ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className={`text-2xl font-bold ${stats?.expiring_subscriptions ? "text-amber-500" : ""}`}>
                {stats?.expiring_subscriptions || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('common.inNext30Days')}</p>
          </CardContent>
        </Card>

        {/*
          PAID, NOT YET MONITORED. The dashboard counted active members and never counted ready
          ones, and they are not the same thing: a member can be paying, activated by the
          webhook, and still unmonitored because their pendant is untested or they have no
          emergency contact. Money taken, nobody watching — and until now that number lived only
          on a queue page somebody had to think to open.

          A failed read renders as a failure, not as zero: "nobody is waiting" is the one wrong
          answer here that looks like good news.
        */}
        <Card className={readiness.data?.waiting ? "border-amber-500/50 bg-amber-500/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("adminDashboard.notYetMonitored", "Paid, not yet monitored")}
            </CardTitle>
            <ShieldAlert
              className={`h-4 w-4 ${readiness.data?.waiting ? "text-amber-500" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            {readiness.isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : readiness.isError ? (
              <div className="text-sm font-medium text-destructive">
                {t("adminDashboard.notYetMonitoredFailed", "could not be read")}
              </div>
            ) : (
              <div className={`text-2xl font-bold ${readiness.data?.waiting ? "text-amber-500" : ""}`}>
                {readiness.data?.waiting ?? 0}
              </div>
            )}
            <Link to="/admin/members/readiness-queue" className="text-xs text-muted-foreground underline">
              {t("adminDashboard.notYetMonitoredLink", "Readiness queue")}
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Sales Feed + AI Desk Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PaidSalesFeed />
        <AISalesDesk />
      </div>

      {/* EV-07B Status Widget */}
      <EV07BStatusWidget />

      {/* On Shift Now Widget */}
      <Card className={onShiftNow.length > 0 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className={`relative flex h-3 w-3`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${onShiftNow.length > 0 ? "bg-green-400" : "bg-red-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${onShiftNow.length > 0 ? "bg-green-500" : "bg-red-500"}`}></span>
            </span>
            {t("rota.onShiftNow", "On Shift Now")}
          </CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/rota">{t("common.viewAll", "View All")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {onShiftNow.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {onShiftNow.map((s) => {
                const config = SHIFT_TYPES[s.shift_type as ShiftType];
                return (
                  <Badge key={s.id} variant="secondary" className="gap-1.5 py-1">
                    {s.first_name} {s.last_name}
                    <span className={`inline-flex items-center rounded px-1 text-xs font-bold ${config?.bgClass} ${config?.textClass}`}>
                      {config?.badgeLetter}
                    </span>
                  </Badge>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {t("rota.nobodyOnShift", "Nobody is currently on shift")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Leads Widget */}
        <LeadsWidget variant="admin" />

        {/* Active Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('adminDashboard.activeAlerts')}</CardTitle>
              <CardDescription>{t('adminDashboard.alertsRequiringAttention')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/alerts">{t('common.viewAll')}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {alertsData && alertsData.length > 0 ? (
              <div className="space-y-3">
                {alertsData.slice(0, 4).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${alert.alert_type === "sos_button" || alert.alert_type === "fall_detected"
                          ? "bg-alert-sos/20 text-alert-sos"
                          : "bg-amber-500/20 text-amber-500"
                        }`}>
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {alert.alert_type === "sos_button" ? t("alerts.sos", "SOS")
                            : alert.alert_type === "fall_detected" ? t("alerts.fallDetected", "Fall Detected")
                              : alert.alert_type === "device_offline" ? t("alerts.deviceOffline", "Device Offline")
                                : alert.alert_type === "low_battery" ? t("alerts.lowBattery", "Low Battery")
                                  : alert.alert_type === "geo_fence" ? t("alerts.geoFenceAlert", "Geo-fence Alert")
                                    : alert.alert_type.replace("_", " ")}
                          {alert.member && ` — ${alert.member.first_name} ${alert.member.last_name}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(alert.received_at, "HH:mm - dd MMM")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={alert.status === "incoming" ? "destructive" : "secondary"}>
                      {alert.status === "incoming" ? t('common.incoming') : t('common.inProgress')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>{t('common.noActiveAlerts')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminDashboard.recentActivity')}</CardTitle>
            <CardDescription>{t('adminDashboard.latestActions')}</CardDescription>
          </CardHeader>
          <CardContent>
            {activityData && activityData.length > 0 ? (
              <div className="space-y-3">
                {activityData.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 pb-3 border-b last:border-0"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">
                          {activity.staff?.first_name} {activity.staff?.last_name}
                        </span>{" "}
                        <span className="text-muted-foreground">{activity.action}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(activity.created_at, "HH:mm - dd MMM yyyy")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>{t('common.noRecentActivity')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notification Control Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <NotificationSettings />
        <NotificationLog />
      </div>
    </div>
  );
}
