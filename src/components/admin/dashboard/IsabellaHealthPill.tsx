import { formatDistanceToNow } from "date-fns";
import { Bot, BotOff, CircleAlert, CircleCheck, CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
 * Isabella's health as a HEADER PILL — Lee's dashboard correction (9 Sep).
 *
 * This was a full dashboard card in a row of its own, which pushed the stat tiles down a
 * screenful. It is now a compact pill living on the header line, immediately left of Add
 * Member, and the detail the card used to show inline moved into a popover behind it.
 *
 * The verdict, the data source and the accessibility rules are UNCHANGED from the card. Only
 * the container changed:
 *
 *  - COLOUR IS NEVER THE ONLY SIGNAL (WCAG AA). The dot carries the level, and the pill's own
 *    text carries the word — Healthy / Degraded / Down / Unknown — so a red-green colourblind
 *    reader and a screen reader both get the state without the dot.
 *  - The status text stays a live region, so the 60s refresh is announced rather than only
 *    being visible.
 *  - A read that FAILED shows as Unknown, never as healthy. A pill that guessed green on a
 *    failed read would be the same lie the old ISABELLA ACTIVE banner told, arrived at
 *    differently.
 *
 * Header height by construction: `h-9` (36px) inside the range Lee gave, so the pill sits on
 * the title line without stretching it.
 */

const LEVEL_STYLES: Record<IsabellaHealthLevel, { pill: string; dot: string; text: string; icon: typeof Bot }> = {
  green: {
    pill: "border-green-500/40 bg-green-500/5 hover:bg-green-500/10",
    dot: "bg-green-500",
    text: "text-green-600",
    icon: CircleCheck,
  },
  amber: {
    pill: "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10",
    dot: "bg-amber-500",
    text: "text-amber-600",
    icon: CircleAlert,
  },
  red: {
    pill: "border-destructive/40 bg-destructive/5 hover:bg-destructive/10",
    dot: "bg-destructive",
    text: "text-destructive",
    icon: BotOff,
  },
};

/** Shared shell so the loading, error and healthy pills cannot drift in height. */
const PILL_BASE =
  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors";

export function IsabellaHealthPill() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useIsabellaHealth();

  if (isLoading) {
    return (
      <div className={cn(PILL_BASE, "border-border bg-muted/30")}>
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={cn(PILL_BASE, "border-destructive/40 bg-destructive/5")}>
        <CircleHelp className="h-3.5 w-3.5 text-destructive" />
        <span role="status" aria-live="polite" className="text-destructive">
          {t("isabella.health.title", "Isabella")} · {t("isabella.health.unknown", "Unknown")}
        </span>
      </div>
    );
  }

  const style = LEVEL_STYLES[data.level];
  const Icon = style.icon;

  // Literal `t()` calls with English defaults, not a variable key: a variable key is invisible
  // to the extractor in src/test/i18nKeyCoverage.test.ts, and a `t()` with a default can never
  // render a dotted key at the user.
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

  const lastRunRelative = data.never
    ? t("isabella.health.never", "Never")
    : formatDistanceToNow(data.lastCompletedAt as Date, { addSuffix: true });

  const errorText = summariseError(data.commonestError);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(PILL_BASE, style.pill)}
        aria-label={t("isabella.health.pillLabel", "Isabella status — open detail")}
      >
        {/* The dot is decorative: the word beside it is the signal. */}
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
        <span role="status" aria-live="polite" className={cn("whitespace-nowrap", style.text)}>
          {t("isabella.health.title", "Isabella")} · {statusLabel}
        </span>
        <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">
          · {lastRunRelative}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", style.text)} />
          <span className={cn("font-semibold", style.text)}>{statusLabel}</span>
        </div>
        <p className="text-xs text-muted-foreground">{reasonText[data.reason]}</p>
        <p className="text-xs">
          <span className="text-muted-foreground">
            {t("isabella.health.lastRun", "Last successful run")}:{" "}
          </span>
          <span className="font-medium">
            {data.never
              ? t("isabella.health.never", "Never")
              : `${lastRunRelative} · ${formatDate(data.lastCompletedAt, "d MMM HH:mm")}`}
          </span>
        </p>
        <p className="text-xs">
          <span className="text-muted-foreground">
            {t("isabella.health.errors", "Errors ({{minutes}} min)", {
              minutes: data.windowMinutes,
            })}
            :{" "}
          </span>
          <span className={cn("font-medium", data.errorsLast60Min > 0 && "text-destructive")}>
            {data.errorsLast60Min}
          </span>
        </p>
        {errorText && (
          // `title` keeps the full text reachable; the front of an Anthropic error is where
          // the part that says what to do lives.
          <p
            className="break-words text-xs text-destructive"
            title={data.commonestError ?? undefined}
          >
            {errorText}
          </p>
        )}
        <Link
          to="/admin/ai/operations"
          className="inline-block pt-1 text-xs font-medium text-primary hover:underline"
        >
          {t("common.manage", "Manage")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
