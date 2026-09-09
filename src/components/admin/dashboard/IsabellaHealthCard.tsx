import { formatDistanceToNow } from "date-fns";
import { Bot, BotOff, CircleAlert, CircleCheck, CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/formatDate";
import {
  summariseError,
  type IsabellaHealthLevel,
  type IsabellaHealthReason,
} from "@/lib/isabellaHealth";
import { useIsabellaHealth } from "@/hooks/useIsabellaHealth";
import { cn } from "@/lib/utils";

/**
 * Isabella's health, on the admin dashboard — the card that replaces `IsabellaStatusBanner`.
 *
 * The banner was a full-width Alert that read ISABELLA ACTIVE whenever any switch in
 * `isabella_settings` was on, and listed the forty-odd enabled function names underneath. It was
 * green and reassuring on 8 Sep while every call was failing on a zero Anthropic balance. It is
 * gone: the verdict now comes from `ai_runs` alone (see src/lib/isabellaHealth.ts), and this file
 * imports nothing that can read a setting.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL (WCAG AA). Each level carries its own word — Healthy /
 * Degraded / Down — its own icon, and a sentence saying why. The status block is a live region,
 * so a screen reader hears the change on the 60s refresh rather than only on a page load.
 */

const LEVEL_STYLES: Record<IsabellaHealthLevel, { card: string; text: string; icon: typeof Bot }> = {
  green: { card: "border-green-500/50 bg-green-500/5", text: "text-green-600", icon: CircleCheck },
  amber: { card: "border-amber-500/50 bg-amber-500/5", text: "text-amber-600", icon: CircleAlert },
  red: { card: "border-destructive/50 bg-destructive/5", text: "text-destructive", icon: BotOff },
};

export function IsabellaHealthCard() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useIsabellaHealth();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("isabella.health.title", "Isabella")}</CardTitle>
          <Bot className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    );
  }

  // A read that failed is shown as UNKNOWN, never as healthy. This is the one state the pure
  // verdict cannot produce: with no rows we cannot say anything about the runs, and a card that
  // guessed green here would be the same lie as the banner's, arrived at differently.
  if (isError || !data) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("isabella.health.title", "Isabella")}</CardTitle>
          <CircleHelp className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div role="status" className="text-2xl font-bold text-destructive">
            {t("isabella.health.unknown", "Unknown")}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("isabella.health.readFailed", "Could not read Isabella's run history.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const style = LEVEL_STYLES[data.level];
  const Icon = style.icon;

  // Written out as literal `t()` calls with English defaults rather than looked up through a
  // variable key: a variable key is invisible to the extractor in
  // src/test/i18nKeyCoverage.test.ts, and a `t()` with a default can never render a dotted key.
  const statusLabel =
    data.level === "green"
      ? t("isabella.health.healthy", "Healthy")
      : data.level === "amber"
        ? t("isabella.health.degraded", "Degraded")
        : t("isabella.health.down", "Down");

  const reasonText: Record<IsabellaHealthReason, string> = {
    failing: t(
      "isabella.health.reason.failing",
      "Runs are failing and none has succeeded in the last hour.",
    ),
    noRunEver: t("isabella.health.reason.noRunEver", "No run has ever completed."),
    stale: t("isabella.health.reason.stale", "No successful run in over 24 hours."),
    intermittent: t(
      "isabella.health.reason.intermittent",
      "Some runs are failing, but others are completing.",
    ),
    notToday: t("isabella.health.reason.notToday", "The last successful run was before today."),
    healthy: t(
      "isabella.health.reason.healthy",
      "Runs are completing and none has failed in the last hour.",
    ),
  };

  const lastRun = data.never
    ? t("isabella.health.never", "Never")
    : `${formatDistanceToNow(data.lastCompletedAt as Date, { addSuffix: true })} · ${formatDate(
        data.lastCompletedAt,
        "d MMM HH:mm",
      )}`;

  const errorText = summariseError(data.commonestError);

  return (
    <Card className={style.card}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{t("isabella.health.title", "Isabella")}</CardTitle>
        <Icon className={cn("h-4 w-4", style.text)} />
      </CardHeader>
      <CardContent className="space-y-1">
        <div role="status" aria-live="polite" className={cn("text-2xl font-bold", style.text)}>
          {statusLabel}
        </div>
        <p className="text-xs text-muted-foreground">{reasonText[data.reason]}</p>
        <p className="text-xs">
          <span className="text-muted-foreground">
            {t("isabella.health.lastRun", "Last successful run")}:{" "}
          </span>
          <span className="font-medium">{lastRun}</span>
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">
            {t("isabella.health.errors", "Errors ({{minutes}} min)", { minutes: data.windowMinutes })}:{" "}
          </span>
          <span className={cn("font-medium", data.errorsLast60Min > 0 && "text-destructive")}>
            {data.errorsLast60Min}
          </span>
        </p>
        {errorText && (
          // `title` keeps the full text reachable; the card shows the front of it, which is where
          // Anthropic puts the part that says what to do.
          <p className="text-xs text-destructive break-words" title={data.commonestError ?? undefined}>
            {errorText}
          </p>
        )}
        <Link
          to="/admin/ai/operations"
          className="inline-block pt-1 text-xs font-medium text-primary hover:underline"
        >
          {t("common.manage", "Manage")}
        </Link>
      </CardContent>
    </Card>
  );
}
