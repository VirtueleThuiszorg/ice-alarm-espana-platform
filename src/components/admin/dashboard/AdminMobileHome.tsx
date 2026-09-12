import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Bell,
  ChevronRight,
  CreditCard,
  ShieldAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

import { IsabellaHealthPill } from "@/components/admin/dashboard/IsabellaHealthPill";
import { useSalesCommandStats } from "@/hooks/useSalesCommandStats";
import { useMonitoringReadiness } from "@/hooks/useMonitoringReadiness";
import { useNotifications, type NotificationRecord } from "@/hooks/useNotifications";
import { notificationLink } from "@/lib/notificationLink";
import { notificationBody, notificationTitle } from "@/lib/notificationTitles";

/**
 * /admin ON A PHONE — Lee's brief: "the five things I look at, each one tappable".
 *
 * WHY A DIFFERENT LAYOUT RATHER THAN A RESPONSIVE ONE. The desktop dashboard is a six-tile grid
 * plus five widgets. On a 390px screen that is a column of twenty cards: everything present,
 * nothing findable, and the number Lee actually opens his phone for — did anything sell today —
 * is four scrolls down. This renders the five he named, in the order he named them, and each
 * tile is a link to the screen that can act on it. Nothing else.
 *
 * THE SAME DATA AS THE DESKTOP, from the same hooks. `stats` and `alerts` are passed in from
 * AdminDashboard's own queries — the component that already fetched them — so this cannot show a
 * different number from the desktop layout, and switching orientation costs no round trip.
 * `useSalesCommandStats` is the hook behind the desktop's sales pill;
 * `useMonitoringReadiness` is shared with the desktop tile added in the same change;
 * `useNotifications` is the hook behind the bell.
 *
 * A FAILED READ IS NEVER A ZERO. €0 and "no alerts" are true, common, and good news — so
 * neither may be what a broken query looks like. Every tile that can fail says so instead.
 */

export interface AdminMobileHomeProps {
  stats:
    | {
        active_members: number;
        active_alerts: number;
        new_members_30d: number;
      }
    | undefined;
  statsLoading: boolean;
  statsError: boolean;
  /** The open alerts the dashboard already fetched, newest first. */
  alerts: Array<{
    id: string;
    alert_type?: string | null;
    status?: string | null;
    received_at?: string | null;
    member?: { first_name?: string | null; last_name?: string | null } | null;
  }>;
}

const euros = (amount: number) => `€${Math.round(amount).toLocaleString()}`;

