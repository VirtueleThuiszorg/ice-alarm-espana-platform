import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LanguageSelector } from "@/components/LanguageSelector";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { supabase } from "@/integrations/supabase/client";
import { 
  Home, 
  User, 
  Heart, 
  Phone, 
  Smartphone, 
  CreditCard, 
  Bell, 
  Headphones,
  Menu,
  MessageSquare,
  LogOut,
  ChevronLeft,
  Search,
  ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { MemberChatButton } from "@/components/chat/MemberChatButton";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

interface MenuGroup {
  id: string;
  icon: React.ElementType;
  label: string;
  items: MenuItem[];
}

export function ClientLayout() {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, memberId } = useAuth();

  // Menu structure matching Admin sidebar pattern
  const menuGroups: MenuGroup[] = [
    {
      id: "dashboard",
      icon: Home,
      label: t("navigation.home"),
      items: [
        { icon: Home, label: t("navigation.home"), path: "/dashboard" }
      ]
    },
    {
      id: "profile",
      icon: User,
      label: t("navigation.myAccount"),
      items: [
        { icon: User, label: t("navigation.profile"), path: "/dashboard/profile" },
        { icon: Heart, label: t("navigation.medicalInfo"), path: "/dashboard/medical" },
        { icon: Phone, label: t("navigation.emergencyContacts"), path: "/dashboard/contacts" }
      ]
    },
    {
      id: "services",
      icon: Smartphone,
      label: t("navigation.services"),
      items: [
        { icon: Smartphone, label: t("navigation.myDevice"), path: "/dashboard/device" },
        { icon: Bell, label: t("navigation.alertHistory"), path: "/dashboard/alerts" },
        { icon: MessageSquare, label: t("navigation.messages"), path: "/dashboard/messages" }
      ]
    },
    {
      id: "billing",
      icon: CreditCard,
      label: t("navigation.billing"),
      items: [
        { icon: CreditCard, label: t("navigation.subscription"), path: "/dashboard/subscription" }
      ]
    },
    {
      id: "support",
      icon: Headphones,
      label: t("navigation.support"),
      items: [
        { icon: Headphones, label: t("navigation.contactSupport"), path: "/dashboard/support" }
      ]
    }
  ];

  // Fetch member data for display
  const { data: memberInfo } = useQuery({
    queryKey: ["member-info", memberId],
    queryFn: async () => {
      if (!memberId) return null;
      const { data, error } = await supabase
        .from("members")
        .select("first_name, last_name, email")
        .eq("id", memberId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!memberId,
  });

  const displayName = memberInfo 
    ? `${memberInfo.first_name} ${memberInfo.last_name}` 
    : user?.email?.split('@')[0] || "Member";

  const displayEmail = memberInfo?.email || user?.email || "";

  // Find group containing active route and auto-expand it
  useEffect(() => {
    const activeGroup = menuGroups.find(group =>
      group.items.some(item =>
        location.pathname === item.path ||
        (item.path !== "/dashboard" && location.pathname.startsWith(item.path + "/"))
      )
    );
    if (activeGroup) {
      setOpenGroups(prev => ({ ...prev, [activeGroup.id]: true }));
    }
  }, [location.pathname]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isGroupActive = (group: MenuGroup) => {
    return group.items.some(item =>
      location.pathname === item.path ||
      (item.path !== "/dashboard" && location.pathname.startsWith(item.path + "/"))
    );
  };

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  const renderMenuItem = (item: MenuItem, isMobile: boolean, isNested: boolean = false) => {
    const active = isActive(item.path);
    const Icon = item.icon;
    
    const linkContent = (
      <NavLink
        to={item.path}
        onClick={() => isMobile && setMobileMenuOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active 
            ? "bg-sidebar-primary text-sidebar-primary-foreground" 
            : "text-sidebar-foreground",
          !isMobile && collapsed && "justify-center px-2",
          isNested && !collapsed && "pl-9"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {(isMobile || !collapsed) && <span className="truncate">{item.label}</span>}
      </NavLink>
    );

    if (!isMobile && collapsed) {
      return (
        <li key={item.path}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              {linkContent}
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {item.label}
            </TooltipContent>
          </Tooltip>
        </li>
      );
    }

    return <li key={item.path}>{linkContent}</li>;
  };

  const renderMenuGroup = (group: MenuGroup, isMobile: boolean, showDivider: boolean = false) => {
    const Icon = group.icon;
    const isOpen = openGroups[group.id] || false;
    const active = isGroupActive(group);

    // For single-item groups like Dashboard, render as a direct link
    if (group.items.length === 1 && group.id === "dashboard") {
      return (
        <div key={group.id}>
          {showDivider && <Separator className="my-2 bg-sidebar-border/50" />}
          <ul className="space-y-1">
            {renderMenuItem(group.items[0], isMobile)}
          </ul>
        </div>
      );
    }

    // Collapsed desktop: show single icon with tooltip
    if (!isMobile && collapsed) {
      return (
        <div key={group.id}>
          {showDivider && <Separator className="my-2 bg-sidebar-border/50" />}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setCollapsed(false);
                  setOpenGroups(prev => ({ ...prev, [group.id]: true }));
                }}
                className={cn(
                  "flex items-center justify-center w-full rounded-lg px-2 py-2.5 text-sm font-medium transition-all",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active 
                    ? "bg-sidebar-primary/20 text-sidebar-primary" 
                    : "text-sidebar-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", active && "text-sidebar-primary")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {group.label}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    // Expanded: show collapsible group
    return (
      <div key={group.id}>
        {showDivider && <Separator className="my-2 bg-sidebar-border/50" />}
        <Collapsible open={isOpen} onOpenChange={() => toggleGroup(group.id)}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active 
                  ? "bg-sidebar-primary/20 text-sidebar-primary" 
                  : "text-sidebar-foreground/70"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "text-sidebar-primary")} />
              <span className="flex-1 text-left truncate">{group.label}</span>
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform duration-200 shrink-0",
                isOpen && "rotate-180"
              )} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1">
            <ul className="space-y-1">
              {group.items.map((item) => renderMenuItem(item, isMobile, true))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
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
        <div className="space-y-1">
          {/* Dashboard - standalone */}
          {renderMenuGroup(menuGroups[0], isMobile)}
          
          {/* My Account */}
          {renderMenuGroup(menuGroups[1], isMobile, true)}
          
          {/* Services */}
          {renderMenuGroup(menuGroups[2], isMobile, true)}
          
          {/* Billing */}
          {renderMenuGroup(menuGroups[3], isMobile, true)}
          
          {/* Support */}
          {renderMenuGroup(menuGroups[4], isMobile, true)}
        </div>
      </nav>

      {/* Emergency Button */}
      <div className="p-3 border-t border-sidebar-border">
        <Button 
          size="lg" 
          className={cn(
            "w-full font-semibold bg-alert-sos hover:bg-alert-sos/90 text-alert-sos-foreground shadow-lg",
            collapsed && !isMobile ? "h-10 px-2" : "h-12"
          )}
        >
            <Phone className={cn("shrink-0 h-5 w-5", !collapsed && !isMobile && "mr-2")} />
            {(isMobile || !collapsed) && <span className="text-sm">{t("dashboard.contactIceAlarm")}</span>}
          </Button>
      </div>

      {/* Sign out */}
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
              {(isMobile || !collapsed) && <span>{t("auth.signOut")}</span>}
            </Button>
          </TooltipTrigger>
          {!isMobile && collapsed && (
            <TooltipContent side="right" className="font-medium">
              {t("auth.signOut")}
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <Logo variant="sidebar" size="sm" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
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
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-md hover:bg-accent",
            "transition-transform duration-300",
            collapsed && "rotate-180"
          )}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      </aside>

      {/* Main Content */}
      <div className={cn(
        "pt-16 md:pt-0 transition-all duration-300",
        collapsed ? "md:ml-16" : "md:ml-64"
      )}>
        {/* Desktop Header */}
        <header className="hidden md:flex sticky top-0 z-30 h-16 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
          {/* Left side - Search */}
          <div className="flex items-center gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("common.search")}
                className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
              />
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* AI Chat Button */}
            <MemberChatButton memberId={memberId} />

            {/* Notification Bell */}
            <NotificationBell staffId={null} />

            {/* Language Selector */}
            <LanguageSelector variant="icon-only" />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <span className="hidden lg:inline">{displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{displayName}</span>
                    <span className="text-xs text-muted-foreground">{displayEmail}</span>
                    <Badge variant="secondary" className="w-fit mt-1 text-xs">
                      {t("common.member")}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/dashboard/profile">{t("auth.accountSettings")}</NavLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("auth.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <SectionErrorBoundary section="client" homePath="/dashboard">
            <Outlet />
          </SectionErrorBoundary>
        </main>

        <FeedbackWidget />
      </div>
    </div>
  );
}