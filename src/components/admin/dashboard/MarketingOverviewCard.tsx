import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Share2, Megaphone, Video, TrendingUp, TrendingDown, Minus, Eye, Heart, Mail, MessageSquare, CheckCircle } from "lucide-react";
import { useMarketingAnalytics } from "@/hooks/useMarketingAnalytics";
import { Link } from "react-router-dom";
import { ComponentType } from "react";

function TrendBadge({ value }: { value: number }) {
  if (value > 0) return <Badge variant="secondary" className="text-green-600 bg-green-50 gap-1"><TrendingUp className="h-3 w-3" />+{value}%</Badge>;
  if (value < 0) return <Badge variant="secondary" className="text-red-600 bg-red-50 gap-1"><TrendingDown className="h-3 w-3" />{value}%</Badge>;
  return <Badge variant="secondary" className="text-muted-foreground gap-1"><Minus className="h-3 w-3" />0%</Badge>;
}

function MetricItem({ icon: Icon, label, value, color }: { icon: ComponentType<{ className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <p className="text-lg font-bold">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function MarketingOverviewCard() {
  const { t } = useTranslation();
  const { data: metrics, isLoading } = useMarketingAnalytics(30);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.marketing.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("dashboard.marketing.title")}
        </CardTitle>
        <CardDescription>{t("dashboard.marketing.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Media Manager */}
          <Link to="/admin/media-manager" className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">{t("dashboard.marketing.social")}</span>
              </div>
              <TrendBadge value={metrics.trends.posts} />
            </div>
            <div className="space-y-2">
              <MetricItem icon={Share2} label={t("dashboard.marketing.published")} value={metrics.postsPublished} color="text-blue-500" />
              <MetricItem icon={Eye} label={t("dashboard.marketing.reach")} value={metrics.totalReach} color="text-purple-500" />
              <MetricItem icon={Heart} label={t("dashboard.marketing.engagements")} value={metrics.totalEngagements} color="text-pink-500" />
            </div>
          </Link>

          {/* Outreach */}
          <Link to="/admin/ai-outreach" className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-orange-500" />
                <span className="font-medium text-sm">{t("dashboard.marketing.outreach")}</span>
              </div>
              <TrendBadge value={metrics.trends.emails} />
            </div>
            <div className="space-y-2">
              <MetricItem icon={Mail} label={t("dashboard.marketing.emailsSent")} value={metrics.emailsSent} color="text-orange-500" />
              <MetricItem icon={MessageSquare} label={t("dashboard.marketing.replies")} value={metrics.repliesReceived} color="text-yellow-500" />
              <MetricItem icon={CheckCircle} label={t("dashboard.marketing.conversions")} value={metrics.conversions} color="text-green-500" />
            </div>
          </Link>

          {/* Video Hub */}
          <Link to="/admin/video-hub" className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-purple-500" />
                <span className="font-medium text-sm">{t("dashboard.marketing.video")}</span>
              </div>
              <TrendBadge value={metrics.trends.videos} />
            </div>
            <div className="space-y-2">
              <MetricItem icon={Video} label={t("dashboard.marketing.videosRendered")} value={metrics.videosRendered} color="text-purple-500" />
              <MetricItem icon={CheckCircle} label={t("dashboard.marketing.videosExported")} value={metrics.videosExported} color="text-red-500" />
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