/** A tile: one number, one label, and the screen that can do something about it. */
function Tile({
  to,
  icon: Icon,
  label,
  value,
  hint,
  tone,
  loading,
  failed,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone?: "alarm" | "warn";
  loading?: boolean;
  failed?: boolean;
}) {
  return (
    <Link to={to} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      <Card
        className={cn(
          "transition-colors active:bg-muted/60",
          tone === "alarm" && "border-alert-sos/50 bg-alert-sos/5",
          tone === "warn" && "border-amber-500/50 bg-amber-500/5",
        )}
      >
        {/* min-h-16 and the whole card being the target: a 44px tap area is the accessibility
            floor, and a number that needs a precise tap on a phone is a number nobody opens. */}
        <CardContent className="flex min-h-16 items-center gap-3 py-4">
          <Icon
            className={cn(
              "h-5 w-5 shrink-0",
              tone === "alarm" ? "text-alert-sos" : tone === "warn" ? "text-amber-500" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{label}</div>
            {loading ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : failed ? (
              // Not a zero. "€0 today" and "could not read today's takings" are different
              // mornings, and only one of them needs somebody to look at it.
              <div className="flex items-center gap-1 text-sm font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                could not be read
              </div>
            ) : (
              <div className={cn("text-2xl font-bold leading-tight", tone === "alarm" && "text-alert-sos")}>
                {value}
              </div>
            )}
            {hint && !loading && !failed && (
              <div className="truncate text-xs text-muted-foreground">{hint}</div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    </Link>
  );
}

export function AdminMobileHome({ stats, statsLoading, statsError, alerts }: AdminMobileHomeProps) {
  const { t } = useTranslation();
  const sales = useSalesCommandStats();
  const readiness = useMonitoringReadiness();
  // Ten, because the brief says ten and because a phone list longer than a screen is a list
  // nobody reaches the bottom of.
  const { notifications, isLoading: notificationsLoading } = useNotifications({ pageSize: 10 });

  const activeAlerts = stats?.active_alerts ?? 0;

  return (
    <div className="space-y-4">
      {/* Isabella first, because "is she answering" is a yes/no that changes what the rest of
          the numbers mean — and the pill is the same component the desktop header uses. */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate text-xl font-bold tracking-tight">
          {t("adminDashboard.title", "Dashboard")}
        </h1>
        <IsabellaHealthPill />
      </div>

      <Tile
        to="/admin/orders"
        icon={CreditCard}
        label={t("adminMobile.paidToday", "Paid today")}
        value={`${euros(sales.data?.paid_amount_today ?? 0)} · ${sales.data?.paid_sales_today ?? 0}`}
        hint={t("adminMobile.paidTodayHint", "amount and orders")}
        loading={sales.isLoading}
        failed={sales.isError}
      />

      <Tile
        to="/admin/alerts"
        icon={activeAlerts > 0 ? ShieldAlert : Bell}
        label={t("adminMobile.activeAlerts", "Active alerts")}
        value={String(activeAlerts)}
        hint={
          alerts.length > 0
            ? // The newest one named: "3 alerts" and "3 alerts, the newest is a fall for Mary
              // Smith" are a different reason to tap.
              `${alerts[0].alert_type ?? "alert"} — ${[alerts[0].member?.first_name, alerts[0].member?.last_name]
                .filter(Boolean)
                .join(" ") || t("adminMobile.unknownMember", "unknown member")}`
            : t("common.noActiveAlerts", "Nothing open")
        }
        tone={activeAlerts > 0 ? "alarm" : undefined}
        loading={statsLoading}
        failed={statsError}
      />

      <Tile
        to="/admin/members"
        icon={Users}
        label={t("adminMobile.members", "Members active")}
        value={String(stats?.active_members ?? 0)}
        hint={
          stats?.new_members_30d
            ? t("adminMobile.newIn30", "{{count}} new in 30 days", { count: stats.new_members_30d })
            : undefined
        }
        loading={statsLoading}
        failed={statsError}
      />

      <Tile
        to="/admin/members/readiness-queue"
        icon={ShieldAlert}
        label={t("adminMobile.waitingToBeMonitored", "Paid, not yet monitored")}
        value={String(readiness.data?.waiting ?? 0)}
        hint={
          readiness.data?.waiting
            ? t("adminMobile.waitingHint", "money taken, nobody watching yet")
            : t("adminMobile.waitingNone", "everyone paid is monitored")
        }
        tone={readiness.data?.waiting ? "warn" : undefined}
        loading={readiness.isLoading}
        failed={readiness.isError}
      />

      {/* ── the last ten notifications ─────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground">
              {t("adminMobile.recent", "Latest notifications")}
            </span>
            <Link to="/admin/notifications" className="text-xs underline">
              {t("common.viewAll", "View all")}
            </Link>
          </div>

          {notificationsLoading ? (
            <div className="space-y-2 px-4 pb-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t("adminMobile.noNotifications", "Nothing yet.")}
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.slice(0, 10).map((notification: NotificationRecord) => {
                // isStaff = true: this is /admin. The same resolver the bell uses, so a tap
                // here and a tap there land in the same place.
                const to = notificationLink(notification.type, notification.metadata, true);
                const body = (
                  <div className="flex min-h-11 items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {notificationTitle(notification.type, t)}
                        </span>
                        {!notification.read && (
                          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                            {t("adminMobile.new", "new")}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {notificationBody(notification.message, notification.type, t)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {to && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </div>
                );

                return (
                  <li key={notification.id}>
                    {/* A notification with nowhere to go is rendered flat rather than as a link
                        that does nothing — that is the "tapping it does nothing" complaint. */}
                    {to ? (
                      <Link to={to} className="block active:bg-muted/60">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminMobileHome;
