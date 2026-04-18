import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMyShifts } from "@/hooks/useStaffShifts";
import { SHIFT_TYPES } from "@/config/shifts";
import { format } from "date-fns";

interface MyShiftsWidgetProps {
  staffId: string | undefined;
}

export function MyShiftsWidget({ staffId }: MyShiftsWidgetProps) {
  const { t } = useTranslation();
  const { data: shifts = [], isLoading } = useMyShifts(staffId);

  const nextShifts = shifts.slice(0, 5);

  return (
    <Card className="shadow-sm bg-background/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t("staffDashboard.myShifts", "My Shifts")}
          </CardTitle>
          {nextShifts.length > 0 && (
            <Badge variant="secondary">{t("staffDashboard.next14Days", "Next 14 days")}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            {t("common.loading", "Loading...")}
          </div>
        ) : nextShifts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            <p>{t("staffDashboard.noUpcomingShifts", "No upcoming shifts")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {nextShifts.map((shift) => {
              const config = SHIFT_TYPES[shift.shift_type];
              return (
                <div key={shift.id} className="flex items-center justify-between p-2.5 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-8 rounded-full`} style={{ backgroundColor: config.color }} />
                    <div>
                      <p className="text-sm font-medium">
                        {format(new Date(shift.shift_date + "T12:00:00"), "EEE d MMM")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  <Badge className={`${config.bgClass} ${config.textClass} border-0`}>
                    {t(config.labelKey, config.label)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
