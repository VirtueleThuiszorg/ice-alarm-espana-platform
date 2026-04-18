import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  Euro,
  TrendingUp,
  TrendingDown,
  CreditCard,
  ShoppingCart,
  DollarSign,
  Calendar,
  Users,
  Package,
  ArrowRight,
  Clock,
  CheckCircle2,
  Truck,
  AlertCircle,
  PieChart,
  BarChart3,
  Receipt,
} from "lucide-react";
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { useTranslation } from "react-i18next";
import { usePendingCostsTotal } from "@/hooks/useOperationalCosts";
import { updateFinance } from "@/lib/syncHub";

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  accent: "hsl(var(--accent))",
  muted: "hsl(var(--muted))",
  success: "#10B981",
  warning: "#F59E0B",
  info: "#3B82F6",
  purple: "#8B5CF6",
};

interface FinanceStats {
  monthlyRevenue: number;
  monthlyRevenueChange: number;
  annualRevenue: number;
  activeSubscriptions: number;
  mrr: number;
  pendingOrders: number;
  outstandingCommissions: number;
  expiringSubscriptions: number;
}

interface RevenueByType {
  name: string;
  value: number;
  color: string;
}

interface MonthlyTrend {
  month: string;
  revenue: number;
}

interface OrderStatus {
  status: string;
  count: number;
  icon: React.ElementType;
  color: string;
}

