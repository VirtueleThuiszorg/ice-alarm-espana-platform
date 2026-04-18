import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Clock, AlertTriangle, CheckCircle2,
  ShieldCheck, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { format, parseISO, subDays, differenceInSeconds, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";

// SLA thresholds in seconds
const SLA_THRESHOLDS: Record<string, { seconds: number; label: string }> = {
  sos_button: { seconds: 180, label: "< 3 min" },
  fall_detected: { seconds: 300, label: "< 5 min" },
  check_in: { seconds: 900, label: "< 15 min" },
  low_battery: { seconds: 900, label: "< 15 min" },
  geo_fence: { seconds: 300, label: "< 5 min" },
  manual: { seconds: 900, label: "< 15 min" },
  device_offline: { seconds: 900, label: "< 15 min" },
};

interface AlertWithResponse {
  id: string;
  alert_type: string;
  received_at: string | null;
  claimed_at: string | null;
  status: string | null;
  resolved_at: string | null;
  member_id: string;
  responseTimeSeconds: number | null;
  withinSla: boolean;
  memberName?: string;
}

interface SLABreachEntry {
  id: string;
  alert_type: string;
  received_at: string;
  claimed_at: string | null;
  responseTimeSeconds: number;
  threshold: number;
  memberName: string;
}

interface AvgResponseByType {
  type: string;
  avgResponseTime: number;
  threshold: number;
  count: number;
}

interface MonthlyTrend {
  month: string;
  compliance: number;
  totalAlerts: number;
}

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
  purple: "#8B5CF6",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function ComplianceGauge({ percentage }: { percentage: number }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const color = percentage >= 95 ? CHART_COLORS.success : percentage >= 80 ? CHART_COLORS.warning : CHART_COLORS.danger;

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="12"
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 80 80)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text
          x="80"
          y="75"
          textAnchor="middle"
          className="fill-foreground text-2xl font-bold"
          style={{ fontSize: "28px", fontWeight: 700 }}
        >
          {percentage.toFixed(1)}%
        </text>
        <text
          x="80"
          y="98"
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: "12px" }}
        >
          Compliance
        </text>
      </svg>
    </div>
  );
}

