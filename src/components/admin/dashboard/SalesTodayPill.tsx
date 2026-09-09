import { AlertCircle, Brain, Clock, CreditCard, Handshake, ListTodo, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { EMPTY_SALES_STATS, useSalesCommandStats } from "@/hooks/useSalesCommandStats";
import { cn } from "@/lib/utils";

/**
 * Today's takings as a HEADER PILL — Lee's dashboard correction (9 Sep).
 *
 * This was `SalesCommandStrip`, a six-tile panel occupying two thirds of a row of its own
 * directly under the title. It is now a pill on the header line, and the six figures moved
 * into the popover behind it.
 *
 * WHAT THE PILL SAYS AND WHY. Today's paid total and the order count, in that order, because
 * the amount is the number anyone glancing at a dashboard is looking for and the count gives
 * it scale — "€480 · 3 orders" is a different morning from "€480 · 24 orders".
 *
 * A FAILED READ IS NOT A QUIET ZERO. `€0 · 0 orders` is a true and common statement, so it
 * cannot also be what a broken RPC looks like: an error renders its own pill saying so. That
 * distinction is the whole reason this is not `stats ?? 0` at the render site.
 *
 * Header height by construction: `h-9` (36px), matching IsabellaHealthPill so the two sit
 * level on the title line.
 */

const PILL_BASE =
  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors";

/** Whole euros. Cents on a dashboard glance are noise, and the popover carries the detail. */
const euros = (amount: number) => `€${Math.round(amount).toLocaleString()}`;

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function SalesTodayPill() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useSalesCommandStats();

  if (isLoading) {
    return (
      <div className={cn(PILL_BASE, "border-border bg-muted/30")}>
        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn(PILL_BASE, "border-destructive/40 bg-destructive/5")}>
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        <span role="status" className="whitespace-nowrap text-destructive">
          {t("salesPill.failed", "Sales stats unavailable")}
        </span>
      </div>
    );
  }

  const s = data ?? EMPTY_SALES_STATS;
  const madeSales = s.paid_sales_today > 0;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          PILL_BASE,
          madeSales
            ? "border-green-500/40 bg-green-500/5 hover:bg-green-500/10"
            : "border-border bg-muted/30 hover:bg-muted/50",
        )}
        aria-label={t("salesPill.label", "Today's sales — open detail")}
      >
        <CreditCard
          className={cn("h-3.5 w-3.5", madeSales ? "text-green-600" : "text-muted-foreground")}
        />
        <span className="whitespace-nowrap">
          <span className="text-muted-foreground">{t("salesPill.today", "Sales today")}</span>
          {" · "}
          <span className={cn("font-semibold", madeSales && "text-green-600")}>
            {euros(s.paid_amount_today)}
          </span>
          {" · "}
          <span>
            {t("salesPill.orders", "{{count}} orders", { count: s.paid_sales_today })}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <p className="text-sm font-semibold">{t("salesPill.heading", "Sales")}</p>
        <div className="space-y-1.5">
          <DetailRow
            icon={CreditCard}
            label={t("salesPill.paidToday", "Paid today")}
            value={`${s.paid_sales_today} · ${euros(s.paid_amount_today)}`}
          />
          <DetailRow
            icon={Clock}
            label={t("salesPill.last60", "Last 60 min")}
            value={`${s.paid_sales_60min} · ${euros(s.paid_amount_60min)}`}
          />
          <DetailRow
            icon={ListTodo}
            label={t("salesPill.followups", "Follow-ups pending")}
            value={String(s.followups_pending)}
          />
        </div>
        {/*
          The other three figures the strip used to show. Lee's popover spec names today, the
          hour and pending; these were on screen a moment ago and cost nothing extra (same
          RPC), so they are kept below the fold of the popover rather than dropped silently.
        */}
        <div className="space-y-1.5 border-t pt-2">
          <DetailRow
            icon={Users}
            label={t("salesPill.newSubs", "New subscriptions")}
            value={String(s.new_subscriptions)}
          />
          <DetailRow
            icon={Handshake}
            label={t("salesPill.partnerSignups", "Partner signups")}
            value={String(s.partner_signups)}
          />
          <DetailRow
            icon={Brain}
            label={t("salesPill.aiHot", "AI hot items")}
            value={String(s.ai_hot_items)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
