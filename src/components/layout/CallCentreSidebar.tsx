import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  LayoutDashboard, 
  AlertTriangle, 
  Users, 
  MessageSquare, 
  CheckSquare, 
  Ticket,
  FileText,
  Palmtree,
  LogOut,
  ChevronLeft,
  Menu,
  UserPlus,
  BookOpen
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MenuItem {
  icon: React.ElementType;
  labelKey: string;
  path: string;
  badgeKey?: "alerts" | "messages";
}

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, labelKey: "sidebar.dashboard", path: "/call-centre" },
  { icon: AlertTriangle, labelKey: "sidebar.alerts", path: "/call-centre/alerts", badgeKey: "alerts" },
  { icon: UserPlus, labelKey: "sidebar.leads", path: "/call-centre/leads" },
  { icon: Users, labelKey: "sidebar.members", path: "/call-centre/members" },
  { icon: MessageSquare, labelKey: "sidebar.messages", path: "/call-centre/messages", badgeKey: "messages" },
  { icon: CheckSquare, labelKey: "sidebar.tasks", path: "/call-centre/tasks" },
  { icon: Ticket, labelKey: "sidebar.staffTickets", path: "/call-centre/tickets" },
  { icon: FileText, labelKey: "sidebar.shiftNotes", path: "/call-centre/shift-notes" },
  { icon: Palmtree, labelKey: "sidebar.holidays", path: "/call-centre/holidays" },
  { icon: BookOpen, labelKey: "sidebar.documents", path: "/call-centre/documents" },
];

interface CallCentreSidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function CallCentreSidebar({ onCollapsedChange }: CallCentreSidebarProps = {}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  // Notify parent of collapse state changes
  const handleCollapse = (value: boolean) => {
    setCollapsed(value);
    onCollapsedChange?.(value);
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState({ alerts: 0, messages: 0 });
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // Fetch badge counts
  useEffect(() => {
    fetchCounts();

    const alertsChannel = supabase
      .channel('sidebar-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, fetchCounts)
      .subscribe();

    const messagesChannel = supabase
      .channel('sidebar-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchCounts)
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  const fetchCounts = async () => {
    const [alertsRes, messagesRes] = await Promise.all([
      supabase.from('alerts').select('id', { count: 'exact' }).eq('status', 'incoming'),
      supabase.from('messages').select('id', { count: 'exact' }).eq('is_read', false).eq('sender_type', 'member')
    ]);
    setBadges({
      alerts: alertsRes.count || 0,
      messages: messagesRes.count || 0
    });
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/staff/login");
  };

  const isActive = (path: string) => {
    if (path === "/call-centre") {
      return location.pathname === "/call-centre";
    }
    return location.pathname.startsWith(path);
  };

  const renderMenuItem = (item: MenuItem, isMobile: boolean) => {
    const active = isActive(item.path);
    const Icon = item.icon;
    const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;
    const label = t(item.labelKey);

    const linkContent = (
      <NavLink
        to={item.path}
        onClick={() => isMobile && setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active 
            ? "bg-sidebar-primary text-sidebar-primary-foreground" 
            : "text-sidebar-foreground",
          !isMobile && collapsed && "justify-center px-2"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {(isMobile || !collapsed) && (
          <span className="flex-1">{label}</span>
        )}
        {badgeCount > 0 && (isMobile || !collapsed) && (
          <Badge 
            variant={item.badgeKey === "alerts" ? "destructive" : "default"}
            className="h-5 min-w-[20px] px-1.5 flex items-center justify-center text-xs"
          >
            {badgeCount}
          </Badge>
        )}
        {badgeCount > 0 && !isMobile && collapsed && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
        )}
      </NavLink>
    );

    if (!isMobile && collapsed) {
      return (
        <li key={item.path} className="relative">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              {linkContent}
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium flex items-center gap-2">
              {label}
              {badgeCount > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                  {badgeCount}
                </Badge>
              )}
            </TooltipContent>
          </Tooltip>
        </li>
      );
    }

    return <li key={item.path}>{linkContent}</li>;
  };

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border h-16 px-4",
        !isMobile && collapsed && "justify-center px-2"
      )}>
        <Logo variant="sidebar" size="sm" showText={isMobile || !collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {menuItems.map((item) => renderMenuItem(item, isMobile))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className={cn(
                "w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                !isMobile && collapsed && "justify-center px-2"
              )}
            >
              <LogOut className="h-5 w-5" />
              {(isMobile || !collapsed) && <span>{t("sidebar.endShift")}</span>}
            </Button>
          </TooltipTrigger>
          {!isMobile && collapsed && (
            <TooltipContent side="right" className="font-medium">
              {t("sidebar.endShift")}
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <Logo variant="sidebar" size="sm" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-full">
            <SidebarContent isMobile />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300 flex-col",
        collapsed ? "w-16" : "w-64"
      )}>
        <SidebarContent />
        
        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleCollapse(!collapsed)}
          className={cn(
            "absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-md hover:bg-accent",
            "transition-transform duration-300",
            collapsed && "rotate-180"
          )}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      </aside>
    </>
  );
}