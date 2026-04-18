import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Palmtree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMyHolidays, useMyHolidayBalance } from "@/hooks/useStaffHolidays";
import { HOLIDAY_STATUSES } from "@/config/shifts";
import { format } from "date-fns";

interface MyHolidaysWidgetProps {
  staffId: string | undefined;
}

export function MyHolidaysWidget({ staffId }: MyHolidaysWidgetProps) {
  const { t } = useTranslation();
  const { data: holidays = [] } = useMyHolidays(staffId);
  const { data: balance } = useMyHolidayBalance(staffId);

  const recentHolidays = holidays.slice(0, 3);
  const usedPct = balance && balance.annual_holiday_days > 0
    ? (balance.days_approved / balance.annual_holiday_days) * 100
    : 0;

  return (
    <Card className="shadow-sm bg-background/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Palmtree className="h-5 w-5 text-green-500" />
            {t("staffDashboard.myHolidays", "My Holidays")}
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/call-centre/holidays">{t("holidays.request", "Request")}</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {balance && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {balance.days_approved} / {balance.annual_holiday_days} {t("holidays.used", "used")}
              </span>
              <Badge variant="secondary">
                {balance.days_remaining} {t("holidays.remaining", "left")}
              </Badge>
            </div>
            <Progress value={usedPct} className="h-2" />
          </div>
        )}

        {recentHolidays.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Palmtree className="h-8 w-8 mx-auto mb-2" />
            <p>{t("staffDashboard.noHolidayRequests", "No holiday requests")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentHolidays.map((h) => {
              const statusConfig = HOLIDAY_STATUSES[h.status];
              return (
                <div key={h.id} className="flex items-center justify-between p-2 border rounded-lg">
                  <div className="text-sm">
                    <p className="font-medium">
                      {format(new Date(h.start_date), "d MMM")} — {format(new Date(h.end_date), "d MMM")}
                    </p>
                    <p className="text-xs text-muted-foreground">{h.total_days} {t("holidays.days", "days")}</p>
                  </div>
                  <Badge className={statusConfig.badgeClass}>{t(statusConfig.labelKey, h.status)}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
