import { useState, useEffect } from "react";
import { Search, User, LogOut, Lightbulb } from "lucide-react";
import { IdeasNotepad } from "@/components/admin/IdeasNotepad";
import { useAdminIdeas } from "@/hooks/useAdminIdeas";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSelector } from "@/components/LanguageSelector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { AdminHeaderChatButton } from "@/components/chat/AdminHeaderChatButton";

export function AdminHeader() {
  const { t } = useTranslation();
  const { user, signOut, staffRole } = useAuth();
  const navigate = useNavigate();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const { uncompleteCount } = useAdminIdeas();
  useEffect(() => {
    const fetchStaffId = async () => {
      if (user?.id) {
        const { data } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", user.id)
          .single();
        setStaffId(data?.id || null);
      }
    };
    fetchStaffId();
  }, [user?.id]);

  // Fetch staff info
  const { data: staffInfo } = useQuery({
    queryKey: ["staff-info", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("staff")
        .select("first_name, last_name, email, role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/staff/login");
  };

  const displayName = staffInfo 
    ? `${staffInfo.first_name} ${staffInfo.last_name}` 
    : user?.email || "Admin User";

  const displayEmail = staffInfo?.email || user?.email || "";

  const roleLabel = staffRole === "super_admin" 
    ? t("adminHeader.roles.superAdmin", "Super Admin") 
    : staffRole === "admin" 
    ? t("adminHeader.roles.admin", "Admin") 
    : t("adminHeader.roles.staff", "Staff");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("adminHeader.searchPlaceholder", "Search members, devices...")}
          className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
        />
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Language Selector */}
        <LanguageSelector variant="icon-only" />

        {/* AI Main Brain Chat */}
        <AdminHeaderChatButton staffName={staffInfo?.first_name} />

        {/* Ideas Notepad */}
        <Button variant="ghost" size="icon" className="relative" onClick={() => setIdeasOpen(true)}>
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          {uncompleteCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center px-1">
              {uncompleteCount}
            </span>
          )}
        </Button>
        <IdeasNotepad open={ideasOpen} onOpenChange={setIdeasOpen} />

        {/* Notifications */}
        <NotificationBell staffId={staffId} />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{displayName}</span>
                <span className="text-xs text-muted-foreground">{displayEmail}</span>
                <Badge variant="secondary" className="w-fit mt-1 text-xs">
                  {roleLabel}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/admin/settings")}>
              {t("navigation.settings")}
            </DropdownMenuItem>
            <DropdownMenuItem>{t("profile.preferences")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {t("auth.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
