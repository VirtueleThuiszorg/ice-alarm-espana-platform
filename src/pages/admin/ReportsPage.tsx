import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Download,
  Bell,
  CreditCard,
  Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { subMonths } from "date-fns";
import { useTranslation } from "react-i18next";

export default function ReportsPage() {
  const { t } = useTranslation();
  // Fetch subscription breakdown
  const { data: subscriptionData } = useQuery({
    queryKey: ["reports-subscriptions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan_type, status")
        .eq("status", "active");
      
      const single = data?.filter(s => s.plan_type === "single").length || 0;
      const couple = data?.filter(s => s.plan_type === "couple").length || 0;
      
      return { single, couple, total: single + couple };
    },
  });

  // Fetch device breakdown
  const { data: deviceData } = useQuery({
    queryKey: ["reports-devices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("status");
      
      const breakdown = {
        active: data?.filter(d => d.status === "active").length || 0,
        in_stock: data?.filter(d => d.status === "in_stock").length || 0,
        faulty: data?.filter(d => d.status === "faulty").length || 0,
        returned: data?.filter(d => d.status === "returned").length || 0,
      };
      
      return breakdown;
    },
  });

  // Fetch alert breakdown
  const { data: alertData } = useQuery({
    queryKey: ["reports-alerts"],
    queryFn: async () => {
      const thirtyDaysAgo = subMonths(new Date(), 1);
      
      const { data } = await supabase
        .from("alerts")
        .select("alert_type, status")
        .gte("received_at", thirtyDaysAgo.toISOString());
      
      const breakdown = {
        sos_button: data?.filter(a => a.alert_type === "sos_button").length || 0,
        fall_detected: data?.filter(a => a.alert_type === "fall_detected").length || 0,
        low_battery: data?.filter(a => a.alert_type === "low_battery").length || 0,
        geo_fence: data?.filter(a => a.alert_type === "geo_fence").length || 0,
        total: data?.length || 0,
        resolved: data?.filter(a => a.status === "resolved").length || 0,
      };
      
      return breakdown;
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">{t("adminReports.title", "Reports")}</h1>
           <p className="text-muted-foreground">
             {t("adminReports.subtitle", "Analytics and insights for ICE Alarm España.")}
           </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => {
            toast.info("PDF export coming soon");
          }}>
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => {
            const rows = [
              ["Report", "Metric", "Value"],
              ["Subscriptions", "Single", String(subscriptionData?.single || 0)],
              ["Subscriptions", "Couple", String(subscriptionData?.couple || 0)],
              ["Subscriptions", "Total Active", String(subscriptionData?.total || 0)],
              ["Devices", "Active", String(deviceData?.active || 0)],
              ["Devices", "In Stock", String(deviceData?.in_stock || 0)],
              ["Devices", "Faulty", String(deviceData?.faulty || 0)],
              ["Devices", "Returned", String(deviceData?.returned || 0)],
              ["Alerts (30d)", "SOS Button", String(alertData?.sos_button || 0)],
              ["Alerts (30d)", "Fall Detected", String(alertData?.fall_detected || 0)],
              ["Alerts (30d)", "Low Battery", String(alertData?.low_battery || 0)],
              ["Alerts (30d)", "Geo-fence", String(alertData?.geo_fence || 0)],
              ["Alerts (30d)", "Total", String(alertData?.total || 0)],
              ["Alerts (30d)", "Resolved", String(alertData?.resolved || 0)],
              ["Alerts (30d)", "Resolution Rate", `${alertData?.total ? Math.round((alertData.resolved / alertData.total) * 100) : 0}%`],
            ];
            const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `reports-${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Report exported as CSV");
          }}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Subscription Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Breakdown
            </CardTitle>
            <CardDescription>Active subscriptions by plan type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Single Memberships</span>
                <span className="font-bold">{subscriptionData?.single || 0}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ 
                    width: `${subscriptionData?.total ? (subscriptionData.single / subscriptionData.total) * 100 : 0}%` 
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Couple Memberships</span>
                <span className="font-bold">{subscriptionData?.couple || 0}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-secondary transition-all"
                  style={{ 
                    width: `${subscriptionData?.total ? (subscriptionData.couple / subscriptionData.total) * 100 : 0}%` 
                  }}
                />
              </div>
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-lg">
                  <span className="font-medium">Total Active</span>
                  <span className="font-bold">{subscriptionData?.total || 0}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Device Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Device Status
            </CardTitle>
            <CardDescription>Current device inventory status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-alert-resolved" />
                  <span className="text-sm">Active (Assigned)</span>
                </div>
                <span className="font-bold">{deviceData?.active || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span className="text-sm">In Stock</span>
                </div>
                <span className="font-bold">{deviceData?.in_stock || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-destructive" />
                  <span className="text-sm">Faulty</span>
                </div>
                <span className="font-bold">{deviceData?.faulty || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-muted-foreground" />
                  <span className="text-sm">Returned</span>
                </div>
                <span className="font-bold">{deviceData?.returned || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Volume */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alert Volume (Last 30 Days)
            </CardTitle>
            <CardDescription>Breakdown of alerts by type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center p-4 rounded-lg bg-alert-sos/10">
                <p className="text-3xl font-bold text-alert-sos">{alertData?.sos_button || 0}</p>
                <p className="text-sm text-muted-foreground">SOS Button</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-amber-500/10">
                <p className="text-3xl font-bold text-amber-600">{alertData?.fall_detected || 0}</p>
                <p className="text-sm text-muted-foreground">Fall Detected</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-blue-500/10">
                <p className="text-3xl font-bold text-blue-600">{alertData?.low_battery || 0}</p>
                <p className="text-sm text-muted-foreground">Low Battery</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-purple-500/10">
                <p className="text-3xl font-bold text-purple-600">{alertData?.geo_fence || 0}</p>
                <p className="text-sm text-muted-foreground">Geo-fence</p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Alerts</p>
                <p className="text-2xl font-bold">{alertData?.total || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Resolution Rate</p>
                <p className="text-2xl font-bold text-alert-resolved">
                  {alertData?.total ? Math.round((alertData.resolved / alertData.total) * 100) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
