import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  X,
  AlertTriangle,
  Clock,
  Download,
  CalendarClock,
  Users,
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
import type { Tables } from "@/integrations/supabase/types";
import { STALE_TIMES } from "@/config/constants";
import {
  useAllHolidays,
  useAllHolidayBalances,
  useHolidayMutations,
} from "@/hooks/useStaffHolidays";
import { useShiftCoverMutations } from "@/hooks/useShiftCovers";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { HOLIDAY_ROLES, HOLIDAY_STATUSES } from "@/config/shifts";
import type { HolidayStatus } from "@/config/shifts";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { HolidayPolicyCard } from "@/components/admin/HolidayPolicyCard";
import { useHolidayPolicy } from "@/hooks/useHolidayPolicy";
import { exportToCsv } from "@/lib/csvExporter";
import {
  prorataEntitlement,
  shortNoticeCheck,
} from "../../../supabase/functions/_shared/holiday-policy";

export default function HolidaysPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [coverHolidayId, setCoverHolidayId] = useState<string | null>(null);
  const [coverShifts, setCoverShifts] = useState<Tables<"staff_shifts">[]>([]);
  const [coverAssignments, setCoverAssignments] = useState<Record<string, string>>({});

  const { data: currentStaff } = useCurrentStaff();
  const { staffRole } = useAuth();
  const { policy } = useHolidayPolicy();
  const { data: balances = [] } = useAllHolidayBalances();
  const { data: holidays = [] } = useAllHolidays(
    statusFilter === "all" ? undefined : (statusFilter as HolidayStatus)
  );
  // Unfiltered, for the per-person table: that table is a statement of the year and must not
  // change shape because somebody clicked "Rejected" on the tab strip above it.
  const { data: allHolidays = [] } = useAllHolidays();
  const { reviewHoliday } = useHolidayMutations();
  const { requestCover } = useShiftCoverMutations();

  const pendingHolidays = holidays.filter((h) => h.status === "requested");

  /**
   * THE SHIFTS EACH PENDING REQUEST WOULD LEAVE UNCOVERED, up front rather than after approval.
   *
   * Approving already opens the cover picker when shifts are affected — but only after the
   * decision is made, so a supervisor discovers "this leaves three night shifts open" one click
   * too late. This asks the question first, and gives each request a button straight into the
   * same picker.
   *
   * "Uncovered" means: the requester has a shift inside the range with no ACCEPTED cover against
   * it. A pending cover is not cover — the person asked has not said yes yet.
   */
  const { data: pendingImpact = {} } = useQuery({
    queryKey: ["pending-holiday-impact", pendingHolidays.map((h) => h.id).sort().join(",")],
    enabled: pendingHolidays.length > 0,
    queryFn: async () => {
      const out: Record<string, Tables<"staff_shifts">[]> = {};
      for (const h of pendingHolidays) {
        const { data: affected, error } = await supabase
          .from("staff_shifts")
          .select("*")
          .eq("staff_id", h.staff_id)
          .gte("shift_date", h.start_date)
          .lte("shift_date", h.end_date);
        if (error) throw error;
        const shiftIds = (affected || []).map((s) => s.id);
        if (shiftIds.length === 0) {
          out[h.id] = [];
          continue;
        }
        const { data: covers, error: coverError } = await supabase
          .from("staff_shift_covers")
          .select("shift_id, status")
          .in("shift_id", shiftIds)
          .eq("status", "accepted");
        if (coverError) throw coverError;
        const covered = new Set((covers || []).map((c) => c.shift_id));
        out[h.id] = (affected || []).filter((s) => !covered.has(s.id));
      }
      return out;
    },
    staleTime: STALE_TIMES.SHORT,
  });

  /** Open the cover picker for a request WITHOUT approving it. */
  const openCoverPicker = (holidayId: string) => {
    setCoverShifts(pendingImpact[holidayId] ?? []);
    setCoverHolidayId(holidayId);
    setCoverAssignments({});
    setCoverDialogOpen(true);
  };

  // Active CC staff for cover assignment
  const { data: staffList = [] } = useQuery({
    queryKey: ["active-cc-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        // `hire_date` and `annual_holiday_days` are here for the per-person table below, which
        // needs them to pro-rate a mid-year start. One query, not a second copy of this list.
        .select("id, first_name, last_name, hire_date, annual_holiday_days")
        // The shared list, not a second copy of it. This picker was the only one of the four
        // surfaces on this page that filtered at all (Lee, 9 Sep, item 5).
        .in("role", [...HOLIDAY_ROLES])
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

  /**
   * ONE ROW PER PERSON: entitlement, approved, pending, remaining, and the dates themselves.
   *
   * The balance cards above give the four numbers at a glance; this is the version somebody can
   * read down a column and hand to an accountant, which is why the DATES are on it — a balance
   * with no dates cannot be checked against anything.
   *
   * Entitlement is pro-rated only when the policy says so AND the person's hire date falls inside
   * the year. Somebody with no hire date on file gets the full entitlement and a flag; reducing
   * a statutory minimum on a guess is not an option (see D-16 in PENDING_FOR_LEE.md).
   */
  const year = new Date().getFullYear();
  const holidaysThisYear = allHolidays.filter((h) => h.start_date.startsWith(`${year}-`));
  const staffById = new Map(staffList.map((s) => [s.id, s]));

  const perPerson = balances.map((b) => {
    const staffRow = staffById.get(b.staff_id);
    const entitlement = prorataEntitlement(
      b.annual_holiday_days,
      staffRow?.hire_date ?? null,
      year,
      policy,
    );
    const own = holidaysThisYear.filter((h) => h.staff_id === b.staff_id);
    return {
      staffId: b.staff_id,
      name: `${b.first_name} ${b.last_name}`.trim(),
      entitlement,
      approved: b.days_approved,
      pending: b.days_pending,
      remaining: b.days_remaining,
      dates: own
        .filter((h) => h.status === "approved" || h.status === "requested")
        .sort((a, c) => a.start_date.localeCompare(c.start_date))
        .map((h) => ({
          label:
            h.start_date === h.end_date
              ? format(new Date(`${h.start_date}T12:00:00`), "d MMM")
              : `${format(new Date(`${h.start_date}T12:00:00`), "d MMM")}–${format(
                  new Date(`${h.end_date}T12:00:00`),
                  "d MMM",
                )}`,
          status: h.status as HolidayStatus,
          days: h.total_days,
        })),
    };
  });

  const downloadCsv = () => {
    // One row per HOLIDAY, with the person's balance repeated — the shape a spreadsheet can
    // pivot. A row per person with the dates crammed into one cell cannot be summed.
    const rows = perPerson.flatMap((p) =>
      p.dates.length === 0
        ? [
            {
              name: p.name,
              entitlement: p.entitlement.days,
              approved: p.approved,
              pending: p.pending,
              remaining: p.remaining,
              dates: "",
              status: "" as string,
              days: "" as number | string,
            },
          ]
        : p.dates.map((d) => ({
            name: p.name,
            entitlement: p.entitlement.days,
            approved: p.approved,
            pending: p.pending,
            remaining: p.remaining,
            dates: d.label,
            status: d.status as string,
            days: d.days as number | string,
          })),
    );
    exportToCsv(rows, `holidays-${year}-${format(new Date(), "yyyy-MM-dd")}.csv`, [
      { key: "name", header: "Staff" },
      { key: "entitlement", header: "Entitlement (días naturales)" },
      { key: "approved", header: "Approved" },
      { key: "pending", header: "Pending" },
      { key: "remaining", header: "Remaining" },
      { key: "dates", header: "Dates" },
      { key: "status", header: "Status" },
      { key: "days", header: "Days" },
    ]);
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
        <p className="text-xs text-muted-foreground mt-1">
          {t(
            "holidays.naturalDaysNote",
            "Allowance is in natural (calendar) days — Spanish statutory minimum: 30 días naturales per year (Estatuto de los Trabajadores, art. 38).",
          )}
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
                  {(() => {
                    /*
                      ET art. 38.3: the dates are agreed between employer and worker, and the
                      worker must know them at least two months before they start. Approving
                      inside that window is lawful — both sides can agree — so this WARNS and
                      never blocks. The threshold is the setting, and the message names it, so
                      a supervisor can see which rule is talking to them.
                    */
                    const notice = shortNoticeCheck(
                      h.start_date,
                      format(new Date(), "yyyy-MM-dd"),
                      policy,
                    );
                    if (!notice.shortNotice) return null;
                    return (
                      <p
                        className="mt-1 flex items-center gap-1 text-xs text-amber-600"
                        data-testid="short-notice-warning"
                      >
                        <CalendarClock className="h-3 w-3" aria-hidden="true" />
                        {notice.daysAhead < 0
                          ? t("holidays.shortNoticeStarted", "Already started — {{days}} days ago", {
                              days: Math.abs(notice.daysAhead),
                            })
                          : t(
                              "holidays.shortNotice",
                              "Starts in {{days}} days — less than the {{threshold}} days ET art. 38.3 expects",
                              { days: notice.daysAhead, threshold: notice.thresholdDays },
                            )}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {(pendingImpact[h.id]?.length ?? 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCoverPicker(h.id)}
                      data-testid="assign-cover"
                      data-holiday-id={h.id}
                    >
                      <Users className="mr-1 h-4 w-4" aria-hidden="true" />
                      {t("holidays.assignCover", "{{count}} shifts need cover", {
                        count: pendingImpact[h.id]?.length ?? 0,
                      })}
                    </Button>
                  )}
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

      {/* Per person: the four numbers and the dates behind them */}
      <Card data-testid="per-person-holidays">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("holidays.perPerson", "Per person, {{year}}", { year })}</CardTitle>
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("holidays.downloadCsv", "Download CSV")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.staff", "Staff")}</TableHead>
                <TableHead className="text-right">{t("holidays.entitlement", "Entitlement")}</TableHead>
                <TableHead className="text-right">{t("holidays.statusApproved", "Approved")}</TableHead>
                <TableHead className="text-right">{t("holidays.pending", "Pending")}</TableHead>
                <TableHead className="text-right">{t("holidays.remaining", "Remaining")}</TableHead>
                <TableHead>{t("holidays.dates", "Dates")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perPerson.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {t("holidays.noHolidays", "No holiday requests yet")}
                  </TableCell>
                </TableRow>
              ) : (
                perPerson.map((p) => (
                  <TableRow key={p.staffId} data-testid="per-person-row" data-staff-id={p.staffId}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">
                      {p.entitlement.days}
                      {p.entitlement.prorated && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {t("holidays.prorated", "pro-rata")}
                        </Badge>
                      )}
                      {p.entitlement.missingHireDate && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-amber-500/40 text-xs text-amber-600"
                          data-testid="missing-hire-date"
                        >
                          {t("holidays.noHireDate", "no hire date")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{p.approved}</TableCell>
                    <TableCell className="text-right text-amber-600">{p.pending}</TableCell>
                    <TableCell className="text-right font-medium">{p.remaining}</TableCell>
                    <TableCell className="max-w-[22rem]">
                      <div className="flex flex-wrap gap-1">
                        {p.dates.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          p.dates.map((d, i) => (
                            <Badge
                              key={`${d.label}-${i}`}
                              variant="outline"
                              className={
                                d.status === "requested"
                                  ? "border-amber-500/40 text-amber-600"
                                  : undefined
                              }
                            >
                              {d.label} ({d.days})
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* The rules every number above is calculated against */}
      <HolidayPolicyCard canEdit={staffRole === "super_admin"} />

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
