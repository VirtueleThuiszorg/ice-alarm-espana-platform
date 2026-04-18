import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, FileText, Heart, Eye, Share2, MessageCircle, Loader2, CheckCircle2, XCircle, Wifi } from "lucide-react";
import { AggregatedMetrics, ConnectionStatus } from "@/hooks/usePublishedPosts";

interface PublishedOverviewCardProps {
  metrics: AggregatedMetrics;
  onRefreshAll: () => void;
  isRefreshing: boolean;
  connectionStatus: ConnectionStatus;
  onTestConnection: () => Promise<ConnectionStatus>;
}

export function PublishedOverviewCard({
  metrics,
  onRefreshAll,
  isRefreshing,
  connectionStatus,
  onTestConnection,
}: PublishedOverviewCardProps) {
  const { t } = useTranslation();
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await onTestConnection();
    } finally {
      setIsTesting(false);
    }
  };

  const getConnectionBadge = () => {
    switch (connectionStatus) {
      case "connected":
        return (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
            <CheckCircle2 className="h-3 w-3" />
            {t("mediaManager.published.connection.connected")}
          </Badge>
        );
      case "token_expired":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            {t("mediaManager.published.connection.expired")}
          </Badge>
        );
      case "not_configured":
        return (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="h-3 w-3" />
            {t("mediaManager.published.connection.notConfigured")}
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const statCards = [
    {
      label: t("mediaManager.published.overview.totalPosts"),
      value: metrics.totalPosts,
      icon: FileText,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: t("mediaManager.published.overview.totalReactions"),
      value: formatNumber(metrics.totalReactions),
      icon: Heart,
      color: "text-rose-500",
      bgColor: "bg-rose-500/10",
    },
    {
      label: t("mediaManager.published.overview.totalComments"),
      value: formatNumber(metrics.totalComments),
      icon: MessageCircle,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: t("mediaManager.published.overview.totalShares"),
      value: formatNumber(metrics.totalShares),
      icon: Share2,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: t("mediaManager.published.overview.totalReach"),
      value: formatNumber(metrics.totalReach),
      icon: Eye,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <CardTitle className="text-lg">{t("mediaManager.published.overview.title")}</CardTitle>
              <CardDescription>{t("mediaManager.published.overview.subtitle")}</CardDescription>
            </div>
            {getConnectionBadge()}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {t("mediaManager.published.testConnection")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshAll}
              disabled={isRefreshing || connectionStatus === "token_expired"}
              className="gap-2"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t("mediaManager.published.refreshAll")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center p-3 rounded-lg border bg-card"
            >
              <div className={`p-2 rounded-full ${stat.bgColor} mb-2`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <span className="text-2xl font-bold">{stat.value}</span>
              <span className="text-xs text-muted-foreground text-center">{stat.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
