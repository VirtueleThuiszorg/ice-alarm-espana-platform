import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star,
  Minus,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Loader2,
  MessageSquare,
  BarChart3,
  Filter,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays } from "date-fns";

interface FeedbackEntry {
  id: string;
  user_id: string;
  entity_id: string;
  action: string;
  details: {
    rating: number;
    comment: string | null;
    category: string;
    nps_category: "promoter" | "passive" | "detractor";
    submitted_at: string;
  };
  created_at: string;
}

type DateFilter = "7d" | "30d" | "90d" | "all";
type RatingFilter = "all" | "promoter" | "passive" | "detractor";

const NPS_COLORS = {
  promoter: "#22c55e",
  passive: "#eab308",
  detractor: "#ef4444",
};

export default function FeedbackDashboardPage() {
  const { t } = useTranslation();
  const [dateFilter, setDateFilter] = useState<DateFilter>("30d");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all feedback entries from activity_logs
  const {
    data: feedbackEntries,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin-feedback", dateFilter],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .eq("entity_type", "feedback")
        .eq("action", "feedback_submitted")
        .order("created_at", { ascending: false });

      // Date filter
      if (dateFilter !== "all") {
        const days = dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : 90;
        const fromDate = subDays(new Date(), days).toISOString();
        query = query.gte("created_at", fromDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as FeedbackEntry[];
    },
  });

  // Calculate NPS metrics
  const metrics = useMemo(() => {
    if (!feedbackEntries || feedbackEntries.length === 0) {
      return {
        npsScore: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        totalResponses: 0,
        averageRating: 0,
        promoterPercent: 0,
        passivePercent: 0,
        detractorPercent: 0,
      };
    }

    const total = feedbackEntries.length;
    const promoters = feedbackEntries.filter(
      (e) => e.details?.nps_category === "promoter"
    ).length;
    const passives = feedbackEntries.filter(
      (e) => e.details?.nps_category === "passive"
    ).length;
    const detractors = feedbackEntries.filter(
      (e) => e.details?.nps_category === "detractor"
    ).length;

    const promoterPercent = Math.round((promoters / total) * 100);
    const detractorPercent = Math.round((detractors / total) * 100);
    const passivePercent = 100 - promoterPercent - detractorPercent;
    const npsScore = promoterPercent - detractorPercent;

    const avgRating =
      feedbackEntries.reduce(
        (sum, e) => sum + (e.details?.rating ?? 0),
        0
      ) / total;

    return {
      npsScore,
      promoters,
      passives,
      detractors,
      totalResponses: total,
      averageRating: Math.round(avgRating * 10) / 10,
      promoterPercent,
      passivePercent,
      detractorPercent,
    };
  }, [feedbackEntries]);

  // Pie chart data
  const pieData = useMemo(() => {
    return [
      { name: t("feedback.promoters", "Promoters"), value: metrics.promoters, color: NPS_COLORS.promoter },
      { name: t("feedback.passives", "Passives"), value: metrics.passives, color: NPS_COLORS.passive },
      { name: t("feedback.detractors", "Detractors"), value: metrics.detractors, color: NPS_COLORS.detractor },
    ].filter((d) => d.value > 0);
  }, [metrics, t]);

  // Rating distribution chart
  const ratingDistribution = useMemo(() => {
    if (!feedbackEntries) return [];
    const counts = Array(11).fill(0);
    feedbackEntries.forEach((e) => {
      const rating = e.details?.rating;
      if (rating >= 0 && rating <= 10) {
        counts[rating]++;
      }
    });
    return counts.map((count, score) => ({
      score: String(score),
      count,
      fill:
        score >= 9
          ? NPS_COLORS.promoter
          : score >= 7
            ? NPS_COLORS.passive
            : NPS_COLORS.detractor,
    }));
  }, [feedbackEntries]);

  // Filtered feedback list
  const filteredEntries = useMemo(() => {
    if (!feedbackEntries) return [];

    let filtered = feedbackEntries;

    if (ratingFilter !== "all") {
      filtered = filtered.filter(
        (e) => e.details?.nps_category === ratingFilter
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.details?.comment?.toLowerCase().includes(query) ||
          e.details?.category?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [feedbackEntries, ratingFilter, searchQuery]);

  const getNPSBadgeVariant = (
    category: string
  ): "default" | "secondary" | "destructive" => {
    switch (category) {
      case "promoter":
        return "default";
      case "passive":
        return "secondary";
      case "detractor":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getNPSIcon = (category: string) => {
    switch (category) {
      case "promoter":
        return ThumbsUp;
      case "passive":
        return Meh;
      case "detractor":
        return ThumbsDown;
      default:
        return Minus;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {t("feedback.dashboardTitle", "Feedback & NPS")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(
              "feedback.dashboardDescription",
              "Member satisfaction and Net Promoter Score tracking"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={dateFilter}
            onValueChange={(v) => setDateFilter(v as DateFilter)}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("feedback.last7Days", "Last 7 days")}</SelectItem>
              <SelectItem value="30d">{t("feedback.last30Days", "Last 30 days")}</SelectItem>
              <SelectItem value="90d">{t("feedback.last90Days", "Last 90 days")}</SelectItem>
              <SelectItem value="all">{t("feedback.allTime", "All time")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* NPS Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("feedback.npsScore", "NPS Score")}</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <span
                  className={
                    metrics.npsScore >= 50
                      ? "text-green-600"
                      : metrics.npsScore >= 0
                        ? "text-yellow-600"
                        : "text-red-600"
                  }
                >
                  {metrics.npsScore > 0 ? "+" : ""}
                  {metrics.npsScore}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {metrics.npsScore >= 50
                ? t("feedback.excellent", "Excellent")
                : metrics.npsScore >= 0
                  ? t("feedback.good", "Good")
                  : t("feedback.needsImprovement", "Needs improvement")}
            </p>
          </CardContent>
        </Card>

        {/* Average Rating */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("feedback.avgRating", "Average Rating")}</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              {isLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <>
                  {metrics.averageRating}
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t("feedback.outOf10", "out of 10")}
            </p>
          </CardContent>
        </Card>

        {/* Total Responses */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("feedback.totalResponses", "Total Responses")}</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                metrics.totalResponses
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t("feedback.feedbackCollected", "feedback collected")}
            </p>
          </CardContent>
        </Card>

        {/* Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("feedback.breakdown", "Breakdown")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <ThumbsUp className="h-3 w-3" />
                    {t("feedback.promoters", "Promoters")}
                  </span>
                  <span className="font-medium">
                    {metrics.promoters} ({metrics.promoterPercent}%)
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-yellow-600">
                    <Meh className="h-3 w-3" />
                    {t("feedback.passives", "Passives")}
                  </span>
                  <span className="font-medium">
                    {metrics.passives} ({metrics.passivePercent}%)
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-red-600">
                    <ThumbsDown className="h-3 w-3" />
                    {t("feedback.detractors", "Detractors")}
                  </span>
                  <span className="font-medium">
                    {metrics.detractors} ({metrics.detractorPercent}%)
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* NPS Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t("feedback.npsDistribution", "NPS Distribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-[200px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : metrics.totalResponses === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                {t("feedback.noData", "No feedback data yet")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value} (${Math.round((value / metrics.totalResponses) * 100)}%)`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  {d.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rating Distribution Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4" />
              {t("feedback.ratingDistribution", "Rating Distribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-[200px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : metrics.totalResponses === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                {t("feedback.noData", "No feedback data yet")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ratingDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="score" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number) => [value, t("feedback.responses", "Responses")]}
                    labelFormatter={(label) => `${t("feedback.score", "Score")}: ${label}`}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {ratingDistribution.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Feedback Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t("feedback.recentFeedback", "Recent Feedback")}
              </CardTitle>
              <CardDescription>
                {t(
                  "feedback.recentFeedbackDescription",
                  "Individual feedback submissions from members"
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("feedback.searchComments", "Search comments...")}
                className="w-[200px] h-9"
              />
              <Select
                value={ratingFilter}
                onValueChange={(v) => setRatingFilter(v as RatingFilter)}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("feedback.allRatings", "All ratings")}</SelectItem>
                  <SelectItem value="promoter">{t("feedback.promoters", "Promoters")}</SelectItem>
                  <SelectItem value="passive">{t("feedback.passives", "Passives")}</SelectItem>
                  <SelectItem value="detractor">{t("feedback.detractors", "Detractors")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {t("feedback.noFeedbackYet", "No feedback entries found")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">{t("feedback.rating", "Rating")}</TableHead>
                  <TableHead className="w-[100px]">{t("feedback.type", "Type")}</TableHead>
                  <TableHead className="w-[100px]">{t("feedback.category", "Category")}</TableHead>
                  <TableHead>{t("feedback.comment", "Comment")}</TableHead>
                  <TableHead className="w-[140px]">{t("feedback.date", "Date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.slice(0, 50).map((entry) => {
                  const NpsIcon = getNPSIcon(entry.details?.nps_category);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-1 font-medium">
                          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                          {entry.details?.rating ?? "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getNPSBadgeVariant(entry.details?.nps_category)}>
                          <NpsIcon className="h-3 w-3 mr-1" />
                          {entry.details?.nps_category || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm capitalize">
                          {entry.details?.category || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {entry.details?.comment || (
                            <span className="italic opacity-50">
                              {t("feedback.noComment", "No comment")}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {format(
                            new Date(entry.created_at),
                            "MMM d, yyyy HH:mm"
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {filteredEntries.length > 50 && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              {t("feedback.showingFirst50", "Showing first 50 of {{total}} entries", {
                total: filteredEntries.length,
              })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
