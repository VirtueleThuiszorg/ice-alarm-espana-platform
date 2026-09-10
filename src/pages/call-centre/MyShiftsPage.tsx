import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  HelpCircle,
  Palmtree,
  Repeat,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HOLIDAY_STATUSES, SHIFT_TYPES } from "@/config/shifts";
import type { HolidayStatus } from "@/config/shifts";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useBankHolidays } from "@/hooks/useBankHolidays";
import { useMyAcceptedCovers } from "@/hooks/useShiftCovers";
import { useMyHolidayBalance, useMyHolidays } from "@/hooks/useStaffHolidays";
import { useMyShiftEvidence, useMyShiftRange, type StaffShift } from "@/hooks/useStaffShifts";
import { useMySwaps, swapAwaits } from "@/hooks/useShiftSwaps";
import { RequestSwapDialog } from "@/components/call-centre/RequestSwapDialog";
import { SwapRequestList } from "@/components/call-centre/SwapRequestList";
import { findLongDays, exceedsTwelveHours } from "@/lib/rota";
import {
  groupByWeek,
  hoursDisagree,
  rowHours,
  shiftHours,
  shiftKey,
  shiftKeyOfTimestamp,
  totalHours,
} from "@/lib/shiftSummary";

/**
 * MY SHIFTS — what one member of staff is on for, what they were on for, and their days off.
 *
 * The gap this closes: an operator's only view of their own rota was `MyShiftsWidget` on the
 * dashboard — the next five shifts inside fourteen days, read-only, with no history and no hours.
 * Anything further out (a swap in three weeks, a holiday in November) meant asking Mary.
 *
 * WHAT IT DOES NOT CLAIM. The Past tab never says a shift was "worked". The platform holds two
 * facts about a past shift: whether the person CONFIRMED it (`staff_shifts.is_confirmed`), and
 * what they wrote during it (`shift_notes`, attributed by the escalation runners' own shift
 * maths). It has no attendance record — `staff_presence` is a single upserted row per person
 * describing right now, and `staff_activity_log` / `shift_alert_log` are admin-only under RLS —
 * so a shift with neither confirmation nor notes is shown as exactly that, with nothing implied
 * about whether somebody stood it. Overstating it here would put a number nobody can support in
 * front of a payroll conversation.
 *
 * The four tabs each own their query, gated on being the visible tab: an operator opening this
 * page on a phone between calls pays for the eight weeks ahead, not for a year of festivos.
 */

/** The first date the rota holds shifts for. Nothing before it exists to look at. */
const ROTA_START = "2026-09-10";

/** How far ahead "Upcoming" looks. Lee's brief: eight weeks. */
const UPCOMING_WEEKS = 8;

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Midday, so a bare `YYYY-MM-DD` never renders as the previous evening in a western timezone. */
const atNoon = (date: string) => new Date(`${date}T12:00:00`);

function monthOptions(today: Date): string[] {
  const out: string[] = [];
  const first = ROTA_START.slice(0, 7);
  let cursor = format(today, "yyyy-MM");
  while (cursor >= first) {
    out.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    cursor = format(new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1)), "yyyy-MM");
  }
  return out;
}

/** Last day of `YYYY-MM`, as `YYYY-MM-DD`. */
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(Date.UTC(y, m, 0)), "yyyy-MM-dd");
}

