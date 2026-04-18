import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Smartphone, DollarSign, AlertTriangle, Settings, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeviceStockSection } from "@/components/admin/products/DeviceStockSection";
import { DeviceAlertsPanel } from "@/components/admin/products/DeviceAlertsPanel";
import { DeviceApiKeyConfig } from "@/components/admin/products/DeviceApiKeyConfig";
import { OperationalCostsSection } from "@/components/admin/products/OperationalCostsSection";
import { useDeviceRealtime } from "@/hooks/useDeviceRealtime";
import { useAlertsRealtime } from "@/hooks/useAlertsRealtime";
import { useDeviceStockStats } from "@/hooks/useDeviceStock";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { getPendantFinalPrice } from "@/config/pricing";

export default function EV07BPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("stock");

  // Realtime subscriptions for live updates
  useDeviceRealtime();
  useAlertsRealtime();

  // Device stats
  const { data: stats } = useDeviceStockStats();

  // Open alerts count
  const { data: openAlerts } = useQuery({
    queryKey: ["ev07b-open-alerts-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("alert_type", "device_offline")
        .in("status", ["incoming", "in_progress"]);

      if (error) throw error;
      return count || 0;
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-primary" />
            {t("adminEV07B.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("adminEV07B.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/settings?tab=pricing")}>
          <Settings className="w-4 h-4 mr-2" />
          {t("adminEV07B.managePricing")}
          <ExternalLink className="w-3 h-3 ml-2" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("adminEV07B.inStock")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats?.in_stock ?? 0}</span>
              <span className="text-sm text-muted-foreground">
                / {stats?.total ?? 0} {t("adminEV07B.totalSuffix")}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("adminEV07B.liveDevices")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-2xl font-bold text-green-600">{stats?.live ?? 0}</span>
              <span className="text-sm text-muted-foreground">{t("adminEV07B.activeMembers")}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("adminEV07B.openAlerts")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${openAlerts && openAlerts > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              <span className={`text-2xl font-bold ${openAlerts && openAlerts > 0 ? "text-destructive" : ""}`}>
                {openAlerts ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">{t("adminEV07B.offlineAlerts")}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("adminEV07B.pendantPrice")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">€{getPendantFinalPrice(1).toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">{t("adminEV07B.inclIva")}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stock">
            <Smartphone className="w-4 h-4 mr-2" />
            {t("adminEV07B.tabs.stock")}
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <AlertTriangle className="w-4 h-4 mr-2" />
            {t("adminEV07B.tabs.alerts")}
            {openAlerts && openAlerts > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                {openAlerts}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="costs">
            <DollarSign className="w-4 h-4 mr-2" />
            {t("adminEV07B.tabs.costs")}
          </TabsTrigger>
        </TabsList>

        {/* Stock Tab */}
        <TabsContent value="stock" className="mt-4 space-y-6">
          <DeviceStockSection />
          <DeviceApiKeyConfig />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="mt-4">
          <DeviceAlertsPanel />
        </TabsContent>

        {/* Costs Tab */}
        <TabsContent value="costs" className="mt-4">
          <OperationalCostsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
