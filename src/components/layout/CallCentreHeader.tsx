import { useState, useEffect } from "react";
import {
  Search,
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
import { Input } from "@/components/ui/input";
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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
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

  // Heartbeat — sends presence pings every 30s while on duty
  useStaffHeartbeat(staffInfo?.id ?? null, isOnDuty);

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
    queryClient.setQueryData(["staff-info", user?.id], (old: any) =>
      old ? { ...old, is_on_call: newValue } : old
    );

    const { error } = await supabase
      .from("staff")
      .update({ is_on_call: newValue })
      .eq("id", staffInfo.id);

    if (error) {
      // Revert optimistic update
      queryClient.setQueryData(["staff-info", user?.id], (old: any) =>
        old ? { ...old, is_on_call: !newValue } : old
      );
      toast.error("Failed to update duty status");
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
      newValue ? "You are now on duty" : "You have ended your shift"
    );
  };

  const handleSignOut = async () => {
    // End shift if on duty
    if (isOnDuty && staffInfo?.id) {
      await supabase
        .from("staff")
        .update({ is_on_call: false })
        .eq("id", staffInfo.id);

      logActivity.mutate({
        staffId: staffInfo.id,
        action: "shift.ended",
        details: {
          timestamp: new Date().toISOString(),
          method: "sign_out",
        },
      });
    }

    await signOut();
    navigate("/staff/login");
  };

  const displayName = staffInfo
    ? `${staffInfo.first_name} ${staffInfo.last_name}`
    : user?.email?.split("@")[0] || "Operator";

  const displayEmail = staffInfo?.email || user?.email || "";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      {/* Left side - Search and Shift Status */}
      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search members, alerts..."
            className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
          />
        </div>

        {/* Shift Status & Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={isOnDuty ? "default" : "outline"}
            size="sm"
            onClick={handleToggleDuty}
            className={cn(
              "gap-2 font-semibold transition-all",
              isOnDuty
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "border-dashed border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            )}
          >
            {isOnDuty ? (
              <>
                <Shield className="h-4 w-4" />
                On Duty
              </>
            ) : (
              <>
                <ShieldOff className="h-4 w-4" />
                Start Shift
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
              Scheduled
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
                  {othersOnShift.length} on shift
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
                  Staff Currently on Shift
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
      <div className="flex items-center gap-2">
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
                    Call Centre Operator
                  </Badge>
                  {isOnDuty && (
                    <Badge className="bg-green-600 text-white text-xs">
                      On Duty
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
                My Shift History
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to="/call-centre/preferences"
                className="flex items-center cursor-pointer"
              >
                <Settings className="w-4 h-4 mr-2" />
                Preferences
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isOnDuty && (
              <DropdownMenuItem
                onClick={handleToggleDuty}
                className="text-orange-600"
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                End Shift
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Visible Log Out button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          className="text-muted-foreground hover:text-destructive"
          title="Log Out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
