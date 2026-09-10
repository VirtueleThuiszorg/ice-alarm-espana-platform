import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CircleDot, Clock, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SHIFT_TYPES } from "@/config/shifts";
import { useWhoIsOn, shiftEndLabel } from "@/hooks/useWhoIsOn";

/**
 * WHO IS ON NOW / NEXT — the supervisor's first question, answered without opening the rota.
 *
 * It shows three things per person and does not merge them, because `staff-shift-monitor`
 * does not: SCHEDULED (a rota row), ON DUTY (they pressed the button) and PRESENT (a browser of
 * theirs pinged in the last 90 seconds). A strip that showed a green tick for "scheduled" would
 * read as covered at the exact moment the runner is raising a no-show.
 *
 * The loud state is the one that matters: somebody scheduled who is neither on duty nor present.
 * That is what a supervisor needs to see between calls, and it is deliberately the only thing
 * here rendered as a warning.
 *
 * Supervisors and admins only, because presence is: RLS grants
 * `staff_presence` SELECT to admin / super_admin / call_centre_supervisor, so an operator would
 * see every scheduled person as absent — worse than not showing it.
 */
export function WhoIsOnStrip({ enabled = true }: { enabled?: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading } = useWhoIsOn(enabled);

  if (!enabled) return null;

  if (isLoading || !data) {
    return (
      <Card data-testid="who-is-on-strip">
        <CardContent className="py-4 text-sm text-muted-foreground">
          {t("common.loading", "Loading...")}
        </CardContent>
      </Card>
    );
  }

  const current = SHIFT_TYPES[data.currentShift];
  const upcoming = SHIFT_TYPES[data.nextShift];

  return (
    <Card
      data-testid="who-is-on-strip"
      className={data.unaccountedFor.length > 0 || data.noneScheduled ? "border-red-500/40" : ""}
    >
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("whoIsOn.onNow", "On now")}
          </span>
          <Badge className={`${current.bgClass} ${current.textClass} border-0`}>
            {t(current.labelKey, current.label)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t("whoIsOn.until", "until {{time}}", { time: shiftEndLabel(data.currentShift) })}
          </span>
        </div>

        {data.noneScheduled ? (
          <p
            className="flex items-center gap-2 text-sm font-medium text-red-600"
            data-testid="who-is-on-nobody"
          >
            <UserX className="h-4 w-4" aria-hidden="true" />
            {t("whoIsOn.nobodyScheduled", "Nobody is on the rota for this shift")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.now.map((p) => {
              const accountedFor = p.onDuty || p.present;
              return (
                <li
                  key={p.staffId}
                  data-testid="who-is-on-person"
                  data-staff-id={p.staffId}
                  data-accounted-for={accountedFor ? "true" : "false"}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    accountedFor ? "" : "border-red-500/40 bg-red-500/5"
                  }`}
                >
                  <CircleDot
                    className={`h-3 w-3 ${p.present ? "text-green-600" : "text-muted-foreground/40"}`}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{p.name}</span>
                  {/* Three separate statements, never merged into one tick. */}
                  {p.onDuty ? (
                    <Badge variant="outline" className="border-green-500/40 text-xs text-green-600">
                      {t("whoIsOn.onDuty", "on duty")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {t("whoIsOn.notOnDuty", "not on duty")}
                    </Badge>
                  )}
                  {p.present ? (
                    <span className="text-xs text-muted-foreground">
                      {t("whoIsOn.present", "browser active")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("whoIsOn.notPresent", "no recent ping")}
                    </span>
                  )}
                  {!accountedFor && (
                    <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {data.unaccountedFor.length > 0 && (
          <p className="text-xs font-medium text-red-600" data-testid="who-is-on-warning">
            {t(
              "whoIsOn.unaccountedFor",
              "{{count}} scheduled and not signed in — the shift monitor raises a no-show for this",
              { count: data.unaccountedFor.length },
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("whoIsOn.onNext", "On next")}
          </span>
          <Badge className={`${upcoming.bgClass} ${upcoming.textClass} border-0`}>
            {t(upcoming.labelKey, upcoming.label)}
          </Badge>
          {data.next.length === 0 ? (
            <span className="text-sm font-medium text-red-600" data-testid="who-is-next-nobody">
              {t("whoIsOn.nobodyNext", "nobody on the rota")}
            </span>
          ) : (
            <span className="text-sm" data-testid="who-is-next">
              {data.next.map((p) => p.name).join(", ")}
            </span>
          )}
          <Link
            to="/call-centre/rota"
            className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("whoIsOn.openRota", "Open the rota")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
