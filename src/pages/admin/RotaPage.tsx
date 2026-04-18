import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import { useStaffShifts, useOnShiftNow, useShiftMutations } from "@/hooks/useStaffShifts";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useEscalationChains, useEscalationChainMutations } from "@/hooks/useEscalationChain";
import { SHIFT_TYPES, SHIFT_TYPE_OPTIONS } from "@/config/shifts";
import type { ShiftType } from "@/config/shifts";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";

// ---- Helpers ----

function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // Monday
}

function getWeekEnd(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 1 }); // Sunday
}

function formatDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// ---- Sub-components ----

function ShiftBadge({
  type,
  staffName,
  onClick,
}: {
  type: ShiftType;
  staffName?: string;
  onClick?: () => void;
}) {
  const config = SHIFT_TYPES[type];
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${config.bgClass} ${config.textClass} hover:opacity-80 transition-opacity`}
    >
      <span className="font-bold">{config.badgeLetter}</span>
      {staffName && <span className="truncate max-w-[60px]">{staffName}</span>}
    </button>
  );
}

export default function RotaPage() {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [escalationDialogOpen, setEscalationDialogOpen] = useState(false);
  const [escalationDate, setEscalationDate] = useState("");
  const [escalationShiftType, setEscalationShiftType] = useState<ShiftType>("morning");
  const [escPrimary, setEscPrimary] = useState("");
  const [escBackup, setEscBackup] = useState("");
  const [escSupervisor, setEscSupervisor] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");

  const { data: currentStaff } = useCurrentStaff();
  const { createShift, updateShift, deleteShift, bulkCreateShifts } = useShiftMutations();

  // Calculate week bounds
  const baseDate = useMemo(() => {
    const now = new Date();
    return addDays(now, weekOffset * 7);
  }, [weekOffset]);

  const weekStart = getWeekStart(baseDate);
  const weekEnd = getWeekEnd(baseDate);
  const weekStartStr = formatDateKey(weekStart);
  const weekEndStr = formatDateKey(weekEnd);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Data queries
  const { data: shifts = [], isLoading: shiftsLoading } = useStaffShifts(weekStartStr, weekEndStr);
  const { data: onShiftNow = [] } = useOnShiftNow();

  // Active call centre staff
  const { data: staffList = [] } = useQuery({
    queryKey: ["active-cc-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role")
        .in("role", ["call_centre", "call_centre_supervisor"])
        .eq("status", "active")
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_TIMES.LONG,
  });

  // Escalation chains for this week
  const { data: escalationChains = [] } = useEscalationChains(weekStartStr, weekEndStr);
  const { upsertChain } = useEscalationChainMutations();

  // All active staff for escalation chain selection (includes admins/supervisors)
  const { data: allStaff = [] } = useQuery({
    queryKey: ["all-active-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role, personal_mobile")
        .eq("status", "active")
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_TIMES.LONG,
  });

  // Escalation chain lookup: { [dateStr-shiftType]: chain }
  const chainLookup = useMemo(() => {
    const map: Record<string, typeof escalationChains[0]> = {};
    for (const c of escalationChains) {
      map[`${c.shift_date}-${c.shift_type}`] = c;
    }
    return map;
  }, [escalationChains]);

  // Group shifts: { [staffId]: { [dateStr]: ShiftType[] } }
  const shiftGrid = useMemo(() => {
    const grid: Record<string, Record<string, any[]>> = {};
    for (const s of staffList) {
      grid[s.id] = {};
      for (const d of weekDays) {
        grid[s.id][formatDateKey(d)] = [];
      }
    }
    for (const shift of shifts) {
      if (grid[shift.staff_id]?.[shift.shift_date]) {
        grid[shift.staff_id][shift.shift_date].push(shift);
      }
    }
    return grid;
  }, [shifts, staffList, weekDays]);

  // Coverage: per day × shift type
  const coverage = useMemo(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const d of weekDays) {
      const dk = formatDateKey(d);
      map[dk] = {};
      for (const st of SHIFT_TYPE_OPTIONS) {
        map[dk][st] = shifts.some((s) => s.shift_date === dk && s.shift_type === st);
      }
    }
    return map;
  }, [shifts, weekDays]);

  const hasUncoveredSlots = useMemo(
    () => Object.values(coverage).some((day) => Object.values(day).some((v) => !v)),
    [coverage]
  );

  // ---- Form state ----
  const [formShiftType, setFormShiftType] = useState<ShiftType>("morning");
  const [formNotes, setFormNotes] = useState("");

  const openAddDialog = (dateStr: string, staffId: string) => {
    setSelectedDate(dateStr);
    setSelectedStaffId(staffId);
    setFormShiftType("morning");
    setFormNotes("");
    setEditingShift(null);
    setAddDialogOpen(true);
  };

  const openEditDialog = (shift: any) => {
    setEditingShift(shift);
    setSelectedDate(shift.shift_date);
    setSelectedStaffId(shift.staff_id);
    setFormShiftType(shift.shift_type);
    setFormNotes(shift.notes || "");
    setAddDialogOpen(true);
  };

  const handleSaveShift = async () => {
    const config = SHIFT_TYPES[formShiftType];
    if (editingShift) {
      await updateShift.mutateAsync({
        id: editingShift.id,
        updates: {
          shift_type: formShiftType,
          start_time: config.start,
          end_time: config.end,
          notes: formNotes || null,
        },
      });
    } else {
      await createShift.mutateAsync({
        staff_id: selectedStaffId,
        shift_date: selectedDate,
        shift_type: formShiftType,
        start_time: config.start,
        end_time: config.end,
        notes: formNotes || undefined,
        created_by: currentStaff?.id,
      });
    }
    setAddDialogOpen(false);
  };

  const handleDeleteShift = async () => {
    if (editingShift) {
      await deleteShift.mutateAsync(editingShift.id);
      setAddDialogOpen(false);
    }
  };

  // Copy previous week
  const handleCopyWeek = async () => {
    const prevWeekStart = formatDateKey(addDays(weekStart, -7));
    const prevWeekEnd = formatDateKey(addDays(weekStart, -1));
    const { data: prevShifts } = await supabase
      .from("staff_shifts")
      .select("staff_id, shift_type, start_time, end_time, notes")
      .gte("shift_date", prevWeekStart)
      .lte("shift_date", prevWeekEnd);

    if (!prevShifts?.length) return;

    // Map day offsets
    const prevStart = addDays(weekStart, -7);
    const newShifts = prevShifts.map((ps: any) => {
      const prevDate = new Date(ps.shift_date || prevStart);
      const dayOfWeek = (prevDate.getDay() + 6) % 7; // 0=Mon
      const newDate = formatDateKey(addDays(weekStart, dayOfWeek));
      return {
        staff_id: ps.staff_id,
        shift_date: newDate,
        shift_type: ps.shift_type,
        start_time: ps.start_time,
        end_time: ps.end_time,
        notes: ps.notes,
        created_by: currentStaff?.id,
      };
    });

    await bulkCreateShifts.mutateAsync(newShifts);
    setCopyDialogOpen(false);
  };

  const openEscalationDialog = (dateStr: string, shiftType: ShiftType) => {
    setEscalationDate(dateStr);
    setEscalationShiftType(shiftType);
    const existing = chainLookup[`${dateStr}-${shiftType}`];
    setEscPrimary(existing?.primary_staff_id || "");
    setEscBackup(existing?.backup_staff_id || "");
    setEscSupervisor(existing?.supervisor_staff_id || "");
    setEscalationDialogOpen(true);
  };

  const handleSaveEscalation = async () => {
    await upsertChain.mutateAsync({
      shift_date: escalationDate,
      shift_type: escalationShiftType,
      primary_staff_id: escPrimary || null,
      backup_staff_id: escBackup || null,
      supervisor_staff_id: escSupervisor || null,
      created_by: currentStaff?.id,
    });
    setEscalationDialogOpen(false);
  };

  const isToday = (date: Date) => formatDateKey(date) === formatDateKey(new Date());

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("rota.title", "Staff Rota")}</h1>
          <p className="text-muted-foreground">{t("rota.subtitle", "Manage weekly shift schedules for the call centre.")}</p>
        </div>
        <Button variant="outline" onClick={() => setCopyDialogOpen(true)}>
          <Copy className="mr-2 h-4 w-4" />
          {t("rota.copyWeek", "Copy Previous Week")}
        </Button>
      </div>

      {/* Week Selector */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t("rota.prevWeek", "Previous")}
        </Button>
        <div className="text-center">
          <h2 className="font-semibold">
            {format(weekStart, "d MMM")} — {format(weekEnd, "d MMM yyyy")}
          </h2>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekOffset(0)}>
              {t("rota.thisWeek", "This Week")}
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
          {t("rota.nextWeek", "Next")}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Coverage Alert */}
      {!shiftsLoading && (
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border ${
            hasUncoveredSlots
              ? "bg-red-500/10 border-red-500/30 text-red-700"
              : "bg-green-500/10 border-green-500/30 text-green-700"
          }`}
        >
          {hasUncoveredSlots ? (
            <>
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{t("rota.uncoveredSlots", "Some shifts are uncovered this week")}</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{t("rota.allCovered", "All shifts covered this week")}</span>
            </>
          )}
        </div>
      )}

      {/* On Shift Now */}
      {onShiftNow.length > 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              {t("rota.onShiftNow", "On Shift Now")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-2">
              {onShiftNow.map((s) => (
                <Badge key={s.id} variant="secondary" className="gap-1">
                  {s.first_name} {s.last_name}
                  <ShiftBadge type={s.shift_type} />
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Grid */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px] sticky left-0 bg-background z-10">
                  {t("rota.staff", "Staff")}
                </th>
                {weekDays.map((day) => (
                  <th
                    key={formatDateKey(day)}
                    className={`px-2 py-2 text-center font-medium min-w-[100px] ${
                      isToday(day) ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
                    <div className={isToday(day) ? "text-primary font-bold" : ""}>{format(day, "d MMM")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffList.map((staff) => (
                <tr key={staff.id} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-background z-10">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {staff.first_name[0]}
                        {staff.last_name[0]}
                      </div>
                      <span className="truncate">{staff.first_name} {staff.last_name.charAt(0)}.</span>
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const dk = formatDateKey(day);
                    const cellShifts = shiftGrid[staff.id]?.[dk] || [];
                    return (
                      <td
                        key={dk}
                        className={`px-1 py-1.5 text-center ${isToday(day) ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex flex-wrap gap-1 justify-center min-h-[28px]">
                          {cellShifts.map((shift: any) => (
                            <ShiftBadge
                              key={shift.id}
                              type={shift.shift_type}
                              onClick={() => openEditDialog(shift)}
                            />
                          ))}
                          <button
                            onClick={() => openAddDialog(dk, staff.id)}
                            className="inline-flex items-center justify-center w-6 h-6 rounded border border-dashed border-muted-foreground/30 text-muted-foreground/50 hover:border-primary hover:text-primary transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Coverage summary row */}
              <tr className="bg-muted/20 font-medium">
                <td className="px-3 py-2 text-xs text-muted-foreground sticky left-0 bg-muted/20 z-10">
                  {t("rota.coverage", "Coverage")}
                </td>
                {weekDays.map((day) => {
                  const dk = formatDateKey(day);
                  return (
                    <td key={dk} className={`px-1 py-1.5 ${isToday(day) ? "bg-primary/5" : ""}`}>
                      <div className="flex justify-center gap-1">
                        {SHIFT_TYPE_OPTIONS.map((st) => (
                          <span
                            key={st}
                            className={`text-xs ${
                              coverage[dk]?.[st]
                                ? "text-green-600"
                                : "text-red-500"
                            }`}
                            title={`${SHIFT_TYPES[st].label}: ${coverage[dk]?.[st] ? "Covered" : "Uncovered"}`}
                          >
                            {coverage[dk]?.[st] ? "✓" : "✗"}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Escalation chain row */}
              <tr className="bg-amber-500/5 font-medium">
                <td className="px-3 py-2 text-xs text-muted-foreground sticky left-0 bg-amber-500/5 z-10 flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {t("rota.escalation", "Escalation")}
                </td>
                {weekDays.map((day) => {
                  const dk = formatDateKey(day);
                  return (
                    <td key={dk} className={`px-1 py-1.5 ${isToday(day) ? "bg-primary/5" : ""}`}>
                      <div className="flex justify-center gap-1">
                        {SHIFT_TYPE_OPTIONS.map((st) => {
                          const hasChain = !!chainLookup[`${dk}-${st}`];
                          return (
                            <button
                              key={st}
                              onClick={() => openEscalationDialog(dk, st)}
                              className={`text-xs px-1 rounded hover:bg-amber-200/50 transition-colors ${
                                hasChain ? "text-amber-600 font-bold" : "text-muted-foreground/40"
                              }`}
                              title={`${SHIFT_TYPES[st].label} escalation chain: ${hasChain ? "Configured" : "Not set"}`}
                            >
                              {hasChain ? "⛓" : "○"}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add/Edit Shift Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingShift ? t("rota.editShift", "Edit Shift") : t("rota.addShift", "Add Shift")}
            </DialogTitle>
            <DialogDescription>
              {selectedDate && format(new Date(selectedDate + "T12:00:00"), "EEEE, d MMMM yyyy")}
              {" — "}
              {staffList.find((s) => s.id === selectedStaffId)?.first_name}{" "}
              {staffList.find((s) => s.id === selectedStaffId)?.last_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{t("rota.shiftType", "Shift Type")}</label>
              <Select value={formShiftType} onValueChange={(v) => setFormShiftType(v as ShiftType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPE_OPTIONS.map((st) => (
                    <SelectItem key={st} value={st}>
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full`} style={{ backgroundColor: SHIFT_TYPES[st].color }} />
                        {SHIFT_TYPES[st].label} ({SHIFT_TYPES[st].start} - {SHIFT_TYPES[st].end})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("rota.notes", "Notes")}</label>
              <Textarea
                className="mt-1"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={t("rota.notesPlaceholder", "Optional notes...")}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editingShift && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteShift}
                disabled={deleteShift.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete", "Delete")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleSaveShift}
              disabled={createShift.isPending || updateShift.isPending}
            >
              {editingShift ? t("common.save", "Save") : t("rota.addShift", "Add Shift")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Week Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rota.copyWeek", "Copy Previous Week")}</DialogTitle>
            <DialogDescription>
              {t(
                "rota.copyWeekDescription",
                "This will copy all shifts from the previous week to the current week. Existing shifts will not be overwritten."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleCopyWeek} disabled={bulkCreateShifts.isPending}>
              <Copy className="h-4 w-4 mr-1" />
              {t("rota.confirmCopy", "Copy Shifts")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalation Chain Dialog */}
      <Dialog open={escalationDialogOpen} onOpenChange={setEscalationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                {t("rota.escalationChain", "Escalation Chain")}
              </div>
            </DialogTitle>
            <DialogDescription>
              {escalationDate && format(new Date(escalationDate + "T12:00:00"), "EEEE, d MMMM yyyy")}
              {" — "}
              {SHIFT_TYPES[escalationShiftType]?.label} ({SHIFT_TYPES[escalationShiftType]?.start} - {SHIFT_TYPES[escalationShiftType]?.end})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{t("rota.primaryStaff", "Primary (Level 2 — first call)")}</label>
              <Select value={escPrimary} onValueChange={setEscPrimary}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("rota.selectStaff", "Select staff...")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    {t("rota.none", "— None —")}
                  </SelectItem>
                  {allStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                      {s.personal_mobile ? ` (${s.personal_mobile})` : " (no mobile)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">{t("rota.backupStaff", "Backup (Level 2 — if primary unavailable)")}</label>
              <Select value={escBackup} onValueChange={setEscBackup}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("rota.selectStaff", "Select staff...")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    {t("rota.none", "— None —")}
                  </SelectItem>
                  {allStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                      {s.personal_mobile ? ` (${s.personal_mobile})` : " (no mobile)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">{t("rota.supervisorStaff", "Supervisor (Level 3)")}</label>
              <Select value={escSupervisor} onValueChange={setEscSupervisor}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("rota.selectStaff", "Select staff...")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    {t("rota.none", "— None —")}
                  </SelectItem>
                  {allStaff.filter((s) => ["call_centre_supervisor", "admin", "super_admin"].includes(s.role)).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                      {s.personal_mobile ? ` (${s.personal_mobile})` : " (no mobile)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("rota.escalationHelp", "If no chain is configured, the escalation runner falls back to on-call staff sorted by escalation priority.")}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalationDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleSaveEscalation} disabled={upsertChain.isPending}>
              <Shield className="h-4 w-4 mr-1" />
              {t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
