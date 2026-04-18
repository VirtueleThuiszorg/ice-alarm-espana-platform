import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Send,
  DollarSign,
  Settings,
  LogOut,
  ArrowLeft,
  ChevronLeft,
  Menu,
  Megaphone,
  FileSignature,
  Users,
  Bell,
  HelpCircle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerData } from "@/hooks/usePartnerData";
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

interface PartnerSidebarProps {
  isMobile?: boolean;
  isAdminViewMode?: boolean;
  partnerIdParam?: string | null;
}

interface MenuItem {
  icon: React.ElementType;
  labelKey: string;
  path: string;
  showFor?: ("referral" | "care" | "residential")[];
  requireAlertVisibility?: boolean;
}

// Base nav items available to all partner types
const baseNavItems: MenuItem[] = [
  { labelKey: "sidebar.dashboard", icon: LayoutDashboard, path: "/partner-dashboard" },
  { labelKey: "sidebar.invites", icon: Send, path: "/partner-dashboard/invites" },
  { labelKey: "sidebar.marketing", icon: Megaphone, path: "/partner-dashboard/marketing" },
  { labelKey: "sidebar.commissions", icon: DollarSign, path: "/partner-dashboard/commissions" },
];

// Items only for care/residential partners
const b2bNavItems: MenuItem[] = [
  { 
    labelKey: "sidebar.members", 
    icon: Users, 
    path: "/partner-dashboard/members",
    showFor: ["care", "residential"]
  },
  { 
    labelKey: "sidebar.alerts", 
    icon: Bell, 
    path: "/partner-dashboard/alerts",
    showFor: ["residential"],
    requireAlertVisibility: true
  },
];

// Items available to all
const footerNavItems: MenuItem[] = [
  { labelKey: "sidebar.agreement", icon: FileSignature, path: "/partner-dashboard/agreement" },
  { labelKey: "sidebar.support", icon: HelpCircle, path: "/partner-dashboard/support" },
  { labelKey: "sidebar.settings", icon: Settings, path: "/partner-dashboard/settings" },
];

interface ExtendedPartnerSidebarProps extends PartnerSidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function PartnerSidebar({ isMobile = false, isAdminViewMode = false, partnerIdParam, onCollapsedChange }: ExtendedPartnerSidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  // Notify parent of collapse state changes
  const handleCollapse = (value: boolean) => {
    setCollapsed(value);
    onCollapsedChange?.(value);
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isStaff, staffRole } = useAuth();

  // Admin view mode detection for fetching partner data
  const isAdminRole = isStaff && (staffRole === "admin" || staffRole === "super_admin");
  const effectiveIsAdminViewMode = isAdminViewMode || (isAdminRole && !!partnerIdParam);

  // Fetch partner data to determine partner type and alert visibility
  const { data: partner } = usePartnerData(
    effectiveIsAdminViewMode ? partnerIdParam ?? undefined : undefined
  );

  // Build nav items based on partner type
  const getNavItems = (): MenuItem[] => {
    const partnerType = partner?.partner_type || "referral";
    const alertsEnabled = partner?.alert_visibility_enabled || false;

    const items: MenuItem[] = [...baseNavItems];

    // Add B2B items based on partner type
    for (const item of b2bNavItems) {
      if (item.showFor && item.showFor.includes(partnerType as "referral" | "care" | "residential")) {
        // Check alert visibility requirement
        if (item.requireAlertVisibility && !alertsEnabled) {
          continue;
        }
        items.push(item);
      }
    }

    // Add footer items
    items.push(...footerNavItems);

    return items;
  };

  const navItems = getNavItems();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // When in admin view mode, append partnerId to all links
  const getHref = (baseHref: string) => {
    if (effectiveIsAdminViewMode && partnerIdParam) {
      return `${baseHref}?partnerId=${partnerIdParam}`;
    }
    return baseHref;
  };

  const isActive = (path: string) => {
    const basePath = path.split("?")[0];
    if (basePath === "/partner-dashboard") {
      return location.pathname === "/partner-dashboard";
    }
    return location.pathname.startsWith(basePath);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/partner/login");
  };

  const renderMenuItem = (item: MenuItem, isMobileView: boolean) => {
    const href = getHref(item.path);
    const active = isActive(item.path);
    const Icon = item.icon;
    const label = t(item.labelKey);
    
    const linkContent = (
      <NavLink
        to={href}
        onClick={() => isMobileView && setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active 
            ? "bg-sidebar-primary text-sidebar-primary-foreground" 
            : "text-sidebar-foreground",
          !isMobileView && collapsed && "justify-center px-2"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {(isMobileView || !collapsed) && <span>{label}</span>}
      </NavLink>
    );

    if (!isMobileView && collapsed) {
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

  const SidebarContent = ({ isMobileView = false }: { isMobileView?: boolean }) => (
    <>
      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border h-16 px-4",
        !isMobileView && collapsed && "justify-center px-2"
      )}>
        <Logo variant="sidebar" size="sm" showText={isMobileView || !collapsed} />
      </div>

      {/* Admin View Mode - Back to Admin */}
      {effectiveIsAdminViewMode && (
        <div className="p-3 border-b border-sidebar-border bg-sidebar-accent/50">
          <Button 
            variant="outline" 
            size="sm" 
            className={cn(
              "w-full justify-start gap-2",
              !isMobileView && collapsed && "justify-center px-2"
            )}
            onClick={() => navigate("/admin/partners")}
          >
            <ArrowLeft className="h-4 w-4" />
            {(isMobileView || !collapsed) && <span>{t("sidebar.backToPartners")}</span>}
          </Button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => renderMenuItem(item, isMobileView))}
        </ul>
      </nav>

      {/* Sign out - only show for actual partners, not admin viewing */}
      {!isAdminViewMode && (
        <div className="border-t border-sidebar-border p-3">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                onClick={handleSignOut}
                className={cn(
                  "w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  !isMobileView && collapsed && "justify-center px-2"
                )}
              >
                <LogOut className="h-5 w-5" />
                {(isMobileView || !collapsed) && <span>{t("sidebar.signOut")}</span>}
              </Button>
            </TooltipTrigger>
            {!isMobileView && collapsed && (
              <TooltipContent side="right" className="font-medium">
                {t("sidebar.signOut")}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      )}
    </>
  );

  // If used as inline (isMobile prop from parent), render simple content
  if (isMobile) {
    return (
      <aside className="w-64 min-h-full bg-sidebar flex flex-col">
        <SidebarContent isMobileView />
      </aside>
    );
  }

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
            <SidebarContent isMobileView />
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