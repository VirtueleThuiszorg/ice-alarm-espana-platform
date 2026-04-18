import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  X,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import {
  useAllHolidays,
  useAllHolidayBalances,
  useHolidayMutations,
} from "@/hooks/useStaffHolidays";
import { useShiftCoverMutations } from "@/hooks/useShiftCovers";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { HOLIDAY_STATUSES } from "@/config/shifts";
import type { HolidayStatus } from "@/config/shifts";
import { format } from "date-fns";

export default function HolidaysPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [coverHolidayId, setCoverHolidayId] = useState<string | null>(null);
  const [coverShifts, setCoverShifts] = useState<any[]>([]);
  const [coverAssignments, setCoverAssignments] = useState<Record<string, string>>({});

  const { data: currentStaff } = useCurrentStaff();
  const { data: balances = [] } = useAllHolidayBalances();
  const { data: holidays = [] } = useAllHolidays(
    statusFilter === "all" ? undefined : (statusFilter as HolidayStatus)
  );
  const { reviewHoliday } = useHolidayMutations();
  const { requestCover } = useShiftCoverMutations();

  const pendingHolidays = holidays.filter((h) => h.status === "requested");

  // Active CC staff for cover assignment
  const { data: staffList = [] } = useQuery({
    queryKey: ["active-cc-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .in("role", ["call_centre", "call_centre_supervisor"])
        .eq("status", "active")
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_TIMES.LONG,
  });

  const handleApprove = async (id: string) => {
    if (!currentStaff?.id) return;
    // Check for affected shifts first
    const holiday = holidays.find((h) => h.id === id);
    if (holiday) {
      const { data: affectedShifts } = await supabase
        .from("staff_shifts")
        .select("*")
        .eq("staff_id", holiday.staff_id)
        .gte("shift_date", holiday.start_date)
        .lte("shift_date", holiday.end_date);

      if (affectedShifts && affectedShifts.length > 0) {
        setCoverShifts(affectedShifts);
        setCoverHolidayId(id);
        setCoverAssignments({});
        setCoverDialogOpen(true);
        return;
      }
    }
    await reviewHoliday.mutateAsync({ id, status: "approved", reviewed_by: currentStaff.id });
  };

  const handleApproveWithCovers = async () => {
    if (!currentStaff?.id || !coverHolidayId) return;
    await reviewHoliday.mutateAsync({
      id: coverHolidayId,
      status: "approved",
      reviewed_by: currentStaff.id,
    });
    // Request covers for assigned shifts
    const holiday = holidays.find((h) => h.id === coverHolidayId);
    for (const shift of coverShifts) {
      const coverId = coverAssignments[shift.id];
      if (coverId) {
        await requestCover.mutateAsync({
          shift_id: shift.id,
          holiday_id: coverHolidayId,
          original_staff_id: holiday?.staff_id || shift.staff_id,
          cover_staff_id: coverId,
          requested_by: currentStaff.id,
        });
      }
    }
    setCoverDialogOpen(false);
  };

  const handleReject = (id: string) => {
    setRejectingId(id);
    setRejectNotes("");
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectingId || !currentStaff?.id) return;
    await reviewHoliday.mutateAsync({
      id: rejectingId,
      status: "rejected",
      reviewed_by: currentStaff.id,
      review_notes: rejectNotes,
    });
    setRejectDialogOpen(false);
  };

  const getStatusBadge = (status: HolidayStatus) => {
    const config = HOLIDAY_STATUSES[status];
    return <Badge className={config.badgeClass}>{t(config.labelKey, status)}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("holidays.title", "Staff Holidays")}</h1>
        <p className="text-muted-foreground">
          {t("holidays.subtitle", "Manage holiday requests and staff leave balances.")}
        </p>
      </div>

      {/* Holiday Balance Cards */}
      <div className="flex overflow-x-auto gap-4 pb-2">
        {balances.map((b) => {
          const usedPct = b.annual_holiday_days > 0 ? (b.days_approved / b.annual_holiday_days) * 100 : 0;
          const pendingPct = b.annual_holiday_days > 0 ? (b.days_pending / b.annual_holiday_days) * 100 : 0;
          return (
            <Card key={b.staff_id} className="min-w-[200px] flex-shrink-0">
              <CardContent className="pt-4 pb-3 px-4 space-y-2">
                <div className="font-medium text-sm">{b.first_name} {b.last_name}</div>
                <Progress value={usedPct + pendingPct} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{b.days_approved} {t("holidays.used", "used")}</span>
                  {b.days_pending > 0 && (
                    <span className="text-amber-500">{b.days_pending} {t("holidays.pending", "pending")}</span>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {b.days_remaining} {t("holidays.remaining", "left")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pending Requests */}
      {pendingHolidays.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              {t("holidays.pendingRequests", "Pending Requests")}
              <Badge variant="secondary">{pendingHolidays.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingHolidays.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-amber-500/5 border-amber-500/20"
              >
                <div>
                  <p className="font-medium">
                    {h.staff?.first_name} {h.staff?.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(h.start_date), "d MMM")} — {format(new Date(h.end_date), "d MMM yyyy")}{" "}
                    ({h.total_days} {h.total_days === 1 ? t("holidays.day", "day") : t("holidays.days", "days")})
                  </p>
                  {h.reason && <p className="text-sm text-muted-foreground mt-1">{h.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-600/30 hover:bg-green-500/10"
                    onClick={() => handleApprove(h.id)}
                    disabled={reviewHoliday.isPending}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {t("holidays.approve", "Approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-600/30 hover:bg-red-500/10"
                    onClick={() => handleReject(h.id)}
                    disabled={reviewHoliday.isPending}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t("holidays.reject", "Reject")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All Holidays Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>{t("holidays.allHolidays", "All Holidays")}</CardTitle>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">{t("common.all", "All")}</TabsTrigger>
                <TabsTrigger value="requested">{t("holidays.statusRequested", "Requested")}</TabsTrigger>
                <TabsTrigger value="approved">{t("holidays.statusApproved", "Approved")}</TabsTrigger>
                <TabsTrigger value="rejected">{t("holidays.statusRejected", "Rejected")}</TabsTrigger>
                <TabsTrigger value="cancelled">{t("holidays.statusCancelled", "Cancelled")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.staff", "Staff")}</TableHead>
                <TableHead>{t("holidays.dates", "Dates")}</TableHead>
                <TableHead>{t("holidays.duration", "Duration")}</TableHead>
                <TableHead>{t("holidays.reason", "Reason")}</TableHead>
                <TableHead>{t("common.status", "Status")}</TableHead>
                <TableHead>{t("holidays.reviewedBy", "Reviewed By")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {t("holidays.noHolidays", "No holidays found")}
                  </TableCell>
                </TableRow>
              ) : (
                holidays.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">
                      {h.staff?.first_name} {h.staff?.last_name}
                    </TableCell>
                    <TableCell>
                      {format(new Date(h.start_date), "d MMM")} — {format(new Date(h.end_date), "d MMM")}
                    </TableCell>
                    <TableCell>
                      {h.total_days} {h.total_days === 1 ? t("holidays.day", "day") : t("holidays.days", "days")}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{h.reason || "—"}</TableCell>
                    <TableCell>{getStatusBadge(h.status)}</TableCell>
                    <TableCell>
                      {h.reviewer ? `${h.reviewer.first_name} ${h.reviewer.last_name}` : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("holidays.rejectHoliday", "Reject Holiday Request")}</DialogTitle>
            <DialogDescription>
              {t("holidays.rejectDescription", "Please provide a reason for rejecting this request.")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder={t("holidays.rejectNotesPlaceholder", "Reason for rejection...")}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectNotes.trim() || reviewHoliday.isPending}
            >
              {t("holidays.confirmReject", "Reject Request")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cover Assignment Dialog */}
      <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("holidays.assignCovers", "Assign Shift Covers")}</DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-2 mt-1">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {t(
                  "holidays.shiftsAffected",
                  "{{count}} shift(s) need cover during this holiday.",
                  { count: coverShifts.length }
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto py-2">
            {coverShifts.map((shift) => {
              const holiday = holidays.find((h) => h.id === coverHolidayId);
              const availableStaff = staffList.filter((s) => s.id !== holiday?.staff_id);
              return (
                <div key={shift.id} className="flex items-center justify-between gap-3 p-2 border rounded">
                  <div className="text-sm">
                    <span className="font-medium">{format(new Date(shift.shift_date), "EEE d MMM")}</span>
                    {" — "}
                    <span className="capitalize">{shift.shift_type}</span>
                  </div>
                  <Select
                    value={coverAssignments[shift.id] || ""}
                    onValueChange={(v) => setCoverAssignments((prev) => ({ ...prev, [shift.id]: v }))}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={t("holidays.selectCover", "Select cover...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.first_name} {s.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoverDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleApproveWithCovers} disabled={reviewHoliday.isPending}>
              <Check className="h-4 w-4 mr-1" />
              {t("holidays.approveAndAssign", "Approve & Assign Covers")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
