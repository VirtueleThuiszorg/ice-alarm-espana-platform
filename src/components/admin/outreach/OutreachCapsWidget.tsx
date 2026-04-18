import { useTranslation } from "react-i18next";
import { AlertCircle, Clock, CheckCircle, Zap, Mail, Star, Search, Users, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useOutreachCaps } from "@/hooks/useOutreachCaps";
import { format, formatDistanceToNow } from "date-fns";
import { es, enGB } from "date-fns/locale";

interface UsageBarProps {
  icon: React.ReactNode;
  label: string;
  used: number;
  max: number;
  enabled: boolean;
}

function UsageBar({ icon, label, used, max, enabled }: UsageBarProps) {
  const { t } = useTranslation();
  const percentage = enabled ? Math.min(100, (used / max) * 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={isAtLimit ? "text-destructive font-medium" : ""}>
            {used}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">
            {enabled ? max : t("outreach.caps.unlimited")}
          </span>
        </div>
      </div>
      {enabled && (
        <Progress
          value={percentage}
          className={`h-2 ${isAtLimit ? "[&>div]:bg-destructive" : isNearLimit ? "[&>div]:bg-yellow-500" : ""}`}
        />
      )}
    </div>
  );
}

export function OutreachCapsWidget() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;
  const { settings, usage, isLoading, getNextResetTime } = useOutreachCaps();

  const nextReset = getNextResetTime();
  const timeUntilReset = formatDistanceToNow(nextReset, { addSuffix: false });

  // Check for any reached caps
  const capsStatus = [
    { key: "qualified", used: usage.qualified, cap: settings.max_qualified_per_day, label: t("outreach.caps.qualifiedLabel") },
    { key: "ratings", used: usage.ai_ratings, cap: settings.max_ai_ratings_per_day, label: t("outreach.caps.ratingsLabel") },
    { key: "research", used: usage.ai_research, cap: settings.max_ai_research_per_day, label: t("outreach.caps.researchLabel") },
    { key: "emails", used: usage.ai_emails, cap: settings.max_ai_emails_per_day, label: t("outreach.caps.emailsLabel") },
    { key: "sent", used: usage.emails_sent, cap: settings.max_emails_per_inbox_per_day, label: t("outreach.caps.emailsSentLabel") },
  ];

  const reachedCaps = capsStatus.filter(
    (c) => c.cap.enabled && c.used >= c.cap.value
  );

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      {/* Warning Banners */}
      {reachedCaps.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("outreach.caps.capsReachedTitle")}</AlertTitle>
          <AlertDescription>
            {reachedCaps.map((c) => c.label).join(", ")} {t("outreach.caps.capsReachedDesc")}
            <span className="font-medium ml-1">
              {t("outreach.caps.resetsIn", { time: timeUntilReset })}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Usage Dashboard */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {t("outreach.caps.dailyUsage")}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {t("outreach.caps.resetsIn", { time: timeUntilReset })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar
            icon={<Users className="h-4 w-4 text-green-500" />}
            label={t("outreach.caps.qualifiedLabel")}
            used={usage.qualified}
            max={settings.max_qualified_per_day.value}
            enabled={settings.max_qualified_per_day.enabled}
          />
          <UsageBar
            icon={<Star className="h-4 w-4 text-yellow-500" />}
            label={t("outreach.caps.ratingsLabel")}
            used={usage.ai_ratings}
            max={settings.max_ai_ratings_per_day.value}
            enabled={settings.max_ai_ratings_per_day.enabled}
          />
          <UsageBar
            icon={<Search className="h-4 w-4 text-blue-500" />}
            label={t("outreach.caps.researchLabel")}
            used={usage.ai_research}
            max={settings.max_ai_research_per_day.value}
            enabled={settings.max_ai_research_per_day.enabled}
          />
          <UsageBar
            icon={<Mail className="h-4 w-4 text-purple-500" />}
            label={t("outreach.caps.emailsLabel")}
            used={usage.ai_emails}
            max={settings.max_ai_emails_per_day.value}
            enabled={settings.max_ai_emails_per_day.enabled}
          />
          <UsageBar
            icon={<Send className="h-4 w-4 text-emerald-500" />}
            label={t("outreach.caps.emailsSentLabel")}
            used={usage.emails_sent}
            max={settings.max_emails_per_inbox_per_day.value}
            enabled={settings.max_emails_per_inbox_per_day.enabled}
          />

          {/* Status indicator */}
          <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>{t("outreach.caps.allSystemsGo")}</span>
            </div>
            <span>{format(new Date(), "d MMM yyyy", { locale: dateLocale })}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