export default function FinanceDashboard() {
  const { t } = useTranslation();
  const { data: pendingCostsTotal } = usePendingCostsTotal();

  // Fetch main finance stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["finance-dashboard-stats"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const [
        monthlyPayments,
        lastMonthPayments,
        yearlyPayments,
        subscriptions,
        pendingOrders,
        commissions,
        expiringSubscriptions,
      ] = await Promise.all([
        supabase
          .from("payments")
          .select("amount")
          .eq("status", "completed")
          .gte("paid_at", monthStart.toISOString())
          .lte("paid_at", monthEnd.toISOString()),
        supabase
          .from("payments")
          .select("amount")
          .eq("status", "completed")
          .gte("paid_at", lastMonthStart.toISOString())
          .lte("paid_at", lastMonthEnd.toISOString()),
        supabase
          .from("payments")
          .select("amount")
          .eq("status", "completed")
          .gte("paid_at", yearStart.toISOString()),
        supabase
          .from("subscriptions")
          .select("amount, billing_frequency")
          .eq("status", "active"),
        supabase
          .from("orders")
          .select("id")
          .in("status", ["pending", "processing"]),
        supabase
          .from("partner_commissions")
          .select("amount_eur")
          .eq("status", "approved"),
        supabase
          .from("subscriptions")
          .select("id")
          .eq("status", "active")
          .lte("renewal_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
      ]);

      const monthlyRevenue = monthlyPayments.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const lastMonthRevenue = lastMonthPayments.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const annualRevenue = yearlyPayments.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      const mrr = subscriptions.data?.reduce((sum, s) => {
        if (s.billing_frequency === "annual") {
          return sum + ((s.amount || 0) / 12);
        }
        return sum + (s.amount || 0);
      }, 0) || 0;

      const monthlyRevenueChange = lastMonthRevenue > 0
        ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

      try {
        updateFinance({
          mrrPence: Math.round(mrr * 100),
          arrPence: Math.round(mrr * 12 * 100),
          revenueMtdPence: Math.round(monthlyRevenue * 100),
          revenueYtdPence: Math.round(annualRevenue * 100),
          activeSubscriptions: subscriptions.data?.length || 0,
        });
      } catch (e) {
        console.warn('[SyncHub] Failed to update finance metrics', e);
      }

      return {
        monthlyRevenue,
        monthlyRevenueChange,
        annualRevenue,
        activeSubscriptions: subscriptions.data?.length || 0,
        mrr,
        pendingOrders: pendingOrders.data?.length || 0,
        outstandingCommissions: commissions.data?.reduce((sum, c) => sum + (c.amount_eur || 0), 0) || 0,
        expiringSubscriptions: expiringSubscriptions.data?.length || 0,
      } as FinanceStats;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Fetch revenue by type for pie chart
  const { data: revenueByType } = useQuery({
    queryKey: ["finance-revenue-by-type"],
    queryFn: async () => {
      const monthStart = startOfMonth(new Date());
      const { data } = await supabase
        .from("payments")
        .select("payment_type, amount")
        .eq("status", "completed")
        .gte("paid_at", monthStart.toISOString());

      const grouped: Record<string, number> = {};
      data?.forEach(p => {
        const type = p.payment_type || "other";
        grouped[type] = (grouped[type] || 0) + (p.amount || 0);
      });

      const typeLabels: Record<string, string> = {
        subscription: "Subscriptions",
        registration: "Registration",
        device: "Devices",
        shipping: "Shipping",
        other: "Other",
      };

      const typeColors: Record<string, string> = {
        subscription: CHART_COLORS.primary,
        registration: CHART_COLORS.info,
        device: CHART_COLORS.purple,
        shipping: CHART_COLORS.success,
        other: CHART_COLORS.warning,
      };

      return Object.entries(grouped).map(([type, value]) => ({
        name: typeLabels[type] || type,
        value,
        color: typeColors[type] || CHART_COLORS.muted,
      })) as RevenueByType[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch monthly revenue trend
  const { data: revenueTrend } = useQuery({
    queryKey: ["finance-revenue-trend"],
    queryFn: async () => {
      const months: MonthlyTrend[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = subMonths(new Date(), i);
        const start = startOfMonth(date);
        const end = endOfMonth(date);

        const { data } = await supabase
          .from("payments")
          .select("amount")
          .eq("status", "completed")
          .gte("paid_at", start.toISOString())
          .lte("paid_at", end.toISOString());

        months.push({
          month: format(date, "MMM"),
          revenue: data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0,
        });
      }
      return months;
    },
    staleTime: 1000 * 60 * 10,
  });

  // Fetch orders by status
  const { data: ordersByStatus } = useQuery({
    queryKey: ["finance-orders-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("status");

      const counts: Record<string, number> = {
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
      };

      data?.forEach(o => {
        if (o.status != null && counts[o.status] !== undefined) {
          counts[o.status]++;
        }
      });

      return [
        { status: "Pending", count: counts.pending, icon: Clock, color: "text-amber-500" },
        { status: "Processing", count: counts.processing, icon: Package, color: "text-blue-500" },
        { status: "Shipped", count: counts.shipped, icon: Truck, color: "text-purple-500" },
        { status: "Delivered", count: counts.delivered, icon: CheckCircle2, color: "text-green-500" },
      ] as OrderStatus[];
    },
    staleTime: 1000 * 60 * 2,
  });

  // Fetch subscription distribution
  const { data: subscriptionDistribution } = useQuery({
    queryKey: ["finance-subscription-distribution"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan_type, billing_frequency, status");

      const planCounts = { single: 0, couple: 0 };
      const frequencyCounts = { monthly: 0, annual: 0 };
      const statusCounts = { active: 0, paused: 0, cancelled: 0 };

      data?.forEach(s => {
        if (s.plan_type && planCounts[s.plan_type as keyof typeof planCounts] !== undefined) {
          planCounts[s.plan_type as keyof typeof planCounts]++;
        }
        if (s.billing_frequency && frequencyCounts[s.billing_frequency as keyof typeof frequencyCounts] !== undefined) {
          frequencyCounts[s.billing_frequency as keyof typeof frequencyCounts]++;
        }
        if (s.status && statusCounts[s.status as keyof typeof statusCounts] !== undefined) {
          statusCounts[s.status as keyof typeof statusCounts]++;
        }
      });

      return {
        byPlan: [
          { name: "Single", value: planCounts.single, color: CHART_COLORS.primary },
          { name: "Couple", value: planCounts.couple, color: CHART_COLORS.info },
        ],
        byFrequency: [
          { name: "Monthly", value: frequencyCounts.monthly, color: CHART_COLORS.success },
          { name: "Annual", value: frequencyCounts.annual, color: CHART_COLORS.purple },
        ],
        byStatus: statusCounts,
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch commission stats
  const { data: commissionStats } = useQuery({
    queryKey: ["finance-commission-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("partner_commissions")
        .select("status, amount_eur");

      const stats = {
        pending_release: 0,
        approved: 0,
        paid: 0,
        cancelled: 0,
      };

      data?.forEach(c => {
        if (c.status && stats[c.status as keyof typeof stats] !== undefined) {
          stats[c.status as keyof typeof stats] += c.amount_eur || 0;
        }
      });

      return stats;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Fetch recent payments
  const { data: recentPayments } = useQuery({
    queryKey: ["finance-recent-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select(`*, member:member_id (first_name, last_name)`)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  // Fetch recent orders
  const { data: recentOrders } = useQuery({
    queryKey: ["finance-recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select(`*, member:member_id (first_name, last_name)`)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      pending: "secondary",
      failed: "destructive",
      refunded: "outline",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  const formatCurrency = (amount: number) => `€${amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`;

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("adminFinance.title", "Finance Dashboard")}</h1>
          <p className="text-muted-foreground">
            {t("adminFinance.subtitle", "Financial overview and key metrics for ICE Alarm España")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/reports">
              <BarChart3 className="h-4 w-4 mr-2" />
              Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.monthlyRevenue || 0)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {stats?.monthlyRevenueChange !== undefined && stats.monthlyRevenueChange !== 0 ? (
                <>
                  {stats.monthlyRevenueChange > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  <span className={stats.monthlyRevenueChange > 0 ? "text-green-500" : "text-red-500"}>
                    {stats.monthlyRevenueChange > 0 ? "+" : ""}{stats.monthlyRevenueChange.toFixed(1)}%
                  </span> vs last month
                </>
              ) : (
                "No change from last month"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annual Revenue</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.annualRevenue || 0)}</div>
            <p className="text-xs text-muted-foreground">Year to date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeSubscriptions || 0}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.mrr || 0)}</div>
            <p className="text-xs text-muted-foreground">Monthly Recurring</p>
          </CardContent>
        </Card>

        <Card className={stats?.pendingOrders ? "border-l-4 border-l-amber-500" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <ShoppingCart className={`h-4 w-4 ${stats?.pendingOrders ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats?.pendingOrders ? "text-amber-500" : ""}`}>
              {stats?.pendingOrders || 0}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting processing</p>
          </CardContent>
        </Card>

        <Card className={stats?.outstandingCommissions ? "border-l-4 border-l-purple-500" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Commissions</CardTitle>
            <DollarSign className={`h-4 w-4 ${stats?.outstandingCommissions ? "text-purple-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats?.outstandingCommissions ? "text-purple-500" : ""}`}>
              {formatCurrency(stats?.outstandingCommissions || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Ready to pay</p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Alert Card */}
      {pendingCostsTotal !== undefined && pendingCostsTotal > 0 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-600" />
                Pending Business Expenses
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/products">
                  Manage Costs
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(pendingCostsTotal)}</p>
                <p className="text-xs text-muted-foreground">Total pending/overdue expenses</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Revenue by Type
            </CardTitle>
            <CardDescription>This month's revenue breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueByType && revenueByType.length > 0 ? (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width={180} height={180}>
                  <RechartsPie>
                    <Pie
                      data={revenueByType}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                    >
                      {revenueByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </RechartsPie>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {revenueByType.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                      <span className="text-sm font-medium ml-auto">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground">
                No revenue data this month
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Revenue Trend
            </CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueTrend && revenueTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `€${v / 1000}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={{ fill: CHART_COLORS.primary }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders Pipeline */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Orders Pipeline</CardTitle>
            <CardDescription>Current order status distribution</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/orders">View All Orders</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {ordersByStatus?.map((status, index) => (
              <div key={status.status} className="flex items-center gap-3">
                <div className={`p-3 rounded-lg bg-muted ${status.color}`}>
                  <status.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{status.count}</p>
                  <p className="text-xs text-muted-foreground">{status.status}</p>
                </div>
                {index < (ordersByStatus?.length || 0) - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions & Commissions Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Subscription Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Subscription Overview</CardTitle>
              <CardDescription>Plan and billing distribution</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/subscriptions">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {subscriptionDistribution ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {/* Plan Type Chart */}
                  <div>
                    <p className="text-sm font-medium mb-2">By Plan</p>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={subscriptionDistribution.byPlan} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={60} className="text-xs" />
                        <Tooltip />
                        <Bar dataKey="value" radius={4}>
                          {subscriptionDistribution.byPlan.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Frequency Chart */}
                  <div>
                    <p className="text-sm font-medium mb-2">By Billing</p>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={subscriptionDistribution.byFrequency} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={60} className="text-xs" />
                        <Tooltip />
                        <Bar dataKey="value" radius={4}>
                          {subscriptionDistribution.byFrequency.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* Status Summary */}
                <div className="flex gap-4 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm text-muted-foreground">Active: {subscriptionDistribution.byStatus.active}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-sm text-muted-foreground">Paused: {subscriptionDistribution.byStatus.paused}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-sm text-muted-foreground">Cancelled: {subscriptionDistribution.byStatus.cancelled}</span>
                  </div>
                </div>
                {stats?.expiringSubscriptions ? (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">{stats.expiringSubscriptions} subscriptions expiring in 30 days</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No subscription data
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commissions Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Partner Commissions</CardTitle>
              <CardDescription>Commission status breakdown</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/commissions">Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {commissionStats ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-600 font-medium">Pending Release</p>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(commissionStats.pending_release)}</p>
                </div>
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-600 font-medium">Approved (Due)</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(commissionStats.approved)}</p>
                </div>
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-green-600 font-medium">Total Paid</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(commissionStats.paid)}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground font-medium">Cancelled</p>
                  <p className="text-2xl font-bold text-muted-foreground">{formatCurrency(commissionStats.cancelled)}</p>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No commission data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Payments</CardTitle>
              <CardDescription>Latest payment transactions</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/payments">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentPayments && recentPayments.length > 0 ? (
              <div className="space-y-3">
                {recentPayments.map((payment: any) => (
                  <div key={payment.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">
                        {payment.member?.first_name} {payment.member?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(payment.created_at), "dd MMM yyyy, HH:mm")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(payment.amount)}</p>
                      {getStatusBadge(payment.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No recent payments
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest order activity</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/orders">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders && recentOrders.length > 0 ? (
              <div className="space-y-3">
                {recentOrders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">
                        {order.order_number || order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.member?.first_name} {order.member?.last_name} • {format(new Date(order.created_at), "dd MMM")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(order.total_amount || 0)}</p>
                      <Badge variant="secondary">{order.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No recent orders
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Orders", path: "/admin/orders", icon: ShoppingCart },
          { label: "Subscriptions", path: "/admin/subscriptions", icon: CreditCard },
          { label: "Payments", path: "/admin/payments", icon: DollarSign },
          { label: "Commissions", path: "/admin/commissions", icon: Users },
          { label: "Reports", path: "/admin/reports", icon: BarChart3 },
        ].map((link) => (
          <Button key={link.path} variant="outline" className="h-16" asChild>
            <Link to={link.path} className="flex flex-col items-center gap-1">
              <link.icon className="h-5 w-5" />
              <span className="text-sm">{link.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
