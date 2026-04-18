import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, Share2, Video, Mail, Loader2 } from "lucide-react";
import { useFailedActions, FailedAction } from "@/hooks/useFailedActions";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";
import { formatDistanceToNow } from "date-fns";
import { es, enGB } from "date-fns/locale";

function SystemIcon({ system }: { system: FailedAction["system"] }) {
  switch (system) {
    case "media": return <Share2 className="h-4 w-4 text-blue-500" />;
    case "video": return <Video className="h-4 w-4 text-purple-500" />;
    case "outreach": return <Mail className="h-4 w-4 text-orange-500" />;
  }
}

function SystemBadge({ system }: { system: FailedAction["system"] }) {
  const { t } = useTranslation();
  const labels = {
    media: t("dashboard.failedActions.systemMedia"),
    video: t("dashboard.failedActions.systemVideo"),
    outreach: t("dashboard.failedActions.systemOutreach"),
  };
  return <Badge variant="outline" className="gap-1 text-xs"><SystemIcon system={system} />{labels[system]}</Badge>;
}

export function FailedActionsCard() {
  const { t, i18n: i18nInstance } = useTranslation();
  const dateLocale = i18nInstance.language === "es" ? es : enGB;
  const { failedActions, isLoading, retryAction, retryAll, failedCount } = useFailedActions();
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetry = async (action: FailedAction) => {
    setRetrying(prev => new Set(prev).add(action.id));
    try {
      await retryAction(action);
      toast({
        title: i18n.t("dashboard.failedActions.retryStarted"),
        description: action.title,
      });
    } catch (err: any) {
      toast({
        title: i18n.t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRetrying(prev => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    try {
      await retryAll();
      toast({
        title: i18n.t("dashboard.failedActions.retryAllStarted"),
        description: i18n.t("dashboard.failedActions.retryAllDesc", { count: failedCount }),
      });
    } catch (err: any) {
      toast({
        title: i18n.t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRetryingAll(false);
    }
  };

  if (!isLoading && failedCount === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle><Skeleton className="h-5 w-40" /></CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t("dashboard.failedActions.title")}
            <Badge variant="destructive">{failedCount}</Badge>
          </CardTitle>
          {failedCount > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="gap-1"
            >
              {retryingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("dashboard.failedActions.retryAll")}
            </Button>
          )}
        </div>
        <CardDescription>{t("dashboard.failedActions.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {failedActions.slice(0, 10).map(action => (
            <div key={action.id} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <SystemIcon system={action.system} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{action.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{action.error}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(action.failed_at), { addSuffix: true, locale: dateLocale })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SystemBadge system={action.system} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRetry(action)}
                  disabled={retrying.has(action.id)}
                  className="gap-1"
                >
                  {retrying.has(action.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  {t("dashboard.failedActions.retry")}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {failedCount > 10 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            {t("dashboard.failedActions.moreItems", { count: failedCount - 10 })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
