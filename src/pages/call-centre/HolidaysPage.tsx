import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Palmtree,
  Calendar,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useMyHolidays, useMyHolidayBalance, useHolidayMutations } from "@/hooks/useStaffHolidays";
import { HOLIDAY_STATUSES } from "@/config/shifts";
import type { HolidayStatus } from "@/config/shifts";
import { format, differenceInCalendarDays } from "date-fns";

export default function HolidaysPage() {
  const { t } = useTranslation();
  const { data: currentStaff } = useCurrentStaff();
  const staffId = currentStaff?.id;

  const { data: holidays = [] } = useMyHolidays(staffId);
  const { data: balance } = useMyHolidayBalance(staffId);
  const { requestHoliday, cancelHoliday } = useHolidayMutations();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const duration = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const days = differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? days : 0;
  }, [startDate, endDate]);

  const exceedsBalance = balance ? duration > balance.days_remaining : false;
  const usedPct = balance && balance.annual_holiday_days > 0
    ? (balance.days_approved / balance.annual_holiday_days) * 100
    : 0;

  const handleSubmit = async () => {
    if (!staffId || !startDate || !endDate || duration <= 0) return;
    await requestHoliday.mutateAsync({
      staff_id: staffId,
      start_date: startDate,
      end_date: endDate,
      reason: reason || undefined,
    });
    setStartDate("");
    setEndDate("");
    setReason("");
  };

  const handleCancel = async (id: string) => {
    await cancelHoliday.mutateAsync(id);
  };

  const getStatusBadge = (status: HolidayStatus) => {
    const config = HOLIDAY_STATUSES[status];
    return <Badge className={config.badgeClass}>{t(config.labelKey, status)}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("holidays.title", "My Holidays")}</h1>
        <p className="text-muted-foreground">
          {t("holidays.staffSubtitle", "Request time off and view your holiday balance.")}
        </p>
      </div>

      {/* Balance Summary */}
      {balance && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Palmtree className="h-5 w-5 text-green-500" />
              {t("holidays.balance", "Holiday Balance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Progress value={usedPct} className="h-3" />
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{balance.annual_holiday_days}</p>
                  <p className="text-xs text-muted-foreground">{t("holidays.annual", "Annual")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{balance.days_approved}</p>
                  <p className="text-xs text-muted-foreground">{t("holidays.used", "Used")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-500">{balance.days_pending}</p>
                  <p className="text-xs text-muted-foreground">{t("holidays.pending", "Pending")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{balance.days_remaining}</p>
                  <p className="text-xs text-muted-foreground">{t("holidays.remaining", "Remaining")}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {t("holidays.requestHoliday", "Request Holiday")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t("holidays.startDate", "Start Date")}</label>
              <Input
                type="date"
                className="mt-1"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("holidays.endDate", "End Date")}</label>
              <Input
                type="date"
                className="mt-1"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          {duration > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {duration} {duration === 1 ? t("holidays.day", "day") : t("holidays.days", "days")}
              </Badge>
              {exceedsBalance && (
                <div className="flex items-center gap-1 text-sm text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  {t("holidays.exceedsBalance", "Exceeds remaining balance")}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium">{t("holidays.reason", "Reason")}</label>
            <Textarea
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("holidays.reasonPlaceholder", "Optional reason for time off...")}
              rows={2}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!startDate || !endDate || duration <= 0 || requestHoliday.isPending}
          >
            {t("holidays.submitRequest", "Submit Request")}
          </Button>
        </CardContent>
      </Card>

      {/* My Holiday History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{t("holidays.myHistory", "My Holiday History")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("holidays.dates", "Dates")}</TableHead>
                <TableHead>{t("holidays.duration", "Duration")}</TableHead>
                <TableHead>{t("holidays.reason", "Reason")}</TableHead>
                <TableHead>{t("common.status", "Status")}</TableHead>
                <TableHead className="w-[80px]">{t("common.actions", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t("holidays.noHolidays", "No holiday requests yet")}
                  </TableCell>
                </TableRow>
              ) : (
                holidays.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">
                      {format(new Date(h.start_date), "d MMM")} — {format(new Date(h.end_date), "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {h.total_days} {h.total_days === 1 ? t("holidays.day", "day") : t("holidays.days", "days")}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{h.reason || "—"}</TableCell>
                    <TableCell>{getStatusBadge(h.status)}</TableCell>
                    <TableCell>
                      {h.status === "requested" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCancel(h.id)}
                          disabled={cancelHoliday.isPending}
                          title={t("common.cancel", "Cancel")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
