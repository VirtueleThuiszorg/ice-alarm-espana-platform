import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbulb, Plus, MessageSquare, TrendingUp } from "lucide-react";
import { useLeadTopicInsights, TopicInsight } from "@/hooks/useLeadTopicInsights";
import { useMediaTopics } from "@/hooks/useMediaStrategy";
import { useState } from "react";

export function LeadInsightsCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useLeadTopicInsights();
  const { createTopic } = useMediaTopics();
  const [addingIndex, setAddingIndex] = useState<number | null>(null);

  const handleAddAsTopic = async (insight: TopicInsight, index: number) => {
    setAddingIndex(index);
    try {
      await createTopic({
        name: insight.topic,
        description: `${insight.description} (${t("mediaStrategy.insights.suggestedAngle")}: ${insight.suggested_angle})`,
      });
    } catch {
      // Hook already shows error toast
    } finally {
      setAddingIndex(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            <Skeleton className="h-5 w-48" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.insights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            {t("mediaStrategy.insights.title")}
          </CardTitle>
          <CardDescription>{t("mediaStrategy.insights.noData")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          {t("mediaStrategy.insights.title")}
        </CardTitle>
        <CardDescription>
          {t("mediaStrategy.insights.subtitle", { count: data.analyzed_count, days: data.period_days })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.insights.map((insight, index) => (
            <div key={index} className="p-3 border rounded-lg space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{insight.topic}</p>
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <MessageSquare className="h-3 w-3" />
                      {insight.frequency}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddAsTopic(insight, index)}
                  disabled={addingIndex === index}
                  className="gap-1 shrink-0"
                >
                  <Plus className="h-3 w-3" />
                  {t("mediaStrategy.insights.addTopic")}
                </Button>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                <span className="italic">{insight.suggested_angle}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
