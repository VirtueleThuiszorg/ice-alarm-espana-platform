import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  User,
  LogOut,
  Clock,
  Settings,
  Lightbulb,
  Shield,
  ShieldOff,
  Users,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StaffHeaderChatButton } from "@/components/chat/StaffHeaderChatButton";
import { IdeasNotepad } from "@/components/admin/IdeasNotepad";
import { useAdminIdeas } from "@/hooks/useAdminIdeas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnShiftNow } from "@/hooks/useStaffShifts";
import { useLogStaffActivity } from "@/hooks/useStaffActivityLog";
import { useStaffHeartbeat } from "@/hooks/useStaffHeartbeat";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CallCentreHeader() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [dutyWarningOpen, setDutyWarningOpen] = useState(false);
  const { uncompleteCount } = useAdminIdeas();
  const { data: onShiftNow } = useOnShiftNow();
  const logActivity = useLogStaffActivity();

  // Fetch staff info including is_on_call
  const { data: staffInfo } = useQuery({
    queryKey: ["staff-info", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, email, role, is_on_call")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Set staffId for NotificationBell when staff info is loaded
  useEffect(() => {
    if (staffInfo?.id) {
      setStaffId(staffInfo.id);
    }
  }, [staffInfo?.id]);

  const isOnDuty = !!staffInfo?.is_on_call;

  /*
    Heartbeat — presence pings every 30s while this staff member has the platform open.

    NOT gated on `isOnDuty`. It was, and that made `staff_presence` a mirror of
    `staff.is_on_call` rather than an independent observation: the PRESENT-BUT-NOT-ON-DUTY state
    that staff-shift-monitor exists to distinguish could never occur. See useStaffHeartbeat.
  */
  useStaffHeartbeat(staffInfo?.id ?? null);

  // Check if current staff is on a scheduled shift
  const isOnScheduledShift = onShiftNow?.some(
    (s) => s.staff_id === staffInfo?.id
  );

  // Other staff currently on shift (exclude self)
  const othersOnShift = onShiftNow?.filter(
    (s) => s.staff_id !== staffInfo?.id
  ) || [];

  const handleToggleDuty = async () => {
    if (!staffInfo?.id) return;

    const newValue = !isOnDuty;

    // Optimistic update
    queryClient.setQueryData(["staff-info", user?.id], (old: typeof staffInfo) =>
      old ? { ...old, is_on_call: newValue } : old
    );

    const { error } = await supabase
      .from("staff")
      .update({ is_on_call: newValue })
      .eq("id", staffInfo.id);

    if (error) {
      // Revert optimistic update
      queryClient.setQueryData(["staff-info", user?.id], (old: typeof staffInfo) =>
        old ? { ...old, is_on_call: !newValue } : old
      );
      toast.error(t("callCentreHeader.dutyUpdateFailed", "Failed to update duty status"));
      return;
    }

    // Log activity
    logActivity.mutate({
      staffId: staffInfo.id,
      action: newValue ? "shift.started" : "shift.ended",
      details: {
        timestamp: new Date().toISOString(),
        method: "header_toggle",
      },
    });

    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ["on-shift-now"] });

    toast.success(
      newValue
        ? t("callCentreHeader.nowOnDuty", "You are now on duty")
        : t("callCentreHeader.shiftEnded", "You have ended your shift")
    );
  };

  /** Sign out for real. Never called without either no duty, or a decision about it. */
  const signOutNow = async () => {
    await signOut();
    navigate("/staff/login");
  };

  /**
   * Logging out is NOT going off duty (Lee's dashboard notes, 9 Sep, item 7).
   *
   * This used to clear `is_on_call` silently on the way out, which is wrong in both directions.
   * Duty here is MANUAL — an operator declares it and the escalation ladder trusts it, ringing
   * their MOBILE (`sos-escalation-runner` selects `status = 'active' AND is_on_call = true`),
   * not their browser tab. So closing a laptop is not evidence of anything: a supervisor on
   * call from a phone was silently removed from the ladder by tidying up their browser, and an
   * operator who meant to hand over got no reminder that they had not.
   *
   * So: warn, and make the operator choose. Both choices are recorded in the activity log.
   */
  const handleSignOut = async () => {
    if (isOnDuty && staffInfo?.id) {
      setDutyWarningOpen(true);
      return;
    }
    await signOutNow();
  };

  /** "End shift and log out" — the tidy case, and still not allowed to block the logout. */
  const endShiftAndSignOut = async () => {
    setDutyWarningOpen(false);
    if (staffInfo?.id) {
      const { error } = await supabase
        .from("staff")
        .update({ is_on_call: false })
        .eq("id", staffInfo.id);

      if (error) {
        console.error("Failed to end shift on sign-out:", error);
        toast.warning(
          t(
            "callCentreHeader.shiftUpdateFailed",
            "Your shift status couldn't be updated — you may still show as on duty"
          )
        );
      }

      logActivity.mutate({
        staffId: staffInfo.id,
        action: "shift.ended",
        details: {
          timestamp: new Date().toISOString(),
          method: "sign_out",
        },
      });
    }
    await signOutNow();
  };

  /** "Stay on duty" — logged, because it means the ladder will still ring this person. */
  const stayOnDutyAndSignOut = async () => {
    setDutyWarningOpen(false);
    if (staffInfo?.id) {
      logActivity.mutate({
        staffId: staffInfo.id,
        action: "shift.kept_on_logout",
        details: {
          timestamp: new Date().toISOString(),
          method: "sign_out",
        },
      });
    }
    await signOutNow();
  };

  const displayName = staffInfo
    ? `${staffInfo.first_name} ${staffInfo.last_name}`
    : user?.email?.split("@")[0] || t("callCentreHeader.operator", "Operator");

  const displayEmail = staffInfo?.email || user?.email || "";

  return (
    /*
      THE BAR WRAPS, AND THAT IS THE FIX.

      It was `flex h-16 items-center justify-between … px-6`: two groups, neither able to wrap
      and neither able to shrink — a duty toggle on the left and six icon buttons on the right.
      Their intrinsic width is 444px, so at 390 the whole DOCUMENT was 54px too wide and every
      call-centre page scrolled sideways on a phone. Found by photographing the member record at
      390 during the visual pass; it is the shell's, not that record's.

      WHY WRAPPING RATHER THAN HIDING CONTROLS. The two ends of this bar are the duty toggle —
      which decides whether the escalation ladder rings this operator's mobile — and the
      notification bell. Pushing either off-screen behind a swipe, or into a menu, on the device
      an on-call supervisor actually carries is the wrong trade. A second row costs 40px of
      height and keeps every control reachable.

      `h-auto min-h-16` rather than `h-16`: a fixed height with wrapped content clips the second
      row. The header is `sticky`, not `fixed`, so it is in normal flow and a taller bar pushes
      the page down instead of sitting on top of it.

      `min-w-0` on both groups because a flex child defaults to `min-width: auto` and will not
      shrink below its content — which is how the overflow escaped the container in the first
      place.
    */
    <header className="sticky top-0 z-30 flex h-auto min-h-16 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:h-16 md:flex-nowrap md:px-6 md:py-0">
      {/* Left side - Shift Status (search lives in GlobalSearch, Cmd+K) */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Shift Status & Toggle */}
        <div className="flex items-center gap-2">
          {/*
            Duty state, said out loud. The button's colour and label carry it, and this adds the
            two things a colour cannot: a live region, so a screen reader is told when it
            changes, and `data-on-duty`, which is what the Playwright spec reads to prove duty
            survived a reload rather than reading a CSS class.
          */}
          <span className="sr-only" role="status" aria-live="polite">
            {isOnDuty
              ? t("callCentreHeader.onDutyAnnounce", "You are on duty. Alerts escalate to you.")
              : t("callCentreHeader.offDutyAnnounce", "You are off duty.")}
          </span>
          <Button
            variant={isOnDuty ? "default" : "outline"}
            size="sm"
            onClick={handleToggleDuty}
            data-on-duty={isOnDuty ? "true" : "false"}
            data-testid="duty-toggle"
            title={
              isOnDuty
                ? t("callCentreHeader.onDutyHint", "On duty — alerts escalate to you. Click to end your shift.")
                : t("callCentreHeader.offDutyHint", "Off duty — click to start your shift.")
            }
            className={cn(
              "gap-2 font-semibold transition-all",
              isOnDuty
                ? "bg-alert-resolved text-alert-resolved-foreground hover:bg-alert-resolved/90"
                : "border-dashed border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            )}
          >
            {isOnDuty ? (
              <>
                <Shield className="h-4 w-4" />
                {t("callCentreHeader.onDuty", "On Duty")}
              </>
            ) : (
              <>
                <ShieldOff className="h-4 w-4" />
                {t("callCentreHeader.startShift", "Start Shift")}
              </>
            )}
          </Button>

          {/* Scheduled shift indicator */}
          {isOnScheduledShift && (
            <Badge
              variant="outline"
              className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs"
            >
              <Clock className="w-3 h-3 mr-1" />
              {t("callCentreHeader.scheduled", "Scheduled")}
            </Badge>
          )}

          {/* Who else is on shift */}
          {othersOnShift.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground"
                >
                  <Users className="h-3.5 w-3.5" />
                  {othersOnShift.length} {t("callCentreHeader.onShift", "on shift")}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
                  {t("callCentreHeader.staffOnShift", "Staff Currently on Shift")}
                </p>
                {othersOnShift.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm"
                  >
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span>
                      {s.first_name} {s.last_name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="ml-auto text-[10px] px-1.5"
                    >
                      {s.shift_type}
                    </Badge>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Language Selector */}
        <LanguageSelector variant="icon-only" />

        {/* AI Chat Button */}
        <StaffHeaderChatButton staffName={displayName} />

        {/* Ideas Notepad */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => setIdeasOpen(true)}
        >
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          {uncompleteCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center px-1">
              {uncompleteCount}
            </span>
          )}
        </Button>
        <IdeasNotepad open={ideasOpen} onOpenChange={setIdeasOpen} />

        {/* Notification Bell */}
        <NotificationBell staffId={staffId} />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 rounded-full px-2">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="hidden lg:inline text-sm font-medium">
                {staffInfo?.first_name || ""}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {displayEmail}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {t("callCentreHeader.role", "Call Centre Operator")}
                  </Badge>
                  {isOnDuty && (
                    <Badge className="bg-alert-resolved text-alert-resolved-foreground text-xs">
                      {t("callCentreHeader.onDuty", "On Duty")}
                    </Badge>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/call-centre/shift-history"
                className="flex items-center cursor-pointer"
              >
                <Clock className="w-4 h-4 mr-2" />
                {t("callCentreHeader.shiftHistory", "My Shift History")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to="/call-centre/preferences"
                className="flex items-center cursor-pointer"
              >
                <Settings className="w-4 h-4 mr-2" />
                {t("callCentreHeader.preferences", "Preferences")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isOnDuty && (
              <DropdownMenuItem
                onClick={handleToggleDuty}
                className="text-orange-600"
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                {t("callCentreHeader.endShift", "End Shift")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("callCentreHeader.logOut", "Log Out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Visible Log Out button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          className="text-muted-foreground hover:text-destructive"
          title={t("callCentreHeader.logOut", "Log Out")}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/*
        Logging out while on duty. Three ways out and no default: the operator decides, because
        only they know whether they are still reachable. `AlertDialog` rather than `ConfirmDialog`
        precisely because this is not a two-answer question.
      */}
      <AlertDialog open={dutyWarningOpen} onOpenChange={setDutyWarningOpen}>
        <AlertDialogContent data-testid="duty-logout-warning">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("callCentreHeader.stillOnDutyTitle", "You are still on duty")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "callCentreHeader.stillOnDutyBody",
                "Logging out does not end your shift. While you are on duty the escalation ladder keeps sending alerts to you and calls your mobile — so stay on duty only if you are still reachable.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <Button variant="outline" onClick={stayOnDutyAndSignOut}>
              <Shield className="mr-2 h-4 w-4" />
              {t("callCentreHeader.stayOnDuty", "Stay on duty and log out")}
            </Button>
            <AlertDialogAction onClick={endShiftAndSignOut}>
              <ShieldOff className="mr-2 h-4 w-4" />
              {t("callCentreHeader.endShiftAndLogOut", "End shift and log out")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
