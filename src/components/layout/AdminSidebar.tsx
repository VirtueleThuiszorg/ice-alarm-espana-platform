import {
  LayoutDashboard,
  Users,
  Smartphone,
  Bell,
  UserCog,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Menu,
  MessageSquare,
  CheckSquare,
  Ticket,
  Contact,
  Handshake,
  ClipboardCheck,
  Briefcase,
  ShoppingCart,
  CreditCard,
  DollarSign,
  PieChart,
  Activity,

  Brain,
  Share2,
  Megaphone,
  Video,
  Headphones,
  MessageSquareQuote,
  CalendarDays,
  Palmtree,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
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

interface MenuItem {
  icon: React.ElementType;
  labelKey: string;
  path: string;
  superAdminOnly?: boolean;
}

interface MenuGroup {
  id: string;
  icon: React.ElementType;
  labelKey: string;
  items: MenuItem[];
  superAdminOnly?: boolean;
}

const menuGroups: MenuGroup[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    labelKey: "sidebar.dashboard",
    items: [
      { icon: LayoutDashboard, labelKey: "sidebar.dashboard", path: "/admin" }
    ]
  },
  {
    id: "people",
    icon: Users,
    labelKey: "sidebar.people",
    items: [
      { icon: Users, labelKey: "sidebar.members", path: "/admin/members" },
      { icon: Contact, labelKey: "sidebar.leads", path: "/admin/leads" },
      { icon: Smartphone, labelKey: "sidebar.devices", path: "/admin/devices" },
      { icon: Bell, labelKey: "sidebar.alerts", path: "/admin/alerts" }
    ]
  },
  {
    id: "partners",
    icon: Handshake,
    labelKey: "sidebar.partners",
    items: [
      { icon: Handshake, labelKey: "sidebar.partners", path: "/admin/partners" },
      { icon: DollarSign, labelKey: "sidebar.partnerPricing", path: "/admin/partner-pricing" },
      { icon: ClipboardCheck, labelKey: "sidebar.partnersQa", path: "/admin/partners-qa", superAdminOnly: true }
    ]
  },
  {
    id: "staff-ops",
    icon: UserCog,
    labelKey: "sidebar.staffOperations",
    items: [
      { icon: UserCog, labelKey: "sidebar.staff", path: "/admin/staff", superAdminOnly: true },
      { icon: CalendarDays, labelKey: "sidebar.rota", path: "/admin/rota" },
      { icon: Palmtree, labelKey: "sidebar.holidays", path: "/admin/holidays" },
      { icon: Ticket, labelKey: "sidebar.staffTickets", path: "/admin/tickets" },
      { icon: CheckSquare, labelKey: "sidebar.tasks", path: "/admin/tasks" }
    ]
  },
  {
    id: "communications",
    icon: MessageSquare,
    labelKey: "sidebar.communications",
    items: [
      { icon: LayoutDashboard, labelKey: "sidebar.communicationsDashboard", path: "/admin/communications" },
      { icon: MessageSquare, labelKey: "sidebar.messages", path: "/admin/messages" },
      { icon: Share2, labelKey: "sidebar.mediaManager", path: "/admin/media-manager" },
      { icon: Megaphone, labelKey: "sidebar.aiOutreach", path: "/admin/ai-outreach" },
      { icon: Video, labelKey: "sidebar.videoHub", path: "/admin/video-hub" },
      { icon: MessageSquareQuote, labelKey: "sidebar.testimonials", path: "/admin/testimonials" }
    ]
  },
  {
    id: "business",
    icon: Briefcase,
    labelKey: "sidebar.business",
    items: [
      { icon: PieChart, labelKey: "sidebar.financeDashboard", path: "/admin/finance" },
      { icon: ShoppingCart, labelKey: "sidebar.orders", path: "/admin/orders" },
      { icon: CreditCard, labelKey: "sidebar.subscriptions", path: "/admin/subscriptions" },
      { icon: DollarSign, labelKey: "sidebar.payments", path: "/admin/payments" },
      { icon: DollarSign, labelKey: "sidebar.commissions", path: "/admin/commissions" },
      { icon: Smartphone, labelKey: "sidebar.ev07b", path: "/admin/ev07b" },
      { icon: Activity, labelKey: "sidebar.analytics", path: "/admin/analytics" },
      { icon: BarChart3, labelKey: "sidebar.reports", path: "/admin/reports" }
    ]
  },
  {
    id: "ai",
    icon: Brain,
    labelKey: "sidebar.aiCommandCentre",
    items: [
      { icon: Brain, labelKey: "sidebar.aiBehaviors", path: "/admin/ai" },
      { icon: Headphones, labelKey: "sidebar.isabellaOperations", path: "/admin/ai/operations" }
    ]
  },
  {
    id: "system",
    icon: Settings,
    labelKey: "sidebar.system",
    superAdminOnly: true,
    items: [
      { icon: Settings, labelKey: "sidebar.settings", path: "/admin/settings", superAdminOnly: true }
    ]
  }
];