export default function SLADashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertWithResponse[]>([]);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("alerts")
        .select(`
          id, alert_type, received_at, claimed_at, status, resolved_at, member_id,
          member:members(first_name, last_name)
        `)
        .order("received_at", { ascending: false });

      if (dateFrom) {
        query = query.gte("received_at", `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte("received_at", `${dateTo}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const enriched: AlertWithResponse[] = (data || []).map((alert: any) => {
        const member = alert.member as any;
        let responseTimeSeconds: number | null = null;
        let withinSla = true;

        if (alert.received_at && alert.claimed_at) {
          responseTimeSeconds = differenceInSeconds(
            parseISO(alert.claimed_at),
            parseISO(alert.received_at)
          );
          const threshold = SLA_THRESHOLDS[alert.alert_type]?.seconds || 900;
          withinSla = responseTimeSeconds <= threshold;
        } else if (alert.received_at && !alert.claimed_at && alert.status !== "incoming") {
          // Was resolved without being explicitly claimed -- treat as within SLA
          withinSla = true;
        } else if (alert.status === "incoming") {
          // Still pending, not yet measured
          withinSla = true;
          responseTimeSeconds = null;
        }

        return {
          id: alert.id,
          alert_type: alert.alert_type,
          received_at: alert.received_at,
          claimed_at: alert.claimed_at,
          status: alert.status,
          resolved_at: alert.resolved_at,
          member_id: alert.member_id,
          responseTimeSeconds,
          withinSla,
          memberName: member ? `${member.first_name} ${member.last_name}` : "Unknown",
        };
      });

      setAlerts(enriched);
    } catch (error) {
      console.error("Error fetching SLA data:", error);
      toast.error("Failed to load SLA data");
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Computed metrics
  const alertsWithResponse = useMemo(
    () => alerts.filter((a) => a.responseTimeSeconds !== null),
    [alerts]
  );

  const compliancePercentage = useMemo(() => {
    if (alertsWithResponse.length === 0) return 100;
    const withinCount = alertsWithResponse.filter((a) => a.withinSla).length;
    return (withinCount / alertsWithResponse.length) * 100;
  }, [alertsWithResponse]);

  const avgResponseByType = useMemo((): AvgResponseByType[] => {
    const grouped: Record<string, { total: number; count: number }> = {};

    alertsWithResponse.forEach((a) => {
      if (!grouped[a.alert_type]) {
        grouped[a.alert_type] = { total: 0, count: 0 };
      }
      grouped[a.alert_type].total += a.responseTimeSeconds!;
      grouped[a.alert_type].count += 1;
    });

    return Object.entries(grouped).map(([type, stats]) => ({
      type: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      avgResponseTime: Math.round(stats.total / stats.count),
      threshold: SLA_THRESHOLDS[type]?.seconds || 900,
      count: stats.count,
    }));
  }, [alertsWithResponse]);

  const recentBreaches = useMemo((): SLABreachEntry[] => {
    const sevenDaysAgo = subDays(new Date(), 7);
    return alertsWithResponse
      .filter(
        (a) =>
          !a.withinSla &&
          a.received_at &&
          isWithinInterval(parseISO(a.received_at), {
            start: sevenDaysAgo,
            end: new Date(),
          })
      )
      .map((a) => ({
        id: a.id,
        alert_type: a.alert_type,
        received_at: a.received_at!,
        claimed_at: a.claimed_at,
        responseTimeSeconds: a.responseTimeSeconds!,
        threshold: SLA_THRESHOLDS[a.alert_type]?.seconds || 900,
        memberName: a.memberName || "Unknown",
      }))
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
      .slice(0, 20);
  }, [alertsWithResponse]);

  const monthlyTrend = useMemo((): MonthlyTrend[] => {
    const months: MonthlyTrend[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i));
      const monthEnd = endOfMonth(subMonths(new Date(), i));

      const monthAlerts = alertsWithResponse.filter(
        (a) =>
          a.received_at &&
          isWithinInterval(parseISO(a.received_at), {
            start: monthStart,
            end: monthEnd,
          })
      );

      const withinSla = monthAlerts.filter((a) => a.withinSla).length;
      const compliance = monthAlerts.length > 0 ? (withinSla / monthAlerts.length) * 100 : 100;

      months.push({
        month: format(monthStart, "MMM yyyy"),
        compliance: Math.round(compliance * 10) / 10,
        totalAlerts: monthAlerts.length,
      });
    }
    return months;
  }, [alertsWithResponse]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SLA Monitoring</h1>
          <p className="text-muted-foreground">
            Track response times and SLA compliance across all alert types
          </p>
        </div>
      </div>

      {/* Date Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">From:</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">To:</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground flex items-center">
              {alerts.length} total alerts | {alertsWithResponse.length} with response data
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SLA Thresholds Reference */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(SLA_THRESHOLDS).map(([type, { label }]) => (
          <Badge key={type} variant="outline" className="text-xs">
            {type.replace(/_/g, " ")}: {label}
          </Badge>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Compliance Gauge */}
        <Card className="md:row-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Overall SLA Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ComplianceGauge percentage={compliancePercentage} />
          </CardContent>
        </Card>

        {/* Total Alerts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Total Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{alerts.length}</p>
            <p className="text-sm text-muted-foreground">
              In selected period
            </p>
          </CardContent>
        </Card>

        {/* Average Response Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Avg Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {alertsWithResponse.length > 0
                ? formatDuration(
                    alertsWithResponse.reduce((sum, a) => sum + (a.responseTimeSeconds || 0), 0) /
                      alertsWithResponse.length
                  )
                : "N/A"}
            </p>
            <p className="text-sm text-muted-foreground">
              Across all alert types
            </p>
          </CardContent>
        </Card>

        {/* SLA Breaches */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              SLA Breaches (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">
              {recentBreaches.length}
            </p>
            <p className="text-sm text-muted-foreground">
              Alerts exceeding threshold
            </p>
          </CardContent>
        </Card>

        {/* Met SLA */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Alerts Within SLA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {alertsWithResponse.filter((a) => a.withinSla).length}
            </p>
            <p className="text-sm text-muted-foreground">
              Of {alertsWithResponse.length} measured
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average Response Time by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Average Response Time by Alert Type</CardTitle>
            <CardDescription>
              Response time (seconds) vs SLA threshold
            </CardDescription>
          </CardHeader>
          <CardContent>
            {avgResponseByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={avgResponseByType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis label={{ value: "Seconds", angle: -90, position: "insideLeft" }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatDuration(value),
                      name === "avgResponseTime" ? "Avg Response" : "SLA Threshold",
                    ]}
                  />
                  <Legend />
                  <Bar
                    dataKey="avgResponseTime"
                    name="Avg Response"
                    fill={CHART_COLORS.info}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="threshold"
                    name="SLA Threshold"
                    fill={CHART_COLORS.danger}
                    radius={[4, 4, 0, 0]}
                    opacity={0.4}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No response data available for selected period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly SLA Compliance Trend</CardTitle>
            <CardDescription>
              SLA compliance percentage over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    domain={[0, 100]}
                    label={{ value: "Compliance %", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "compliance" ? `${value}%` : value,
                      name === "compliance" ? "SLA Compliance" : "Total Alerts",
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="compliance"
                    name="SLA Compliance"
                    stroke={CHART_COLORS.success}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalAlerts"
                    name="Total Alerts"
                    stroke={CHART_COLORS.purple}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                    yAxisId={0}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SLA Breaches in Last 7 Days */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            SLA Breaches - Last 7 Days
          </CardTitle>
          <CardDescription>
            Alerts that exceeded their SLA threshold
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentBreaches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-semibold">No SLA breaches</p>
              <p className="text-muted-foreground">
                All alerts in the last 7 days were handled within SLA thresholds
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentBreaches.map((breach) => (
                <div
                  key={breach.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-destructive/5 border-destructive/20"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <Badge variant="destructive">
                        {breach.alert_type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{breach.memberName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(breach.received_at), "MMM d, yyyy HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-destructive">
                      {formatDuration(breach.responseTimeSeconds)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Threshold: {formatDuration(breach.threshold)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
