import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMemberAlerts } from "@/hooks/useMemberProfile";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Loader2,
  Bell, 
  AlertTriangle, 
  Activity, 
  MapPin, 
  Battery, 
  CheckCircle,
  Clock,
  Filter,
  Calendar,
  Shield
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const ALERT_CONFIG = {
  sos_button: { 
    icon: AlertTriangle, 
    labelKey: "alerts.sosAlert", 
    color: "bg-alert-sos text-alert-sos-foreground",
    bgLight: "bg-alert-sos/10"
  },
  fall_detected: { 
    icon: Activity, 
    labelKey: "alerts.fallDetected", 
    color: "bg-alert-fall text-alert-fall-foreground",
    bgLight: "bg-alert-fall/10"
  },
  geo_fence: { 
    icon: MapPin, 
    labelKey: "alerts.geoFenceAlert", 
    color: "bg-alert-battery text-alert-battery-foreground",
    bgLight: "bg-alert-battery/10"
  },
  low_battery: { 
    icon: Battery, 
    labelKey: "alerts.lowBattery", 
    color: "bg-alert-checkin text-alert-checkin-foreground",
    bgLight: "bg-alert-checkin/10"
  },
  check_in: { 
    icon: CheckCircle, 
    labelKey: "alerts.checkIn", 
    color: "bg-muted text-muted-foreground",
    bgLight: "bg-muted"
  },
};

type AlertType = keyof typeof ALERT_CONFIG | "all";
type AlertStatus = "all" | "resolved" | "incoming" | "in_progress";

