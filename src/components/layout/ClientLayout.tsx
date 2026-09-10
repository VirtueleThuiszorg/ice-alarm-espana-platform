import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
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
import { MemberReadinessNotice } from "@/components/client/MemberReadinessNotice";
import { TextSizeControl } from "@/components/client/TextSizeControl";
import { useMemberUnread } from "@/hooks/useMemberUnread";
import { useMemberAlertHistory } from "@/hooks/useMemberAlertHistory";
import { useMemberAvatarUrl } from "@/hooks/useMemberAvatar";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { telHref } from "@/lib/phone";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  /**
   * A count to show beside the item. `undefined` means "this item has no badge"; a badge is
   * rendered only for a count GREATER THAN ZERO — a "0" beside Messages is not information, it
   * is a decoration a member has to read and dismiss every time.
   */
  badge?: number;
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
  const [searchParams] = useSearchParams();
  const { signOut, user, memberId: authMemberId } = useAuth();
  const { data: unreadCount } = useMemberUnread();
  /*
    THE NUMBER ITSELF, for the sidebar block below. `telHref` returns null when
    `settings_emergency_phone` is unset, and the block is rendered conditionally on it — the
    same "show nothing, never a fake number" rule the rest of the portal follows.
  */
  const { settings: companySettings } = useCompanySettings();
  const phoneHref = telHref(companySettings.emergency_phone);

  // Admin-view mode: staff admins open member routes with ?memberId=...
  // (see ClientDashboard); members keep using their own memberId.
  const memberId = searchParams.get("memberId") ?? authMemberId;

  const { enabled: alertHistoryEnabled } = useMemberAlertHistory();

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
        /*
          ALERT HISTORY IS BEHIND A SETTING, and off by default.

          NO ITEM AT ALL when it is off — not a disabled one, and not one that leads to a page
          that redirects. A nav entry whose destination bounces you back is the dead-control
          pattern this codebase keeps finding; `AlertHistoryPage`'s guard is the second half of
          the same rule, for a member who has the URL.

          `enabled` rather than `settled` here: hiding something while the answer is still
          unknown is safe, because an item that appears a beat late is an item that appears.
          The route guard is the one that has to wait — see `useMemberAlertHistory`.
        */
        ...(alertHistoryEnabled
          ? [{ icon: Bell, label: t("navigation.alertHistory"), path: "/dashboard/alerts" }]
          : []),
        {
          icon: MessageSquare,
          label: t("navigation.messages"),
          path: "/dashboard/messages",
          // WP6: "unread count on the nav". Same hook as the dashboard card, so the two cannot
          // disagree about what "unread" means.
          badge: unreadCount,
        }
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
        // `photo_url` so the header can show the member's own photograph, which is the whole
        // point of letting them upload one (R7). Signed on demand — the bucket is private.
        .select("first_name, last_name, email, photo_url")
        .eq("id", memberId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!memberId,
  });

  const displayName = memberInfo
    ? `${memberInfo.first_name} ${memberInfo.last_name}`
    : user?.email?.split('@')[0] || t("common.member");

  const displayEmail = memberInfo?.email || user?.email || "";

  /*
    R3's "initials avatar". Initials come from the member's NAME or not at all — the fallback
    `displayName` is an email prefix, and initials derived from `lwakeman@…` would be a plausible
    "LW" for a person who never told us their name. A generic icon says "we do not know yet",
    which is true; invented initials say something false quietly.
  */
  const initials =
    memberInfo?.first_name && memberInfo?.last_name
      ? `${memberInfo.first_name[0]}${memberInfo.last_name[0]}`.toUpperCase()
      : null;

  /*
    THE MEMBER'S OWN PHOTOGRAPH IN THE HEADER, when they have added one.

    R3 calls this slot the "initials avatar", and initials remain the fallback — a photo is
    better than initials, initials are better than a generic icon, and each step down says
    something honestly less specific. The URL is signed on demand because the bucket is
    private; a failed sign returns null and the initials show, which is a perfectly good thing
    to see rather than something to report.
  */
  const { data: avatarUrl } = useMemberAvatarUrl(memberId, memberInfo?.photo_url);

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
    const hasBadge = typeof item.badge === "number" && item.badge > 0;
    
    const linkContent = (
      <NavLink
        to={item.path}
        onClick={() => isMobile && setMobileMenuOpen(false)}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active 
            /*
              D12: *"sidebar: active item is a DARK FILL, NOT RED."*

              It was `bg-sidebar-primary`, and `--sidebar-primary` is `350 85% 42%` — the brand
              red. So the member's current page was marked in the colour R2 reserves for alerts,
              on every page, permanently. A colour that is always on screen is a colour that
              means nothing when it appears on something that matters.

              A lighter step of the sidebar's own dark blue-grey instead: clearly the current
              item, clearly not an alarm. The STAFF sidebars keep the red — D12 is a member-surface
              decision and `ICE_OPERATOR_CARD_SPEC` governs theirs — which is why this is a class
              here rather than a change to the shared `--sidebar-primary` token.
            */
            ? "bg-sidebar-accent text-sidebar-foreground ring-1 ring-inset ring-sidebar-border" 
            : "text-sidebar-foreground",
          !isMobile && collapsed && "justify-center px-2",
          isNested && !collapsed && "pl-9"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {(isMobile || !collapsed) && <span className="truncate">{item.label}</span>}
        {/*
          THE BADGE — WP6's "unread count on the nav".

          Rendered only for a count greater than zero: a "0" beside Messages is not information,
          it is a decoration a member reads and dismisses every time until they stop reading the
          number at all.

          The visible digit is `aria-hidden` and the count is announced as a SENTENCE instead —
          "3 unread messages" — because a bare "3" next to "Messages" tells a screen-reader user
          nothing about what three there are of.
        */}
        {hasBadge && (
          <>
            {isMobile || !collapsed ? (
              /* Ink, not brand red. R1 rations red to the page's one ACTION, and a nav badge is
                 not an action — it is a count. The dashboard card uses the same tone, so the
                 member sees one convention rather than two. */
              <span
                aria-hidden="true"
                data-testid={`nav-badge-${item.path}`}
                className="ml-auto shrink-0 rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background"
              >
                {item.badge}
              </span>
            ) : (
              /* COLLAPSED, the label and the number are both hidden — so a dot on the icon keeps
                 the signal. The tooltip below carries the actual count, but a tooltip only exists
                 for somebody who hovers, and the point of a badge is to be seen without asking. */
              <span
                aria-hidden="true"
                data-testid={`nav-dot-${item.path}`}
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-foreground"
              />
            )}
            {/* The count as a SENTENCE. A bare "3" beside "Messages" tells a screen-reader user
                nothing about what there are three of. */}
            <span className="sr-only">
              {t("navigation.unreadCount", "{{count}} unread messages", { count: item.badge })}
            </span>
          </>
        )}
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
              {/* Collapsed, the label is hidden and so is the badge — so the tooltip carries the
                  count, or a member who collapses the rail loses the signal entirely. */}
              {hasBadge
                ? `${item.label} — ${t("navigation.unreadCount", "{{count}} unread messages", { count: item.badge })}`
                : item.label}
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
                    /* Same as the item above: the open group is marked, not alarmed. */
                    ? "bg-sidebar-accent/60 text-sidebar-foreground" 
                    : "text-sidebar-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", active && "text-sidebar-foreground")} />
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
                  /* D12 again — the expanded group heading, marked and not alarmed. */
                  ? "bg-sidebar-accent/60 text-sidebar-foreground"
                  : "text-sidebar-foreground/70"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "text-sidebar-foreground")} />
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

      {/*
        THE 24-HOUR NUMBER — D12, and this control DID NOTHING AT ALL.

        It was a full-width `<Button size="lg">` in `bg-alert-sos`, labelled "Contact ICE Alarm
        España", on every page of the member portal — with no `onClick`, no `href` and no
        `asChild`. A member who pressed the biggest, reddest control on their own alarm account
        got nothing. On a life-safety product that is the worst kind of dead control: it is
        exactly the button somebody reaches for when they are frightened, and its colour
        promised an emergency response.

        D12 says what it should be instead, and says it precisely: *"the red 'Contact' button
        becomes an Ink block SHOWING THE 24-HOUR NUMBER."* Three things follow from that
        sentence and each is a decision:

        - IT IS AN `<a href="tel:">`, not a button. A number a member can press is the whole
          point; a button that opens a dialer is a button, but a link is what a screen reader
          announces as a phone number and what a desktop lets you copy.
        - IT SHOWS THE NUMBER. R2 (brand red is never a status) and D12 both push against the
          red block, but the deeper reason is that a member who can READ the number can write
          it on a pad by the phone, which is the thing we actually want. A button labelled
          "Contact" hides it.
        - INK, NOT `alert-sos`. `alert-sos` is the colour this product reserves for an alarm in
          progress. Spending it on a permanent piece of furniture is what makes it stop meaning
          anything when it appears on a real alert.

        AND IT IS OMITTED ENTIRELY WITH NO NUMBER CONFIGURED. WP1b: show nothing, never a fake
        number. A block that says "24-hour line" over nothing at all is worse than no block —
        and it is what the old button effectively was, for every member, all the time.
      */}
      {phoneHref && (
        <div className="border-t border-sidebar-border p-3">
          <a
            href={phoneHref}
            data-testid="sidebar-emergency-number"
            className={cn(
              "flex w-full items-center justify-center rounded-lg bg-foreground font-semibold text-background transition-colors hover:bg-foreground/90",
              collapsed && !isMobile ? "h-10 px-2" : "h-12 px-3",
            )}
          >
            <Phone
              className={cn("h-5 w-5 shrink-0", !collapsed && !isMobile && "mr-2")}
              aria-hidden="true"
            />
            {(isMobile || !collapsed) && (
              <span className="flex flex-col items-start leading-tight">
                {/* The label is small and the NUMBER is the thing, which is the point of D12. */}
                <span className="text-[0.6875rem] font-medium uppercase tracking-wide opacity-80">
                  {t("dashboard.twentyFourHourLine", "24-hour line")}
                </span>
                <span className="text-sm tabular-nums">{companySettings.emergency_phone}</span>
              </span>
            )}
            {/* Collapsed the number is hidden, so the accessible name carries it. */}
            <span className="sr-only">
              {t("dashboard.callTwentyFourHour", "Call our 24-hour line: {{number}}", {
                number: companySettings.emergency_phone,
              })}
            </span>
          </a>
        </div>
      )}

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
    // "theme-member" scopes the member dashboard token block (see index.css) to
    // every /dashboard route in one place. This is the one customer-facing
    // logged-in surface, so its wash is the WARM public cream rather than the
    // internal aqua — a member never crosses a palette boundary at login.
    <div className="theme-member min-h-screen bg-background text-foreground">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <Logo variant="sidebar" size="sm" />
        {/*
          The A/A on mobile too, and not buried in the menu sheet. A member who cannot read the
          screen cannot reliably find a control hidden behind a hamburger — the one thing that
          fixes the problem must not be gated on solving it first. Two 36px buttons fit beside a
          logo and a menu button; nothing else was competing for the space.
        */}
        <div className="ml-auto mr-2">
          <TextSizeControl className="border-sidebar-border" />
        </div>
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
            <SheetTitle>{t("navigation.menu", "Navigation Menu")}</SheetTitle>
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
          {/*
            R3's LEFT slot. It stood empty since the unwired search input was removed, and it is
            the place D10 names for the readiness notice: "left of Assistant / bell / language /
            name. Never a standalone banner."
          */}
          <div className="flex min-w-0 items-center gap-4">
            <MemberReadinessNotice memberId={memberId} variant="header" />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* AI Chat Button */}
            <MemberChatButton memberId={memberId} />

            {/* Notification Bell */}
            <NotificationBell staffId={null} />

            {/* R3's order: Assistant, bell, A/A text size, EN/ES, name. */}
            <TextSizeControl />

            {/* Language Selector */}
            <LanguageSelector variant="icon-only" />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2" data-testid="member-account-trigger">
                  <div
                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary"
                    data-testid="member-initials"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        data-testid="member-header-photo"
                      />
                    ) : initials ? (
                      <span className="text-xs font-semibold text-primary-foreground">
                        {initials}
                      </span>
                    ) : (
                      <User className="h-4 w-4 text-primary-foreground" />
                    )}
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

        {/*
          THE MOBILE PLACEMENT, and the standalone banner is gone (D10).

          A phone header is 64px with a logo and a menu button in it; there is no room for a
          sentence, and truncating a life-safety sentence to make one is the wrong trade. So on
          mobile the notice sits directly beneath the fixed header — still layout chrome rather
          than page content, which is what D10's "standalone banner" is about.

          `md:hidden` because the desktop copy lives in the header's left slot above. Both are
          the same component and the same one sentence.
        */}
        <MemberReadinessNotice memberId={memberId} variant="bar" className="md:hidden" />

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