import { useState, useEffect } from "react";
import { Search, Filter, Clock, AlertTriangle, CheckCircle, PhoneCall, Volume2, VolumeX, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAlerts, EnrichedAlert } from "@/hooks/useAlerts";
import { AlertDetailPanel } from "@/components/call-centre/AlertDetailPanel";
import { MemberQuickSearch } from "@/components/call-centre/MemberQuickSearch";
import { AlertCard } from "@/components/dashboard/AlertCard";
import { MessagesPanel } from "@/components/call-centre/MessagesPanel";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

type AlertTabValue = "all" | "incoming" | "in_progress" | "escalated";
type MainTab = "alerts" | "messages";

export default function CallCentreDashboard() {
  const { t } = useTranslation();
  const { alerts, isLoading, claimAlert, resolveAlert, escalateAlert } = useAlerts();
  const [mainTab, setMainTab] = useState<MainTab>("alerts");
  const [activeTab, setActiveTab] = useState<AlertTabValue>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<EnrichedAlert | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch unread message count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      const { count } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "pending"]);
      setUnreadMessageCount(count || 0);
    };
    fetchUnreadCount();

    const channel = supabase
      .channel("unread-messages-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchUnreadCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredAlerts = alerts.filter((alert) => {
    const matchesTab = activeTab === "all" || alert.status === activeTab;
    const matchesSearch = 
      alert.memberName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.location?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const alertCounts = {
    all: alerts.length,
    incoming: alerts.filter(a => a.status === "incoming").length,
    in_progress: alerts.filter(a => a.status === "in_progress").length,
    escalated: alerts.filter(a => a.status === "escalated").length,
  };

  const handleClaimAlert = async (alertId: string) => {
    const enrichedAlert = await claimAlert(alertId);
    if (enrichedAlert) {
      setSelectedAlert(enrichedAlert);
      setIsDetailOpen(true);
    }
  };

  const handleResolveAlert = async (alertId: string, notes: string) => {
    await resolveAlert(alertId, notes);
    setSelectedAlert(null);
    setIsDetailOpen(false);
  };

  const handleEscalateAlert = async (alertId: string) => {
    await escalateAlert(alertId);
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Status Bar */}
      <div className="bg-accent/50 border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Main Tab Switcher */}
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
            <TabsList>
              <TabsTrigger value="alerts" className="gap-2">
                <AlertTriangle className="w-4 h-4" />
                {t("callCentre.tabs.alerts")}
                {alertCounts.incoming > 0 && (
                  <Badge className="ml-1 h-5 px-1.5 bg-alert-sos">{alertCounts.incoming}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                {t("callCentre.tabs.messages")}
                {unreadMessageCount > 0 && (
                  <Badge className="ml-1 h-5 px-1.5 bg-blue-500">{unreadMessageCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {mainTab === "alerts" && (
            <>
              <Badge variant="outline" className={cn(
                "bg-alert-sos/10 text-alert-sos border-alert-sos/30",
                alertCounts.incoming > 0 && "animate-pulse"
              )}>
                <AlertTriangle className="w-3 h-3 mr-1" />
                {t("callCentre.status.incoming", { count: alertCounts.incoming })}
              </Badge>
              <Badge variant="outline" className="bg-alert-battery/10 text-alert-battery border-alert-battery/30">
                <Clock className="w-3 h-3 mr-1" />
                {t("callCentre.status.inProgress", { count: alertCounts.in_progress })}
              </Badge>
              {alertCounts.escalated > 0 && (
                <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {t("callCentre.status.escalated", { count: alertCounts.escalated })}
                </Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn(!soundEnabled && "text-muted-foreground")}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {mainTab === "alerts" ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Alert Queue */}
          <div className="flex-1 border-r flex flex-col">
            {/* Search and Filters */}
            <div className="p-4 border-b bg-background/50 space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder={t("callCentre.search.placeholder")}
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AlertTabValue)}>
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                  <TabsTrigger value="all" className="gap-1">
                    {t("callCentre.filters.all")}
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">{alertCounts.all}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="incoming" className="gap-1">
                    {t("callCentre.filters.incoming")}
                    <Badge className={cn("ml-1 h-5 px-1.5", alertCounts.incoming > 0 ? "bg-alert-sos" : "bg-muted text-muted-foreground")}>
                      {alertCounts.incoming}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="in_progress" className="gap-1">
                    {t("callCentre.filters.inProgress")}
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">{alertCounts.in_progress}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="escalated" className="gap-1">
                    {t("callCentre.filters.escalated")}
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">{alertCounts.escalated}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Alert List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p>{t("callCentre.empty.loading")}</p>
                </div>
              ) : filteredAlerts.length > 0 ? (
                filteredAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    id={alert.id}
                    type={alert.type}
                    status={alert.status}
                    memberName={alert.memberName}
                    location={alert.location}
                    medicalConditions={alert.medicalConditions}
                    receivedAt={alert.receivedAt}
                    onClaim={() => handleClaimAlert(alert.id)}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-30 text-status-active" />
                  <p className="text-lg font-medium">{t("callCentre.empty.allClear")}</p>
                  <p className="text-sm">{t("callCentre.empty.noAlerts")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Member Quick Search Panel */}
          <div className="w-80 bg-muted/30 p-4 hidden lg:flex flex-col">
            <MemberQuickSearch />
            
            <div className="mt-auto pt-4 border-t">
              <h4 className="text-sm font-medium mb-3">{t("callCentre.quickActions.title")}</h4>
              <div className="space-y-2">
                <Button variant="destructive" className="w-full justify-start gap-2">
                  <PhoneCall className="h-4 w-4" />
                  {t("callCentre.quickActions.callEmergency")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <MessagesPanel />
        </div>
      )}

      {/* Alert Detail Panel */}
      <AlertDetailPanel
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedAlert(null);
        }}
        alert={selectedAlert}
        onResolve={handleResolveAlert}
        onEscalate={handleEscalateAlert}
      />
    </div>
  );
}