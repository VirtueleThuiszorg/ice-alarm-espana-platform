import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Download, 
  Users, 
  Eye, 
  MousePointerClick,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Megaphone,
  Target,
  Activity,
  Layers,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { subDays, format, startOfDay, endOfDay } from "date-fns";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LiveVisitorsCard } from "@/components/analytics/LiveVisitorsCard";
import { cn } from "@/lib/utils";

type DateRange = "7d" | "30d" | "90d";

// Professional stat card component
function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  trendLabel,
  accentColor = "primary",
  isLoading = false
}: { 
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accentColor?: "primary" | "green" | "amber" | "red";
  isLoading?: boolean;
}) {
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    green: "bg-green-500/10 text-green-600",
    amber: "bg-amber-500/10 text-amber-600",
    red: "bg-red-500/10 text-red-600"
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-20 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", colorClasses[accentColor])}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {trend && trendLabel && (
            <Badge 
              variant="secondary" 
              className={cn(
                "text-xs font-medium shrink-0",
                trend === "up" && "bg-green-500/10 text-green-600 border-green-500/20",
                trend === "down" && "bg-red-500/10 text-red-600 border-red-500/20"
              )}
            >
              {trend === "up" ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
              {trendLabel}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 truncate">{subtitle}</p>
      </CardContent>
      {/* Subtle gradient accent */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </Card>
  );
}

// Empty state component
function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="font-medium text-muted-foreground">{title}</p>
      <p className="text-sm text-muted-foreground/70 mt-1 max-w-[250px]">{description}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const getDaysFromRange = (range: DateRange): number => {
    switch (range) {
      case "7d": return 7;
      case "30d": return 30;
      case "90d": return 90;
    }
  };

  const startDate = startOfDay(subDays(new Date(), getDaysFromRange(dateRange)));
  const endDate = endOfDay(new Date());

  // Fetch website events data
  const { data: eventsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["website-analytics", dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_events")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000, // 30 seconds
  });

  // Memoized calculations for performance
  const analytics = useMemo(() => {
    if (!eventsData) return null;

    const uniqueVisitors = new Set(eventsData.map(e => e.visitor_id).filter(Boolean)).size;
    const pageViewEvents = eventsData.filter(e => e.event_type === "page_view");
    const pageViews = pageViewEvents.length;
    const sessions = new Set(eventsData.map(e => e.session_id).filter(Boolean)).size;
    
    // Bounce rate calculation
    const sessionPageCounts: Record<string, number> = {};
    pageViewEvents.forEach(e => {
      if (e.session_id) {
        sessionPageCounts[e.session_id] = (sessionPageCounts[e.session_id] || 0) + 1;
      }
    });
    const bouncedSessions = Object.values(sessionPageCounts).filter(count => count === 1).length;
    const bounceRate = sessions > 0 ? (bouncedSessions / sessions) * 100 : 0;
    const avgPagesPerSession = sessions > 0 ? (pageViews / sessions) : 0;

    // Top pages
    const pageViewCounts: Record<string, number> = {};
    pageViewEvents.forEach(e => {
      if (e.page_path) {
        pageViewCounts[e.page_path] = (pageViewCounts[e.page_path] || 0) + 1;
      }
    });
    const topPages = Object.entries(pageViewCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([path, views]) => ({ 
        path, 
        views, 
        percent: pageViews > 0 ? (views / pageViews) * 100 : 0 
      }));

    // Device breakdown
    const deviceCounts: Record<string, number> = {};
    eventsData.forEach(e => {
      const device = e.device_type || "unknown";
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    });
    const totalDeviceEvents = Object.values(deviceCounts).reduce((a, b) => a + b, 0);
    const deviceData = Object.entries(deviceCounts)
      .map(([name, value]) => ({ 
        name: name.charAt(0).toUpperCase() + name.slice(1), 
        value,
        percent: totalDeviceEvents > 0 ? (value / totalDeviceEvents) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);

    // Browser breakdown
    const browserCounts: Record<string, number> = {};
    eventsData.forEach(e => {
      const browser = e.browser || "Other";
      browserCounts[browser] = (browserCounts[browser] || 0) + 1;
    });
    const browserData = Object.entries(browserCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Country breakdown
    const countryCounts: Record<string, { count: number; name: string }> = {};
    eventsData.forEach(e => {
      const countryCode = e.country_code || "Unknown";
      const countryName = e.country_name || e.country_code || "Unknown";
      if (!countryCounts[countryCode]) {
        countryCounts[countryCode] = { count: 0, name: countryName };
      }
      countryCounts[countryCode].count++;
    });
    const totalCountryEvents = Object.values(countryCounts).reduce((sum, c) => sum + c.count, 0);
    const countryData = Object.entries(countryCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([code, data]) => ({ 
        code, 
        name: data.name, 
        count: data.count,
        percent: totalCountryEvents > 0 ? (data.count / totalCountryEvents) * 100 : 0
      }));

    // Traffic sources
    const sourceCounts = { direct: 0, organic: 0, referral: 0, social: 0 };
    pageViewEvents.forEach(e => {
      if (!e.referrer || e.referrer === "") {
        sourceCounts.direct++;
      } else if (e.referrer.includes("google") || e.referrer.includes("bing") || e.referrer.includes("yahoo") || e.referrer.includes("duckduckgo")) {
        sourceCounts.organic++;
      } else if (e.referrer.includes("facebook") || e.referrer.includes("twitter") || e.referrer.includes("instagram") || e.referrer.includes("linkedin") || e.referrer.includes("tiktok")) {
        sourceCounts.social++;
      } else {
        sourceCounts.referral++;
      }
    });
    const sourceData = [
      { name: "Direct", value: sourceCounts.direct, color: "hsl(var(--primary))" },
      { name: "Organic", value: sourceCounts.organic, color: "hsl(142, 76%, 36%)" },
      { name: "Referral", value: sourceCounts.referral, color: "hsl(221, 83%, 53%)" },
      { name: "Social", value: sourceCounts.social, color: "hsl(262, 83%, 58%)" },
    ].filter(s => s.value > 0);

    // Daily chart data
    const dailyData: Record<string, { date: string; visitors: Set<string>; pageViews: number }> = {};
    eventsData.forEach(e => {
      if (!e.created_at) return;
      const date = format(new Date(e.created_at), "MMM dd");
      if (!dailyData[date]) {
        dailyData[date] = { date, visitors: new Set(), pageViews: 0 };
      }
      if (e.visitor_id) dailyData[date].visitors.add(e.visitor_id);
      if (e.event_type === "page_view") dailyData[date].pageViews++;
    });
    const chartData = Object.values(dailyData)
      .map(d => ({ date: d.date, visitors: d.visitors.size, pageViews: d.pageViews }))
      .reverse();

    // UTM Campaigns
    const campaignData: Record<string, { source: string; medium: string; campaign: string; visits: number }> = {};
    eventsData.filter(e => e.utm_source).forEach(e => {
      const key = `${e.utm_source}|${e.utm_medium || "-"}|${e.utm_campaign || "-"}`;
      if (!campaignData[key]) {
        campaignData[key] = {
          source: e.utm_source || "-",
          medium: e.utm_medium || "-",
          campaign: e.utm_campaign || "-",
          visits: 0
        };
      }
      campaignData[key].visits++;
    });
    const campaigns = Object.values(campaignData).sort((a, b) => b.visits - a.visits).slice(0, 10);

    return {
      uniqueVisitors,
      pageViews,
      sessions,
      bounceRate,
      avgPagesPerSession,
      topPages,
      deviceData,
      browserData,
      countryData,
      sourceData,
      chartData,
      campaigns,
      totalEvents: eventsData.length
    };
  }, [eventsData]);

  const DEVICE_COLORS: Record<string, string> = {
    Desktop: "hsl(var(--primary))",
    Mobile: "hsl(142, 76%, 36%)",
    Tablet: "hsl(221, 83%, 53%)",
    Unknown: "hsl(var(--muted-foreground))"
  };

  const DeviceIcon = ({ type }: { type: string }) => {
    switch (type.toLowerCase()) {
      case "desktop": return <Monitor className="h-4 w-4" />;
      case "mobile": return <Smartphone className="h-4 w-4" />;
      case "tablet": return <Tablet className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const chartConfig = {
    visitors: { label: "Visitors", color: "hsl(var(--primary))" },
    pageViews: { label: "Page Views", color: "hsl(142, 76%, 36%)" },
  };

  const days = getDaysFromRange(dateRange);

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border p-6">
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <BarChart3 className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Website Analytics</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Real-time traffic insights • Updated {format(new Date(), "MMM d, HH:mm")}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <TabsList className="bg-background/80 backdrop-blur-sm border">
                <TabsTrigger value="7d" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  7 days
                </TabsTrigger>
                <TabsTrigger value="30d" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  30 days
                </TabsTrigger>
                <TabsTrigger value="90d" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  90 days
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-background/80 backdrop-blur-sm"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" className="bg-background/80 backdrop-blur-sm" onClick={() => {
              if (!analytics) {
                toast.info("No analytics data to export");
                return;
              }
              const rows = [
                ["Metric", "Value"],
                ["Date Range", `Last ${days} days`],
                ["Unique Visitors", String(analytics.uniqueVisitors)],
                ["Page Views", String(analytics.pageViews)],
                ["Sessions", String(analytics.sessions)],
                ["Bounce Rate", `${analytics.bounceRate.toFixed(1)}%`],
                ["Pages/Session", analytics.avgPagesPerSession.toFixed(1)],
                ["Total Events", String(analytics.totalEvents)],
                ["", ""],
                ["Top Pages", "Views"],
                ...analytics.topPages.map(p => [p.path, String(p.views)]),
                ["", ""],
                ["Country", "Events"],
                ...analytics.countryData.map(c => [c.name, String(c.count)]),
                ["", ""],
                ["Device", "Events"],
                ...analytics.deviceData.map(d => [d.name, String(d.value)]),
              ];
              const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `analytics-${format(new Date(), "yyyy-MM-dd")}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Analytics exported");
            }}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
        
        {/* Decorative background elements */}
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute right-20 bottom-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      </div>

      {/* Live Status Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4 text-green-500" />
          <span>Tracking {analytics?.totalEvents?.toLocaleString() || 0} events</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Showing last {days} days</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <LiveVisitorsCard />
        
        <StatCard
          title="Unique Visitors"
          value={analytics?.uniqueVisitors.toLocaleString() || "0"}
          subtitle={`Distinct visitors in ${days}d`}
          icon={Users}
          accentColor="primary"
          isLoading={isLoading}
        />
        <StatCard
          title="Page Views"
          value={analytics?.pageViews.toLocaleString() || "0"}
          subtitle="Total pages viewed"
          icon={Eye}
          accentColor="green"
          isLoading={isLoading}
        />
        <StatCard
          title="Sessions"
          value={analytics?.sessions.toLocaleString() || "0"}
          subtitle="Browsing sessions"
          icon={MousePointerClick}
          accentColor="primary"
          isLoading={isLoading}
        />
        <StatCard
          title="Bounce Rate"
          value={`${(analytics?.bounceRate || 0).toFixed(1)}%`}
          subtitle="Single page visits"
          icon={(analytics?.bounceRate || 0) > 50 ? TrendingUp : TrendingDown}
          trend={(analytics?.bounceRate || 0) <= 50 ? "up" : "down"}
          trendLabel={(analytics?.bounceRate || 0) <= 50 ? "Good" : "High"}
          accentColor={(analytics?.bounceRate || 0) <= 50 ? "green" : "amber"}
          isLoading={isLoading}
        />
        <StatCard
          title="Pages/Session"
          value={(analytics?.avgPagesPerSession || 0).toFixed(1)}
          subtitle="Avg. engagement"
          icon={Target}
          accentColor="primary"
          isLoading={isLoading}
        />
      </div>

      {/* Traffic Overview Chart */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Traffic Overview
              </CardTitle>
              <CardDescription className="mt-1">Daily visitors and page views</CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">Visitors</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(142, 76%, 36%)" }} />
                <span className="text-muted-foreground">Page Views</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Loading chart data...</p>
              </div>
            </div>
          ) : analytics?.chartData && analytics.chartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="colorPageViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                  />
                  <YAxis 
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    width={40}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="visitors"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorVisitors)"
                  />
                  <Area
                    type="monotone"
                    dataKey="pageViews"
                    stroke="hsl(142, 76%, 36%)"
                    strokeWidth={2}
                    fill="url(#colorPageViews)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <EmptyState 
              icon={BarChart3} 
              title="No traffic data yet" 
              description="Analytics will appear here once visitors start browsing your site"
            />
          )}
        </CardContent>
      </Card>

      {/* Top Pages & Traffic Sources */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Top Pages */}
        <Card className="lg:col-span-3 overflow-hidden">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Top Pages
            </CardTitle>
            <CardDescription>Most visited pages on your website</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : analytics?.topPages && analytics.topPages.length > 0 ? (
              <ScrollArea className="h-[320px] pr-4">
                <div className="space-y-4">
                  {analytics.topPages.map((page, index) => (
                    <div key={page.path} className="group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium truncate group-hover:text-primary transition-colors" title={page.path}>
                            {page.path === "/" ? "Homepage" : page.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-sm font-bold tabular-nums">{page.views.toLocaleString()}</span>
                          <Badge variant="secondary" className="text-xs tabular-nums">
                            {page.percent.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <Progress value={page.percent} className="h-1.5" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState icon={Eye} title="No page data yet" description="Page views will appear as visitors browse your site" />
            )}
          </CardContent>
        </Card>

        {/* Traffic Sources */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Traffic Sources
            </CardTitle>
            <CardDescription>Where visitors come from</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-[160px] w-full rounded-full mx-auto max-w-[160px]" />
                <div className="grid grid-cols-2 gap-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-6" />
                  ))}
                </div>
              </div>
            ) : analytics?.sourceData && analytics.sourceData.length > 0 ? (
              <div className="space-y-4">
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.sourceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {analytics.sourceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [value.toLocaleString(), 'Visits']}
                        contentStyle={{ 
                          borderRadius: '8px', 
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {analytics.sourceData.map((source) => {
                    const total = analytics.sourceData.reduce((sum, s) => sum + s.value, 0);
                    const percent = total > 0 ? ((source.value / total) * 100).toFixed(0) : "0";
                    return (
                      <div key={source.name} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30">
                        <div 
                          className="h-3 w-3 rounded-full shrink-0" 
                          style={{ backgroundColor: source.color }}
                        />
                        <span className="truncate text-muted-foreground flex-1">{source.name}</span>
                        <span className="font-bold tabular-nums">{percent}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState icon={Globe} title="No source data" description="Traffic sources appear as visitors arrive" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Countries, Devices & Browsers */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Countries */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Countries
            </CardTitle>
            <CardDescription>Geographic distribution</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : analytics?.countryData && analytics.countryData.length > 0 ? (
              <ScrollArea className="h-[240px] pr-4">
                <div className="space-y-3">
                  {analytics.countryData.map((country, index) => (
                    <div key={country.code} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-5 w-5 flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{country.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums ml-2">{country.percent.toFixed(1)}%</span>
                        </div>
                        <Progress value={country.percent} className="h-1" />
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState icon={Globe} title="No location data" description="Country data requires geo-IP integration" />
            )}
          </CardContent>
        </Card>

        {/* Devices */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              Devices
            </CardTitle>
            <CardDescription>Visitor device types</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-8 w-32" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : analytics?.deviceData && analytics.deviceData.length > 0 ? (
              <div className="space-y-5">
                {analytics.deviceData.map((device) => (
                  <div key={device.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="h-10 w-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${DEVICE_COLORS[device.name] || DEVICE_COLORS.Unknown}15` }}
                        >
                          <DeviceIcon type={device.name} />
                        </div>
                        <span className="font-medium">{device.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold tabular-nums">{device.value.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">({device.percent.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <Progress value={device.percent} className="h-2" />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Monitor} title="No device data" description="Device stats appear with traffic" />
            )}
          </CardContent>
        </Card>

        {/* Browsers */}
        <Card className="overflow-hidden md:col-span-2 xl:col-span-1">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Browsers
            </CardTitle>
            <CardDescription>Most used browsers</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : analytics?.browserData && analytics.browserData.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.browserData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      axisLine={false}
                      tickLine={false}
                      width={70}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString(), 'Events']}
                      contentStyle={{ 
                        borderRadius: '8px', 
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--background))',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                    />
                    <Bar 
                      dataKey="value" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 6, 6, 0]}
                      barSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={Globe} title="No browser data" description="Browser stats appear with traffic" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* UTM Campaigns */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Campaign Performance</CardTitle>
                <CardDescription className="mt-0.5">UTM-tagged marketing campaigns</CardDescription>
              </div>
            </div>
            {analytics?.campaigns && analytics.campaigns.length > 0 && (
              <Badge variant="secondary" className="w-fit">
                {analytics.campaigns.length} campaign{analytics.campaigns.length !== 1 ? "s" : ""} tracked
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : analytics?.campaigns && analytics.campaigns.length > 0 ? (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b-2">
                    <TableHead className="font-semibold text-foreground">Source</TableHead>
                    <TableHead className="font-semibold text-foreground">Medium</TableHead>
                    <TableHead className="font-semibold text-foreground">Campaign</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Visits</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.campaigns.map((campaign, index) => {
                    const totalVisits = analytics.campaigns.reduce((sum, c) => sum + c.visits, 0);
                    const share = totalVisits > 0 ? ((campaign.visits / totalVisits) * 100).toFixed(1) : "0";
                    return (
                      <TableRow key={index} className="group">
                        <TableCell>
                          <Badge variant="outline" className="font-medium">
                            {campaign.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{campaign.medium}</TableCell>
                        <TableCell className="font-medium max-w-[200px]">
                          <span className="truncate block" title={campaign.campaign}>
                            {campaign.campaign}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{campaign.visits.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="tabular-nums">
                            {share}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8">
              <EmptyState 
                icon={Megaphone} 
                title="No campaign data yet" 
                description="Add ?utm_source=... to your marketing URLs to track campaign performance"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