export default function AlertHistoryPage() {
  const { t } = useTranslation();
  const { data: alerts, isLoading } = useMemberAlerts();
  const [typeFilter, setTypeFilter] = useState<AlertType>("all");
  const [statusFilter, setStatusFilter] = useState<AlertStatus>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filteredAlerts = useMemo(() => alerts?.filter(alert => {
    const matchesType = typeFilter === "all" || alert.alert_type === typeFilter;
    const matchesStatus = statusFilter === "all" || alert.status === statusFilter;
    return matchesType && matchesStatus;
  }) || [], [alerts, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paginatedAlerts = filteredAlerts.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const alertCounts = {
    total: alerts?.length || 0,
    resolved: alerts?.filter(a => a.status === "resolved").length || 0,
    pending: alerts?.filter(a => a.status !== "resolved").length || 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("alerts.alertHistory")}</h1>
          <p className="text-muted-foreground mt-1">{t("alertHistory.subtitle")}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{alertCounts.total}</p>
                <p className="text-sm text-muted-foreground">{t("alertHistory.totalAlerts")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-alert-resolved/10 to-alert-resolved/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-alert-resolved/20 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-alert-resolved" />
              </div>
              <div>
                <p className="text-2xl font-bold">{alertCounts.resolved}</p>
                <p className="text-sm text-muted-foreground">{t("alerts.resolved")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-alert-battery/10 to-alert-battery/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-alert-battery/20 flex items-center justify-center">
                <Clock className="h-5 w-5 text-alert-battery" />
              </div>
              <div>
                <p className="text-2xl font-bold">{alertCounts.pending}</p>
                <p className="text-sm text-muted-foreground">{t("common.pending")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("common.filter")}:</span>
            </div>
            <div className="flex flex-1 gap-3 flex-wrap">
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as AlertType); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t("alertHistory.allTypes")} />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  <SelectItem value="all">{t("alertHistory.allTypes")}</SelectItem>
                  <SelectItem value="sos_button">{t("alerts.sosAlert")}</SelectItem>
                  <SelectItem value="fall_detected">{t("alerts.fallDetected")}</SelectItem>
                  <SelectItem value="geo_fence">{t("alerts.geoFenceAlert")}</SelectItem>
                  <SelectItem value="low_battery">{t("alerts.lowBattery")}</SelectItem>
                  <SelectItem value="check_in">{t("alerts.checkIn")}</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as AlertStatus); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t("alertHistory.allStatuses")} />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  <SelectItem value="all">{t("alertHistory.allStatuses")}</SelectItem>
                  <SelectItem value="resolved">{t("alerts.resolved")}</SelectItem>
                  <SelectItem value="incoming">{t("alerts.incoming")}</SelectItem>
                  <SelectItem value="in_progress">{t("alerts.inProgress")}</SelectItem>
                </SelectContent>
              </Select>

              {(typeFilter !== "all" || statusFilter !== "all") && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setPage(1); }}
                >
                  {t("common.clear")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-20 w-20 mx-auto bg-muted rounded-full flex items-center justify-center mb-6">
              <Shield className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-xl mb-2">{t("alertHistory.noAlerts")}</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t("alertHistory.noAlertsDesc")}
            </p>
            <div className="mt-6 p-4 bg-alert-resolved/10 rounded-lg inline-flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-alert-resolved" />
              <span className="text-sm font-medium text-alert-resolved">{t("alertHistory.allClear")}</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedAlerts.map((alert) => {
            const config = ALERT_CONFIG[alert.alert_type as keyof typeof ALERT_CONFIG] 
              || ALERT_CONFIG.check_in;
            const Icon = config.icon;
            const isResolved = alert.status === "resolved";

            return (
              <Card key={alert.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex">
                    {/* Left color stripe */}
                    <div className={cn("w-1.5 shrink-0", config.color.split(" ")[0])} />
                    
                    <div className="flex-1 p-5">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                          config.bgLight
                        )}>
                          <Icon className={cn("h-6 w-6", config.color.split(" ")[1])} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <h4 className="font-semibold text-lg">{t(config.labelKey)}</h4>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{format(new Date(alert.received_at), "EEEE, dd MMMM yyyy")}</span>
                                <span>•</span>
                                <Clock className="h-3.5 w-3.5" />
                                <span>{format(new Date(alert.received_at), "HH:mm")}</span>
                              </div>
                            </div>
                            <Badge 
                              className={cn(
                                "shrink-0",
                                isResolved 
                                  ? "bg-alert-resolved text-alert-resolved-foreground" 
                                  : "bg-alert-battery text-alert-battery-foreground"
                              )}
                            >
                              {isResolved ? (
                                <><CheckCircle className="h-3 w-3 mr-1" />{t("alerts.resolved")}</>
                              ) : (
                                <><Clock className="h-3 w-3 mr-1" />{alert.status}</>
                              )}
                            </Badge>
                          </div>
                          
                          {/* Location */}
                          {alert.location_address && (
                            <div className="flex items-start gap-2 mt-3 p-3 bg-muted/50 rounded-lg">
                              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <span className="text-sm">{alert.location_address}</span>
                            </div>
                          )}
                          
                          {/* Resolution info */}
                          {isResolved && alert.resolved_at && (
                            <div className="flex items-center gap-2 mt-3 text-sm text-alert-resolved">
                              <CheckCircle className="h-4 w-4" />
                              <span>
                                {t("alertHistory.resolvedIn")} {formatDistanceToNow(new Date(alert.received_at), { addSuffix: false })}
                              </span>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {t("common.showingXofY", "Showing {{from}} to {{to}} of {{total}}", {
                  from: ((clampedPage - 1) * PAGE_SIZE) + 1,
                  to: Math.min(clampedPage * PAGE_SIZE, filteredAlerts.length),
                  total: filteredAlerts.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={clampedPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("common.previous", "Previous")}
                </Button>
                <span className="text-sm">
                  {t("common.pageXofY", "Page {{page}} of {{total}}", { page: clampedPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={clampedPage === totalPages}
                >
                  {t("common.next", "Next")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Understanding Your Alerts */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">{t("alertHistory.understandingAlerts")}</CardTitle>
          <CardDescription>{t("alertHistory.understandingAlertsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(ALERT_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", config.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{t(config.labelKey)}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(`alertHistory.${key}Desc`)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}