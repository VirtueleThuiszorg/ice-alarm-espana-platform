import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Users,
  Smartphone,
  Handshake,
  AlertTriangle,
  ShoppingCart,
  LayoutDashboard,
  Settings,
  BarChart3,
  MessageSquare,
  ClipboardList,
  Ticket,
  UserPlus,
  DollarSign,
  CreditCard,
  FileText,
  Brain,
  Image,
  Video,
  Phone,
  Target,
  Activity,
  User,
  Heart,
  Shield,
  Headphones,
  Mail,
  Loader2,
  FileSpreadsheet,
  Contact,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface SearchResult {
  id: string;
  label: string;
  description?: string;
  path: string;
  icon: React.ReactNode;
}

interface NavigationItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  /** Who can see this nav item */
  access: "all" | "staff" | "partner" | "member";
}

// ------------------------------------------------------------------
// Static navigation pages
// ------------------------------------------------------------------

const NAVIGATION_ITEMS: NavigationItem[] = [
  // Admin pages
  { label: "Admin Dashboard", path: "/admin", icon: <LayoutDashboard className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Members", path: "/admin/members", icon: <Users className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Add Member", path: "/admin/members/new", icon: <UserPlus className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Devices", path: "/admin/devices", icon: <Smartphone className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Partners", path: "/admin/partners", icon: <Handshake className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Add Partner", path: "/admin/partners/new", icon: <UserPlus className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Alerts", path: "/admin/alerts", icon: <AlertTriangle className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Orders", path: "/admin/orders", icon: <ShoppingCart className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Subscriptions", path: "/admin/subscriptions", icon: <CreditCard className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Payments", path: "/admin/payments", icon: <DollarSign className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Finance Dashboard", path: "/admin/finance", icon: <DollarSign className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Staff Management", path: "/admin/staff", icon: <Users className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Reports", path: "/admin/reports", icon: <FileText className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Analytics", path: "/admin/analytics", icon: <BarChart3 className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Messages", path: "/admin/messages", icon: <MessageSquare className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Tasks", path: "/admin/tasks", icon: <ClipboardList className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Tickets", path: "/admin/tickets", icon: <Ticket className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Leads", path: "/admin/leads", icon: <Target className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Commissions", path: "/admin/commissions", icon: <DollarSign className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Partners QA", path: "/admin/partners-qa", icon: <Handshake className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "AI Command Centre", path: "/admin/ai", icon: <Brain className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Isabella Operations", path: "/admin/ai/operations", icon: <Brain className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "CRM Import", path: "/admin/crm-import", icon: <FileSpreadsheet className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Import Batches", path: "/admin/crm-import/batches", icon: <FileSpreadsheet className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "CRM Contacts", path: "/admin/crm-contacts", icon: <Contact className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "EV07B Products", path: "/admin/ev07b", icon: <Smartphone className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Media Manager", path: "/admin/media-manager", icon: <Image className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "AI Outreach", path: "/admin/ai-outreach", icon: <Mail className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Video Hub", path: "/admin/video-hub", icon: <Video className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Communications", path: "/admin/communications", icon: <Phone className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Partner Pricing", path: "/admin/partner-pricing", icon: <DollarSign className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Settings", path: "/admin/settings", icon: <Settings className="mr-2 h-4 w-4" />, access: "staff" },

  // Call-centre pages (staff but not necessarily admin)
  { label: "Call Centre Dashboard", path: "/call-centre", icon: <Phone className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Call Centre Alerts", path: "/call-centre/alerts", icon: <AlertTriangle className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Call Centre Members", path: "/call-centre/members", icon: <Users className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Shift Notes", path: "/call-centre/shift-notes", icon: <ClipboardList className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Shift History", path: "/call-centre/shift-history", icon: <FileText className="mr-2 h-4 w-4" />, access: "staff" },
  { label: "Staff Preferences", path: "/call-centre/preferences", icon: <Settings className="mr-2 h-4 w-4" />, access: "staff" },

  // Partner pages
  { label: "Partner Dashboard", path: "/partner-dashboard", icon: <LayoutDashboard className="mr-2 h-4 w-4" />, access: "partner" },
  { label: "Partner Invites", path: "/partner-dashboard/invites", icon: <UserPlus className="mr-2 h-4 w-4" />, access: "partner" },
  { label: "Partner Marketing", path: "/partner-dashboard/marketing", icon: <Target className="mr-2 h-4 w-4" />, access: "partner" },
  { label: "Partner Commissions", path: "/partner-dashboard/commissions", icon: <DollarSign className="mr-2 h-4 w-4" />, access: "partner" },
  { label: "Partner Agreement", path: "/partner-dashboard/agreement", icon: <FileText className="mr-2 h-4 w-4" />, access: "partner" },
  { label: "Partner Settings", path: "/partner-dashboard/settings", icon: <Settings className="mr-2 h-4 w-4" />, access: "partner" },
  { label: "Partner Members", path: "/partner-dashboard/members", icon: <Users className="mr-2 h-4 w-4" />, access: "partner" },
  { label: "Partner Alerts", path: "/partner-dashboard/alerts", icon: <AlertTriangle className="mr-2 h-4 w-4" />, access: "partner" },

  // Client / Member pages
  { label: "My Dashboard", path: "/dashboard", icon: <LayoutDashboard className="mr-2 h-4 w-4" />, access: "member" },
  { label: "My Profile", path: "/dashboard/profile", icon: <User className="mr-2 h-4 w-4" />, access: "member" },
  { label: "Medical Info", path: "/dashboard/medical", icon: <Heart className="mr-2 h-4 w-4" />, access: "member" },
  { label: "Emergency Contacts", path: "/dashboard/contacts", icon: <Shield className="mr-2 h-4 w-4" />, access: "member" },
  { label: "My Device", path: "/dashboard/device", icon: <Smartphone className="mr-2 h-4 w-4" />, access: "member" },
  { label: "My Subscription", path: "/dashboard/subscription", icon: <CreditCard className="mr-2 h-4 w-4" />, access: "member" },
  { label: "Alert History", path: "/dashboard/alerts", icon: <AlertTriangle className="mr-2 h-4 w-4" />, access: "member" },
  { label: "Support", path: "/dashboard/support", icon: <Headphones className="mr-2 h-4 w-4" />, access: "member" },
  { label: "My Messages", path: "/dashboard/messages", icon: <MessageSquare className="mr-2 h-4 w-4" />, access: "member" },

  // Public pages (visible to everyone who is logged in)
  { label: "Home", path: "/", icon: <Activity className="mr-2 h-4 w-4" />, access: "all" },
  { label: "Contact", path: "/contact", icon: <Phone className="mr-2 h-4 w-4" />, access: "all" },
  { label: "Pendant", path: "/pendant", icon: <Smartphone className="mr-2 h-4 w-4" />, access: "all" },
  { label: "Blog", path: "/blog", icon: <FileText className="mr-2 h-4 w-4" />, access: "all" },
];

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [memberResults, setMemberResults] = useState<SearchResult[]>([]);
  const [deviceResults, setDeviceResults] = useState<SearchResult[]>([]);
  const [partnerResults, setPartnerResults] = useState<SearchResult[]>([]);
  const [alertResults, setAlertResults] = useState<SearchResult[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useNavigate();
  const { user, isStaff, isPartner, memberId } = useAuth();

  // ----------------------------------------------------------------
  // Keyboard shortcut: Cmd+K / Ctrl+K
  // ----------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ----------------------------------------------------------------
  // Reset results when the dialog closes
  // ----------------------------------------------------------------

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMemberResults([]);
      setDeviceResults([]);
      setPartnerResults([]);
      setAlertResults([]);
      setIsSearching(false);
    }
  }, [open]);

  // ----------------------------------------------------------------
  // Debounced Supabase search
  // ----------------------------------------------------------------

  const searchSupabase = useCallback(
    async (term: string) => {
      if (!term || term.length < 2 || !isStaff) {
        setMemberResults([]);
        setDeviceResults([]);
        setPartnerResults([]);
        setAlertResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      const sanitised = term.trim();
      const ilike = `%${sanitised}%`;

      try {
        // Run all queries in parallel
        const [membersRes, devicesRes, partnersRes, alertsRes] =
          await Promise.all([
            // Members: search by first_name, last_name, email
            supabase
              .from("members")
              .select("id, first_name, last_name, email")
              .or(
                `first_name.ilike.${ilike},last_name.ilike.${ilike},email.ilike.${ilike}`,
              )
              .limit(6),

            // Devices: search by imei, serial_number
            supabase
              .from("devices")
              .select("id, imei, serial_number, status")
              .or(`imei.ilike.${ilike},serial_number.ilike.${ilike}`)
              .limit(6),

            // Partners: search by company_name, contact_name
            supabase
              .from("partners")
              .select("id, company_name, contact_name")
              .or(
                `company_name.ilike.${ilike},contact_name.ilike.${ilike}`,
              )
              .limit(6),

            // Alerts: search by id (cast to text via textual match)
            /^\d+$/.test(sanitised)
              ? supabase
                  .from("alerts")
                  .select("id, alert_type, status, received_at")
                  .eq("id", sanitised)
                  .limit(6)
              : Promise.resolve({ data: [], error: null }),
          ]);

        // Map members
        if (membersRes.data) {
          setMemberResults(
            membersRes.data.map((m) => ({
              id: m.id,
              label: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Unnamed",
              description: m.email ?? undefined,
              path: `/admin/members/${m.id}`,
              icon: <Users className="mr-2 h-4 w-4" />,
            })),
          );
        }

        // Map devices
        if (devicesRes.data) {
          setDeviceResults(
            devicesRes.data.map((d) => ({
              id: d.id,
              label: d.imei ?? d.serial_number ?? "Unknown Device",
              description: d.serial_number
                ? `SN: ${d.serial_number}`
                : undefined,
              path: `/admin/devices/${d.id}`,
              icon: <Smartphone className="mr-2 h-4 w-4" />,
            })),
          );
        }

        // Map partners
        if (partnersRes.data) {
          setPartnerResults(
            partnersRes.data.map((p) => ({
              id: p.id,
              label: p.company_name ?? "Unknown Partner",
              description: p.contact_name ?? undefined,
              path: `/admin/partners/${p.id}`,
              icon: <Handshake className="mr-2 h-4 w-4" />,
            })),
          );
        }

        // Map alerts
        if (alertsRes.data && alertsRes.data.length > 0) {
          setAlertResults(
            alertsRes.data.map((a) => ({
              id: String(a.id),
              label: `Alert #${a.id}`,
              description: `${a.alert_type ?? "Unknown"} - ${a.status ?? ""}`,
              path: `/admin/alerts`,
              icon: <AlertTriangle className="mr-2 h-4 w-4" />,
            })),
          );
        } else {
          setAlertResults([]);
        }
      } catch (err) {
        console.error("[GlobalSearch] Search error:", err);
      } finally {
        setIsSearching(false);
      }
    },
    [isStaff],
  );

  // Debounce the search by 300ms
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!query || query.length < 2) {
      setMemberResults([]);
      setDeviceResults([]);
      setPartnerResults([]);
      setAlertResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimer.current = setTimeout(() => {
      searchSupabase(query);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query, searchSupabase]);

  // ----------------------------------------------------------------
  // Navigation items filtered by role and search term
  // ----------------------------------------------------------------

  const filteredNavItems = NAVIGATION_ITEMS.filter((item) => {
    // Role check
    if (item.access === "staff" && !isStaff) return false;
    if (item.access === "partner" && !isPartner) return false;
    if (item.access === "member" && !memberId) return false;

    // Search filter (when there is a query)
    if (query.length > 0) {
      return item.label.toLowerCase().includes(query.toLowerCase());
    }
    return true;
  });

  // ----------------------------------------------------------------
  // Select handler
  // ----------------------------------------------------------------

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  // ----------------------------------------------------------------
  // Determine if there are any data results
  // ----------------------------------------------------------------

  const hasDataResults =
    memberResults.length > 0 ||
    deviceResults.length > 0 ||
    partnerResults.length > 0 ||
    alertResults.length > 0;

  const hasAnyResults = hasDataResults || filteredNavItems.length > 0;

  // Don't render if the user is not logged in
  if (!user) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type to search..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Empty / loading states */}
        {isSearching && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching...
          </div>
        )}

        {!isSearching && query.length >= 2 && !hasAnyResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {!isSearching && query.length < 2 && filteredNavItems.length === 0 && (
          <CommandEmpty>Type to search...</CommandEmpty>
        )}

        {/* ---- Data results (staff only) ---- */}

        {memberResults.length > 0 && (
          <CommandGroup heading="Members">
            {memberResults.map((r) => (
              <CommandItem
                key={r.id}
                value={`member-${r.id}-${r.label}`}
                onSelect={() => handleSelect(r.path)}
              >
                {r.icon}
                <span>{r.label}</span>
                {r.description && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {r.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {deviceResults.length > 0 && (
          <CommandGroup heading="Devices">
            {deviceResults.map((r) => (
              <CommandItem
                key={r.id}
                value={`device-${r.id}-${r.label}`}
                onSelect={() => handleSelect(r.path)}
              >
                {r.icon}
                <span>{r.label}</span>
                {r.description && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {r.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {partnerResults.length > 0 && (
          <CommandGroup heading="Partners">
            {partnerResults.map((r) => (
              <CommandItem
                key={r.id}
                value={`partner-${r.id}-${r.label}`}
                onSelect={() => handleSelect(r.path)}
              >
                {r.icon}
                <span>{r.label}</span>
                {r.description && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {r.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {alertResults.length > 0 && (
          <CommandGroup heading="Alerts">
            {alertResults.map((r) => (
              <CommandItem
                key={r.id}
                value={`alert-${r.id}-${r.label}`}
                onSelect={() => handleSelect(r.path)}
              >
                {r.icon}
                <span>{r.label}</span>
                {r.description && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {r.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Separator between data and nav results */}
        {hasDataResults && filteredNavItems.length > 0 && <CommandSeparator />}

        {/* ---- Navigation pages ---- */}
        {filteredNavItems.length > 0 && (
          <CommandGroup heading="Pages">
            {filteredNavItems.map((item) => (
              <CommandItem
                key={item.path}
                value={`page-${item.path}-${item.label}`}
                onSelect={() => handleSelect(item.path)}
              >
                {item.icon}
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