interface AdminSidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function AdminSidebar({ onCollapsedChange }: AdminSidebarProps = {}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, staffRole } = useAuth();

  // Notify parent of collapse state changes
  const handleCollapse = (value: boolean) => {
    setCollapsed(value);
    onCollapsedChange?.(value);
  };

  // Find group containing active route and auto-expand it
  useEffect(() => {
    const activeGroup = menuGroups.find(group =>
      group.items.some(item =>
        location.pathname === item.path ||
        (item.path !== "/admin" && location.pathname.startsWith(item.path + "/"))
      )
    );
    if (activeGroup) {
      setOpenGroups(prev => ({ ...prev, [activeGroup.id]: true }));
    }
  }, [location.pathname]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/staff/login");
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const filterByRole = (items: MenuItem[]) =>
    items.filter(item => {
      if (item.superAdminOnly && staffRole !== "super_admin") {
        return false;
      }
      return true;
    });

  const shouldShowGroup = (group: MenuGroup) => {
    if (group.superAdminOnly && staffRole !== "super_admin") {
      return false;
    }
    const visibleItems = filterByRole(group.items);
    return visibleItems.length > 0;
  };

  const isGroupActive = (group: MenuGroup) => {
    return group.items.some(item =>
      location.pathname === item.path ||
      (item.path !== "/admin" && location.pathname.startsWith(item.path + "/"))
    );
  };

  const renderMenuItem = (item: MenuItem, isMobile: boolean, isNested: boolean = false) => {
    const isActive = location.pathname === item.path ||
      (item.path !== "/admin" && location.pathname.startsWith(item.path + "/"));
    const Icon = item.icon;
    const label = t(item.labelKey);

    const linkContent = (
      <NavLink
        to={item.path}
        onClick={() => isMobile && setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground",
          !isMobile && collapsed && "justify-center px-2",
          isNested && !collapsed && "pl-9"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {(isMobile || !collapsed) && <span className="truncate">{label}</span>}
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
              {label}
            </TooltipContent>
          </Tooltip>
        </li>
      );
    }

    return <li key={item.path}>{linkContent}</li>;
  };

  const renderMenuGroup = (group: MenuGroup, isMobile: boolean, showDivider: boolean = false) => {
    if (!shouldShowGroup(group)) return null;

    const Icon = group.icon;
    const isOpen = openGroups[group.id] || false;
    const isActive = isGroupActive(group);
    const visibleItems = filterByRole(group.items);
    const label = t(group.labelKey);

    // For single-item groups like Dashboard, render as a direct link
    if (visibleItems.length === 1 && group.id === "dashboard") {
      return (
        <div key={group.id}>
          {showDivider && <Separator className="my-2 bg-sidebar-border/50" />}
          <ul className="space-y-1">
            {renderMenuItem(visibleItems[0], isMobile)}
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
                  handleCollapse(false);
                  setOpenGroups(prev => ({ ...prev, [group.id]: true }));
                }}
                className={cn(
                  "flex items-center justify-center w-full rounded-lg px-2 py-2.5 text-sm font-medium transition-all",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive
                    ? "bg-sidebar-primary/20 text-sidebar-primary-foreground"
                    : "text-sidebar-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {label}
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
                isActive
                  ? "bg-sidebar-primary/20 text-sidebar-primary"
                  : "text-sidebar-foreground/70"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
              <span className="flex-1 text-left truncate">{label}</span>
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform duration-200 shrink-0",
                isOpen && "rotate-180"
              )} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1">
            <ul className="space-y-1">
              {visibleItems.map((item) => renderMenuItem(item, isMobile, true))}
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

          {/* People */}
          {renderMenuGroup(menuGroups[1], isMobile, true)}

          {/* Partners */}
          {renderMenuGroup(menuGroups[2], isMobile, true)}

          {/* Staff Operations */}
          {renderMenuGroup(menuGroups[3], isMobile, true)}

          {/* Communications */}
          {renderMenuGroup(menuGroups[4], isMobile, true)}

          {/* Business */}
          {renderMenuGroup(menuGroups[5], isMobile, true)}

          {/* AI Command Centre */}
          {renderMenuGroup(menuGroups[6], isMobile, true)}

          {/* System */}
          {renderMenuGroup(menuGroups[7], isMobile, true)}
        </div>
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
              {(isMobile || !collapsed) && <span>{t("sidebar.signOut")}</span>}
            </Button>
          </TooltipTrigger>
          {!isMobile && collapsed && (
            <TooltipContent side="right" className="font-medium">
              {t("sidebar.signOut")}
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