export default function MyShiftsPage() {
  const { t } = useTranslation();
  const { data: currentStaff } = useCurrentStaff();
  const staffId = currentStaff?.id;

  const [tab, setTab] = useState("upcoming");
  const today = useMemo(() => new Date(), []);
  const months = useMemo(() => monthOptions(today), [today]);
  const [month, setMonth] = useState(() => format(today, "yyyy-MM"));

  const upcomingFrom = isoDate(today);
  const upcomingTo = isoDate(addDays(today, UPCOMING_WEEKS * 7));

  /**
   * Loaded on TWO tabs. Upcoming renders it; Requests needs it because the shift you offer back
   * in a swap has to be one you are actually on for, and a picker with nothing in it would make
   * an exchange impossible from a cold load of that tab.
   */
  const { data: upcoming = [], isLoading: upcomingLoading } = useMyShiftRange(
    tab === "upcoming" || tab === "requests" ? staffId : undefined,
    upcomingFrom,
    upcomingTo,
  );
  const { data: covers = [] } = useMyAcceptedCovers(tab === "upcoming" ? staffId : undefined);

  const pastFrom = `${month}-01`;
  const pastTo = monthEnd(month);
  const { data: past = [], isLoading: pastLoading } = useMyShiftRange(
    tab === "past" ? staffId : undefined,
    pastFrom,
    pastTo,
  );
  // A day either side of the month, so a night shift's small hours are inside the window.
  const { data: evidence = [] } = useMyShiftEvidence(
    tab === "past" ? staffId : undefined,
    isoDate(addDays(atNoon(pastFrom), -1)),
    isoDate(addDays(atNoon(pastTo), 1)),
  );

  /**
   * Swaps are NOT gated on the tab, unlike every other query here.
   *
   * The Requests tab carries a count of what is waiting on you, and a count you only load after
   * opening the tab is a count nobody sees. It is one small query for the two people involved in
   * each row, which is what RLS returns.
   */
  const { data: swaps = [] } = useMySwaps(staffId);
  const awaitingMe = swaps.filter((s) => swapAwaits(s, staffId) === "you").length;

  const { data: holidays = [] } = useMyHolidays(tab === "holidays" ? staffId : undefined);
  const { data: balance } = useMyHolidayBalance(tab === "holidays" ? staffId : undefined);

  const year = today.getFullYear();
  const { data: bankHolidays = [] } = useBankHolidays(year, tab === "bankHolidays");
  const { data: yearShifts = [] } = useMyShiftRange(
    tab === "bankHolidays" ? staffId : undefined,
    `${year}-01-01`,
    `${year}-12-31`,
  );

  /** shift id -> whose shift this actually is, and why. Same shape as MyShiftsWidget's. */
  const coverFor = useMemo(
    () =>
      new Map(
        covers.map((c) => [
          c.shift_id,
          {
            name: c.original_staff
              ? `${c.original_staff.first_name} ${c.original_staff.last_name}`.trim()
              : null,
            reason: c.holiday_id ? "holiday" : "swap",
          },
        ]),
      ),
    [covers],
  );

  /**
   * The dates on which this person works more than one shift, from `findLongDays` — the rota's
   * own classifier, so the warning here and the warning on the rota grid are the same rule.
   */
  const longDayByDate = useMemo(() => {
    const all = [...upcoming, ...past].map((s) => ({
      shift_date: s.shift_date,
      shift_type: s.shift_type,
      staff_id: s.staff_id,
    }));
    return new Map(findLongDays(all).map((d) => [d.date, d]));
  }, [upcoming, past]);

  /** shiftKey -> how many handover notes this person wrote inside that shift. */
  const notesByShift = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of evidence) {
      const key = shiftKeyOfTimestamp(note.created_at);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [evidence]);

  const shiftDatesThisYear = useMemo(
    () => new Set(yearShifts.map((s) => s.shift_date)),
    [yearShifts],
  );

  const hoursLabel = (hours: number) =>
    t("myShifts.hours", "{{count}}h", { count: Number(hours.toFixed(2)) });

  const shiftRow = (shift: StaffShift, extra?: React.ReactNode) => {
    const config = SHIFT_TYPES[shift.shift_type];
    const cover = coverFor.get(shift.id);
    const longDay = longDayByDate.get(shift.shift_date);
    const claimed = rowHours(shift);
    const mismatch = hoursDisagree(shift);

    return (
      <li
        key={shift.id}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
        data-testid="my-shift-row"
        data-shift-date={shift.shift_date}
      >
        <span className="h-8 w-2 shrink-0 rounded-full" style={{ backgroundColor: config.color }} />
        <span className="min-w-[7.5rem] font-medium">
          {format(atNoon(shift.shift_date), "EEE d MMM")}
        </span>
        <Badge className={`${config.bgClass} ${config.textClass} border-0`}>
          {t(config.labelKey, config.label)}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
        </span>
        <span className="text-sm font-medium">
          {hoursLabel(mismatch && claimed !== null ? claimed : shiftHours(shift.shift_type))}
        </span>
        {mismatch && (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">
            {t("myShifts.hoursEdited", "Not a standard {{hours}} shift", {
              hours: hoursLabel(shiftHours(shift.shift_type)),
            })}
          </Badge>
        )}
        {cover?.name && (
          <span className="text-sm font-medium text-primary">
            {cover.reason === "holiday"
              ? t("myShifts.coveringHoliday", "covering {{name}} — holiday", { name: cover.name })
              : t("myShifts.coveringSwap", "covering {{name}} — swap", { name: cover.name })}
          </span>
        )}
        {longDay && exceedsTwelveHours(longDay) && (
          <Badge
            variant="outline"
            className="border-red-500/40 text-red-600"
            data-testid="long-day-warning"
          >
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
            {t("myShifts.longDay", "{{hours}} this day", { hours: hoursLabel(longDay.hours) })}
          </Badge>
        )}
        {extra}
      </li>
    );
  };

  const weeks = groupByWeek(upcoming);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("myShifts.title", "My shifts")}</h1>
        <p className="text-muted-foreground">
          {t(
            "myShifts.subtitle",
            "What you are on for, what you were on for, and your days off.",
          )}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Scrolls rather than wraps on a narrow phone, so no tab is ever off-screen. */}
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="upcoming">{t("myShifts.tabUpcoming", "Upcoming")}</TabsTrigger>
          <TabsTrigger value="past">{t("myShifts.tabPast", "Past")}</TabsTrigger>
          <TabsTrigger value="holidays">{t("myShifts.tabHolidays", "Holidays")}</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">
            {t("myShifts.tabRequests", "Requests")}
            {awaitingMe > 0 && (
              <Badge className="ml-2 border-0 bg-primary text-primary-foreground" data-testid="requests-awaiting-badge">
                {awaitingMe}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="bankHolidays">
            {t("myShifts.tabBankHolidays", "Bank holidays")}
          </TabsTrigger>
        </TabsList>

        {/* ── Upcoming ─────────────────────────────────────────────────── */}
        <TabsContent value="upcoming" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
                {t("myShifts.nextWeeks", "Next {{count}} weeks", { count: UPCOMING_WEEKS })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingLoading ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("common.loading", "Loading...")}
                </p>
              ) : weeks.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  {t("myShifts.noUpcoming", "No shifts scheduled in the next {{count}} weeks", {
                    count: UPCOMING_WEEKS,
                  })}
                </p>
              ) : (
                weeks.map((week) => (
                  <section key={week.key} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold">
                        {t("myShifts.weekOf", "Week of {{date}}", {
                          date: format(atNoon(week.key), "d MMM"),
                        })}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {hoursLabel(week.hours)}
                      </span>
                    </div>
                    {/*
                      The ask lives ON the shift, which is where somebody realises they cannot
                      work it. Only on Upcoming: a swap for a shift that has already happened is
                      not a swap, it is a correction, and that is a supervisor's job.
                    */}
                    <ul className="space-y-2">
                      {week.shifts.map((s) =>
                        shiftRow(
                          s,
                          staffId ? (
                            <span className="ml-auto">
                              <RequestSwapDialog shift={s} staffId={staffId} />
                            </span>
                          ) : undefined,
                        ),
                      )}
                    </ul>
                  </section>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Past ─────────────────────────────────────────────────────── */}
        <TabsContent value="past" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
                  {t("myShifts.pastTitle", "Shifts by month")}
                </CardTitle>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-[11rem]" aria-label={t("myShifts.month", "Month")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {format(atNoon(`${m}-01`), "MMMM yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-2xl font-bold">{hoursLabel(totalHours(past))}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("myShifts.scheduledHours", "Scheduled hours")}
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{past.filter((s) => s.is_confirmed).length}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("myShifts.confirmedCount", "Confirmed of {{total}}", {
                      total: past.length,
                    })}
                  </p>
                </div>
              </div>

              {pastLoading ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("common.loading", "Loading...")}
                </p>
              ) : past.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  {t("myShifts.noPast", "No shifts recorded in this month")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {past.map((s) => {
                    const notes = notesByShift.get(shiftKey(s.shift_date, s.shift_type)) ?? 0;
                    return shiftRow(
                      s,
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        {s.is_confirmed ? (
                          <Badge
                            variant="outline"
                            className="border-green-500/40 text-green-600"
                            data-testid="shift-confirmed"
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                            {t("myShifts.confirmed", "Confirmed")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                            data-testid="shift-unconfirmed"
                          >
                            <HelpCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                            {t("myShifts.notConfirmed", "Not confirmed")}
                          </Badge>
                        )}
                        {notes > 0 && (
                          <span
                            className="flex items-center gap-1 text-muted-foreground"
                            data-testid="shift-evidence"
                          >
                            <FileText className="h-3 w-3" aria-hidden="true" />
                            {t("myShifts.notesWritten", "{{count}} handover notes", {
                              count: notes,
                            })}
                          </span>
                        )}
                      </span>,
                    );
                  })}
                </ul>
              )}

              {/*
                Said on the screen, not only in the code: this page reports what was SCHEDULED and
                what was confirmed. It is not an attendance record, and an operator reading a
                payroll figure off it deserves to know which of the two they are looking at.
              */}
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                {t(
                  "myShifts.evidenceNote",
                  "These are the shifts you were scheduled for, and whether you confirmed them. The platform does not record attendance, so a shift without a confirmation is not a claim either way — ask your supervisor to correct anything that looks wrong.",
                )}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Holidays ─────────────────────────────────────────────────── */}
        <TabsContent value="holidays" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Palmtree className="h-5 w-5 text-green-500" aria-hidden="true" />
                  {t("myShifts.holidaysTitle", "My holidays")}
                </CardTitle>
                {/*
                  The request FORM lives on /call-centre/holidays and stays there. Two forms
                  writing staff_holidays would be two sets of validation and two ideas of what a
                  day means; this sends the operator to the one that exists.
                */}
                <Button asChild size="sm">
                  <Link to="/call-centre/holidays">
                    {t("myShifts.requestHoliday", "Request holiday")}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {balance && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="holiday-balance">
                  <div>
                    <p className="text-2xl font-bold">{balance.annual_holiday_days}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("holidays.annual", "Annual")}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{balance.days_approved}</p>
                    <p className="text-xs text-muted-foreground">{t("holidays.used", "Used")}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-500">{balance.days_pending}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("holidays.pending", "Pending")}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">{balance.days_remaining}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("holidays.remaining", "Remaining")}
                    </p>
                  </div>
                </div>
              )}

              {holidays.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  {t("holidays.noHolidays", "No holiday requests yet")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {holidays.map((h) => {
                    const status = HOLIDAY_STATUSES[h.status as HolidayStatus];
                    return (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
                        data-testid="my-holiday-row"
                      >
                        <span className="min-w-[10rem] font-medium">
                          {format(atNoon(h.start_date), "d MMM")} —{" "}
                          {format(atNoon(h.end_date), "d MMM yyyy")}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t("myShifts.calendarDays", "{{count}} calendar days", {
                            count: h.total_days,
                          })}
                        </span>
                        {status && <Badge className={status.badgeClass}>{t(status.labelKey, h.status)}</Badge>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Requests ─────────────────────────────────────────────────── */}
        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Repeat className="h-5 w-5 text-primary" aria-hidden="true" />
                {t("swaps.title", "Swaps and cover")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  "swaps.pageNote",
                  "Requests you have made and requests made of you. Nothing moves on the rota until a supervisor approves it.",
                )}
              </p>
              {/*
                The eight-week window doubles as the exchange picker: a shift you can give back
                has to be one you are on for. Loading it here as well as on Upcoming is why the
                query above is gated on two tabs rather than one.
              */}
              <SwapRequestList
                swaps={swaps}
                staffId={staffId}
                mode="mine"
                myShifts={upcoming}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bank holidays ────────────────────────────────────────────── */}
        <TabsContent value="bankHolidays" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Flag className="h-5 w-5 text-primary" aria-hidden="true" />
                {t("myShifts.bankHolidaysTitle", "Bank holidays {{year}}", { year })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(
                  "myShifts.bankHolidayNote",
                  "The call centre runs on a festivo like any other day. These are marked so you can see which of your shifts fall on one.",
                )}
              </p>
              {bankHolidays.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  {t("myShifts.noBankHolidays", "No bank holidays recorded for {{year}}", { year })}
                </p>
              ) : (
                <ul className="space-y-2">
                  {bankHolidays.map((b) => (
                    <li
                      key={`${b.holiday_date}-${b.name}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
                      data-testid="bank-holiday-row"
                    >
                      <span className="min-w-[7.5rem] font-medium">
                        {format(atNoon(b.holiday_date), "EEE d MMM")}
                      </span>
                      <span className="text-sm">{b.name}</span>
                      <Badge variant="secondary">{b.region}</Badge>
                      {shiftDatesThisYear.has(b.holiday_date) && (
                        <Badge
                          variant="outline"
                          className="border-primary/40 text-primary"
                          data-testid="bank-holiday-on-shift"
                        >
                          {t("myShifts.youAreOnShift", "You are on shift")}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
