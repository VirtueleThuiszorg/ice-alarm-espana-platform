import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, CheckCircle, Send, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PostMetricsBarProps {
  metrics: {
    draft: number;
    approved: number;
    published: number;
    failed: number;
  } | undefined;
  isLoading: boolean;
}

export function PostMetricsBar({ metrics, isLoading }: PostMetricsBarProps) {
  const { t } = useTranslation();

  const items = [
    {
      key: "draft",
      label: t("mediaManager.metrics.drafts"),
      value: metrics?.draft ?? 0,
      icon: FileText,
      colorClass: "text-muted-foreground",
      bgClass: "bg-muted/50",
    },
    {
      key: "approved",
      label: t("mediaManager.metrics.approved"),
      value: metrics?.approved ?? 0,
      icon: CheckCircle,
      colorClass: "text-status-active",
      bgClass: "bg-status-active/10",
    },
    {
      key: "published",
      label: t("mediaManager.metrics.published"),
      value: metrics?.published ?? 0,
      icon: Send,
      colorClass: "text-primary",
      bgClass: "bg-primary/10",
    },
    {
      key: "failed",
      label: t("mediaManager.metrics.failed"),
      value: metrics?.failed ?? 0,
      icon: AlertCircle,
      colorClass: "text-destructive",
      bgClass: "bg-destructive/10",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.key} className={cn("border", item.bgClass)}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", item.bgClass)}>
                <Icon className={cn("h-5 w-5", item.colorClass)} />
              </div>
              <div>
                <p className={cn("text-2xl font-bold", item.colorClass)}>
                  {item.value}
                </p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
