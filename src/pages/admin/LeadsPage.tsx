import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { LeadContactValue, LeadName } from "@/components/leads/LeadContact";
import { LeadNotSpamButton, LeadSpamBadge } from "@/components/leads/LeadSpamFlag";
import { LeadIntroduceSection } from "@/components/leads/LeadIntroduceSection";
import { LeadTimeline } from "@/components/leads/LeadTimeline";
import { AddLeadDialog } from "@/components/leads/AddLeadDialog";
import { DEFAULT_FOLLOWUP_DAYS, FOLLOWUP_STATUSES, followUpCutoff } from "@/lib/leadFollowUp";
import { LEAD_STATUSES } from "@/lib/leadStatus";
import { exportToCsv, type CsvColumnConfig } from "@/lib/csvExporter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { 
  Search, 
  Phone, 
  Mail, 
  User,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  UserPlus,
  MessageSquare,
  RefreshCw,
  MoreHorizontal,
  ExternalLink,
  FileEdit,
  AlertTriangle,
  Trash2
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  preferred_language: string;
  enquiry_type: string;
  message: string | null;
  source: string;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  converted_member_id: string | null;
  created_at: string;
  contacted_at: string | null;
  converted_at: string | null;
  /** `public-submit`'s guess. Suppresses the bell and nothing else — see LeadSpamFlag. */
  suspected_spam: boolean | null;
  spam_reasons: string[] | null;
  last_contacted_at: string | null;
  last_contact_channel: string | null;
  do_not_contact: boolean | null;
  heard_about: string | null;
  assigned_staff?: {
    first_name: string;
    last_name: string;
  };
}

interface RegistrationDraft {
  id: string;
  session_id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  current_step: number;
  schema_version?: number;
  wizard_data: {
    membershipType?: string;
    billingFrequency?: string;
    includePendant?: boolean;
    address?: { city?: string } | null;
    emergencyContacts?: unknown[];
  } | null;
  source: string;
  status: string;
  converted_member_id: string | null;
  created_at: string;
  updated_at: string;
  abandoned_at: string | null;
}

interface Staff {
  id: string;
  first_name: string;
  last_name: string;
}

/**
 * Step names PER DRAFT SCHEMA VERSION.
 *
 * This was a single flat array with a hardcoded "of 8" denominator, and it was wrong twice
 * over: the wizard had NINE steps, and the array listed "Medical Info" at index 4 with
 * "Emergency Contacts" at 5 while the wizard had contacts at 4 and medical at 5. So an
 * abandoned draft was reported at the wrong step, by name, with the wrong percentage.
 *
 * A raw step number is only interpretable together with the version that wrote it
 * (registration_drafts.schema_version). ONBOARDING_SPLIT.md §4-B.
 */
const STEP_NAMES_BY_VERSION: Record<number, string[]> = {
  // v1 — the nine-step wizard. Contacts at 4, medical at 5, as the wizard actually had them.
  1: [
    "Not Started",
    "Plan Selection",
    "Personal Details",
    "Address",
    "Emergency Contacts",
    "Medical Info",
    "Device Selection",
    "Review & Checkout",
    "Payment",
    "Complete",
  ],
  // v2 — the seven-step wizard. Contacts and medical are collected after payment.
  2: [
    "Not Started",
    "Plan Selection",
    "Personal Details",
    "Address",
    "Device Selection",
    "Review & Checkout",
    "Payment",
    "Complete",
  ],
};

/** Steps a member actually walks, excluding the "Not Started" sentinel at index 0. */
const stepTotalForVersion = (version: number) =>
  (STEP_NAMES_BY_VERSION[version] ?? STEP_NAMES_BY_VERSION[2]).length - 1;

export default function LeadsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<RegistrationDraft[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  /*
    "all" | "spam" | "clean". DEFAULT "all", deliberately: a flag set by three heuristics is a
    guess, and a list that hides what it guessed is a list nobody can check. The filter is here
    so somebody can work through the flagged ones, not so they disappear.
  */
  const [filterSpam, setFilterSpam] = useState("all");
  /*
    FOLLOW UP TODAY. A lead goes quiet not because anybody decided to leave it, but because the
    operator working it had four other things on that morning. This is the list of people who
    were told somebody would be in touch and then were not.
  */
  const [filterFollowUp, setFilterFollowUp] = useState(false);
  const [filterSource, setFilterSource] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [followUpDays, setFollowUpDays] = useState(DEFAULT_FOLLOWUP_DAYS);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<RegistrationDraft | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [draftDetailOpen, setDraftDetailOpen] = useState(false);
  const [notes, setNotes] = useState("");
  // Bumped after a send so the timeline re-reads without the dialog having to close.
  const [commsKey, setCommsKey] = useState(0);
  const [activeTab, setActiveTab] = useState("leads");
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  useEffect(() => {
    fetchLeads();
    fetchDrafts();
    fetchStaff();
    fetchFollowUpDays();

    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_drafts' }, () => {
        fetchDrafts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterStatus, filterType, filterSpam, filterSource, filterAssignee, filterFollowUp, followUpDays]);

  const fetchLeads = async () => {
    setLoading(true);
    let query = supabase
      .from('leads')
      .select(`
        *,
        assigned_staff:staff!leads_assigned_to_fkey(first_name, last_name)
      `)
      .order('created_at', { ascending: false });

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }
    if (filterType !== 'all') {
      query = query.eq('enquiry_type', filterType);
    }
    if (filterSource !== 'all') {
      query = query.eq('source', filterSource);
    }
    if (filterAssignee === 'unassigned') {
      query = query.is('assigned_to', null);
    } else if (filterAssignee !== 'all') {
      query = query.eq('assigned_to', filterAssignee);
    }
    if (filterFollowUp) {
      /*
        THE CUT-OFF IS COMPUTED ONCE, in `leadFollowUp.ts`, so this query and the runner that
        bells the assignee ask the same question. Two places computing "three days ago" is two
        places that disagree the first time one of them is changed.

        `.or()` because a lead nobody has ever written to has a NULL `last_contacted_at`, and
        those are the ones most likely to have been forgotten — not the least.
      */
      const cutoff = followUpCutoff(followUpDays);
      query = query
        .in('status', FOLLOWUP_STATUSES as unknown as string[])
        .not('do_not_contact', 'is', true)
        .or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff}`);
    }
    if (filterSpam === 'spam') {
      query = query.eq('suspected_spam', true);
    } else if (filterSpam === 'clean') {
      // `is` rather than `eq`: the column defaults to false, but rows written before it existed
      // hold NULL, and `eq('suspected_spam', false)` would drop every one of them.
      query = query.not('suspected_spam', 'is', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching leads:', error);
      toast.error("Failed to load leads");
    } else {
      setLeads(data as Lead[] || []);
    }
    setLoading(false);
  };

  const fetchDrafts = async () => {
    setDraftsLoading(true);
    const { data, error } = await supabase
      .from('registration_drafts')
      .select('*')
      .neq('status', 'converted')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching drafts:', error);
    } else {
      setDrafts((data as unknown as RegistrationDraft[]) || []);
    }
    setDraftsLoading(false);
  };

  /*
    `lead_followup_days` is a row so it can become 5 by editing a value rather than by shipping
    code. Read once; a failure leaves the seeded default, which is the behaviour anybody expects
    from a setting nobody has touched.
  */
  /**
   * ADMIN ONLY, and it is the list on screen rather than the whole table.
   *
   * A CSV of every lead the business has ever had is a different object from a CSV of the
   * thirty an admin is currently looking at: one is a working file, the other is the marketing
   * list of every person who ever enquired, leaving the building on a laptop. Exporting what is
   * filtered means the filters are the access control, which is at least visible.
   *
   * `contact_consent_at` is a column on purpose. A row in this file that nobody agreed to be
   * contacted about is a row whoever opens the file needs to know about.
   */
  const exportLeadsCsv = () => {
    const columns: CsvColumnConfig<Record<string, unknown>>[] = [
      { key: "first_name", header: "First name" },
      { key: "last_name", header: "Surname" },
      { key: "email", header: "Email" },
      { key: "phone", header: "Phone" },
      { key: "preferred_language", header: "Language" },
      { key: "status", header: "Status" },
      { key: "source", header: "Source" },
      { key: "heard_about", header: "How they heard of us" },
      {
        key: "assigned_staff",
        header: "Assigned to",
        formatter: (v) => {
          const s = v as { first_name?: string; last_name?: string } | null;
          return s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "";
        },
      },
      {
        key: "last_contacted_at",
        header: "Last contacted",
        formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
      },
      { key: "last_contact_channel", header: "By" },
      {
        key: "contact_consent_at",
        header: "Consent recorded",
        formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
      },
      {
        key: "created_at",
        header: "Added",
        formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
      },
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    exportToCsv(filteredLeads as unknown as Record<string, unknown>[], `leads-${stamp}.csv`, columns);
    toast.success(t("leads.exported", "{{count}} leads exported", { count: filteredLeads.length }));
  };

  const fetchFollowUpDays = async () => {
    const { data } = await supabase
      .from("system_settings").select("value").eq("key", "lead_followup_days").maybeSingle();
    const n = Number(data?.value);
    if (Number.isFinite(n) && n > 0) setFollowUpDays(n);
  };

  const fetchStaff = async () => {
    const { data } = await supabase
      .from('staff')
      .select('id, first_name, last_name')
      .eq('is_active', true);
    setStaff(data || []);
  };

  /**
   * ONE PRESS AND IT IS AN ORDINARY ENQUIRY AGAIN.
   *
   * It clears the flag only. It does not change the status, does not ring the bell
   * retrospectively, and does not tell the sender anything — the flag was never visible to them.
   * `spam_reasons` is cleared with it: keeping the reasons on a lead somebody has judged real
   * would leave the tooltip explaining why we still think it is spam.
   */
  const clearSpamFlag = async (leadId: string) => {
    const { error } = await supabase
      .from('leads')
      .update({ suspected_spam: false, spam_reasons: null } as TablesUpdate<"leads">)
      .eq('id', leadId);
    if (error) {
      console.error('Error clearing the spam flag:', error);
      toast.error("Could not clear the flag");
      return;
    }
    toast.success("Marked as a real enquiry");
    setSelectedLead((prev) =>
      prev && prev.id === leadId ? { ...prev, suspected_spam: false, spam_reasons: null } : prev,
    );
    fetchLeads();
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    const updateData: TablesUpdate<"leads"> = { status };
    if (status === 'contacted') {
      updateData.contacted_at = new Date().toISOString();
    }
    if (status === 'converted') {
      updateData.converted_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId);

    if (error) {
      toast.error("Failed to update lead status");
    } else {
      toast.success(`Lead marked as ${status}`);
      fetchLeads();
    }
  };

  const assignLead = async (leadId: string, staffId: string) => {
    const { error } = await supabase
      .from('leads')
      .update({ assigned_to: staffId })
      .eq('id', leadId);

    if (error) {
      toast.error("Failed to assign lead");
    } else {
      toast.success("Lead assigned successfully");
      fetchLeads();
    }
  };

  const deleteLead = async (leadId: string) => {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      toast.error("Failed to delete lead");
    } else {
      toast.success("Lead deleted");
      setLeadToDelete(null);
      fetchLeads();
    }
  };

  const saveNotes = async () => {
    if (!selectedLead) return;
    
    const { error } = await supabase
      .from('leads')
      .update({ notes })
      .eq('id', selectedLead.id);

    if (error) {
      toast.error("Failed to save notes");
    } else {
      toast.success("Notes saved");
      fetchLeads();
    }
  };

  const convertToMember = (lead: Lead) => {
    // Navigate to add member wizard with pre-filled data
    navigate('/admin/members/new', { 
      state: { 
        leadData: {
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          phone: lead.phone,
          preferred_language: lead.preferred_language
        },
        leadId: lead.id
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30">New</Badge>;
      case 'contacted':
        return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">Contacted</Badge>;
      case 'qualified':
        return <Badge className="bg-purple-500/20 text-purple-700 border-purple-500/30">Qualified</Badge>;
      case 'converted':
        return <Badge className="bg-status-active/20 text-status-active border-status-active/30">Converted</Badge>;
      case 'lost':
        return <Badge variant="secondary">Lost</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getEnquiryTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      general: 'General',
      pricing: 'Pricing',
      demo: 'Demo Request',
      partnership: 'Partnership',
      support: 'Support'
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  const filteredLeads = leads.filter(lead => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    /*
      EVERY FIELD OPTIONAL-CHAINED. These columns are typed `string` but the table accepts
      empty and NULL, and `lead.first_name.toLowerCase()` on the row that started all this
      would throw inside a filter — blanking the whole list the moment somebody typed in the
      search box, on the one row they were most likely searching for.
    */
    return (
      (lead.first_name ?? "").toLowerCase().includes(search) ||
      (lead.last_name ?? "").toLowerCase().includes(search) ||
      (lead.email ?? "").toLowerCase().includes(search) ||
      (lead.phone ?? "").includes(search)
    );
  });

  const filteredDrafts = drafts.filter(draft => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      (draft.first_name?.toLowerCase() || '').includes(search) ||
      (draft.last_name?.toLowerCase() || '').includes(search) ||
      (draft.email?.toLowerCase() || '').includes(search) ||
      (draft.phone || '').includes(search)
    );
  });

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    converted: leads.filter(l => l.status === 'converted').length
  };

  const draftStats = {
    total: drafts.length,
    inProgress: drafts.filter(d => d.status === 'in_progress').length,
    abandoned: drafts.filter(d => d.status === 'abandoned').length,
    withEmail: drafts.filter(d => d.email).length
  };

  const getDraftStatusBadge = (draft: RegistrationDraft) => {
    const hoursSinceUpdate = (Date.now() - new Date(draft.updated_at).getTime()) / (1000 * 60 * 60);
    
    if (draft.status === 'converted') {
      return <Badge className="bg-status-active/20 text-status-active border-status-active/30">Converted</Badge>;
    }
    if (hoursSinceUpdate > 24) {
      return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">Abandoned</Badge>;
    }
    return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30">In Progress</Badge>;
  };

  const getStepProgress = (step: number, schemaVersion = 1) => {
    const names = STEP_NAMES_BY_VERSION[schemaVersion] ?? STEP_NAMES_BY_VERSION[2];
    const total = stepTotalForVersion(schemaVersion);
    // Clamped: a step beyond the version's own length means the row and the version disagree,
    // and reporting 137% would hide that rather than show it.
    const percentage = total > 0 ? Math.min(100, Math.round((step / total) * 100)) : 0;
    return {
      step,
      total,
      percentage,
      name: names[step] || `Step ${step}`,
      version: schemaVersion,
    };
  };

  const formatDraftName = (draft: RegistrationDraft) => {
    if (draft.first_name || draft.last_name) {
      return `${draft.first_name || ''} ${draft.last_name || ''}`.trim();
    }
    return 'Unknown';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold tracking-tight">{t("adminLeads.title", "Leads")}</h1>
           <p className="text-muted-foreground">
             {t("adminLeads.subtitle", "Manage contact form submissions and prospective members")}
           </p>
         </div>
         <div className="flex items-center gap-2">
           <AddLeadDialog onAdded={fetchLeads} />
           <Button onClick={fetchLeads} variant="outline" size="sm">
             <RefreshCw className="h-4 w-4 mr-2" />
             {t("common.refresh", "Refresh")}
           </Button>
         </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.new > 0 ? "border-blue-500/50 bg-blue-500/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.new}</p>
                <p className="text-xs text-muted-foreground">New Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <MessageSquare className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.contacted}</p>
                <p className="text-xs text-muted-foreground">Contacted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-active/20">
                <CheckCircle className="h-5 w-5 text-status-active" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.converted}</p>
                <p className="text-xs text-muted-foreground">Converted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Leads and Registration Drafts */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Contact Form Leads
            {stats.new > 0 && (
              <Badge className="bg-blue-500 text-white ml-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                {stats.new}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="drafts" className="flex items-center gap-2">
            <FileEdit className="h-4 w-4" />
            Registration Drafts
            {draftStats.total > 0 && (
              <Badge className="bg-amber-500 text-white ml-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                {draftStats.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="mt-6 space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {/*
                  FROM THE LADDER, not restated. This dropdown still offered `qualified`,
                  `converted` and `lost` — the three values migration 20260919120000 renamed —
                  so three of its five options matched no row at all and the two real states
                  they became could not be filtered for.
                */}
                {LEAD_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`leads.status.${status}`, status.replace(/_/g, " "))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="pricing">Pricing</SelectItem>
                <SelectItem value="demo">Demo Request</SelectItem>
                <SelectItem value="partnership">Partnership</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSpam} onValueChange={setFilterSpam}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Spam" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All enquiries</SelectItem>
                <SelectItem value="spam">Possible spam</SelectItem>
                <SelectItem value="clean">Hide possible spam</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="contact_form">Contact form</SelectItem>
                <SelectItem value="staff_manual">Added by staff</SelectItem>
                <SelectItem value="product_interest">Notify me</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAssignee} onValueChange={setFilterAssignee}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {/* Unassigned is first among the named options: it is the pile nobody owns,
                    which is the one worth looking at. */}
                <SelectItem value="unassigned">Nobody yet</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* FOLLOW UP TODAY — a toggle rather than another dropdown, because it is the one
                filter somebody comes to this page already intending to use. */}
            <Button
              variant={filterFollowUp ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterFollowUp((v) => !v)}
              data-testid="leads-followup-filter"
            >
              <Clock className="h-4 w-4 mr-1.5" />
              {t("leads.followUp.filter", "Follow up today")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("leads.followUp.explain",
                 "Open leads nobody has written to for {{days}} days.", { days: followUpDays })}
            </span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportLeadsCsv} data-testid="leads-export">
              <Download className="h-4 w-4 mr-1.5" />
              {t("leads.export", "Export CSV")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
                {/* LAST CONTACT, not "date added". Which of these two a person needs depends on
                    what they came here to do, and the one that tells you whether a lead is going
                    cold is this one — so it sits beside the assignee, where the question
                    "is anybody working this?" is being answered. */}
                <TableHead>Last contact</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading leads...
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow 
                    key={lead.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedLead(lead);
                      setNotes(lead.notes || "");
                      setDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium"><LeadName lead={lead} /></p>
                          <LeadSpamBadge suspected={lead.suspected_spam} reasons={lead.spam_reasons} />
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">
                          {lead.preferred_language === 'es' ? '🇪🇸 Spanish' : '🇬🇧 English'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {/* Never an icon-only link over a value we do not hold: it looks
                            identical to a working one and does nothing. lib/leadDisplay.ts */}
                        <LeadContactValue
                          kind="email"
                          value={lead.email}
                          className="text-sm hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <LeadContactValue
                          kind="phone"
                          value={lead.phone}
                          className="text-sm hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </TableCell>
                    <TableCell>{getEnquiryTypeBadge(lead.enquiry_type)}</TableCell>
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>
                    <TableCell>
                      {lead.assigned_staff ? (
                        <span className="text-sm">
                          {lead.assigned_staff.first_name} {lead.assigned_staff.last_name}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.last_contacted_at ? (
                        <div className="text-sm">
                          {format(new Date(lead.last_contacted_at), 'dd MMM yyyy')}
                          <p className="text-xs text-muted-foreground capitalize">
                            {lead.last_contact_channel ?? ""}
                          </p>
                        </div>
                      ) : (
                        // Not an em dash: "never" is a fact about this lead, and the one an
                        // operator scanning for neglected rows is looking for.
                        <span className="text-sm text-muted-foreground italic">
                          {t("leads.followUp.never", "Never")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {format(new Date(lead.created_at), 'dd MMM yyyy')}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(lead.created_at), 'HH:mm')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'contacted')}>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Mark Contacted
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'qualified')}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark Qualified
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => convertToMember(lead)}
                            className="text-status-active"
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Convert to Member
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => updateLeadStatus(lead.id, 'lost')}
                            className="text-destructive"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Mark as Lost
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setLeadToDelete(lead)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Lead
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
          </Card>
        </TabsContent>

        {/* Registration Drafts Tab */}
        <TabsContent value="drafts" className="mt-6 space-y-6">
          {/* Drafts Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <FileEdit className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{draftStats.total}</p>
                    <p className="text-xs text-muted-foreground">Total Drafts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={draftStats.inProgress > 0 ? "border-blue-500/50 bg-blue-500/5" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Clock className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{draftStats.inProgress}</p>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{draftStats.abandoned}</p>
                    <p className="text-xs text-muted-foreground">Abandoned (&gt;24h)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-status-active/20">
                    <Mail className="h-5 w-5 text-status-active" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{draftStats.withEmail}</p>
                    <p className="text-xs text-muted-foreground">With Email</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search for Drafts */}
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search drafts by name, email, phone..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Drafts Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draftsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Loading drafts...
                      </TableCell>
                    </TableRow>
                  ) : filteredDrafts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No registration drafts found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDrafts.map((draft) => {
                      const progress = getStepProgress(draft.current_step, draft.schema_version ?? 1);
                      return (
                        <TableRow 
                          key={draft.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedDraft(draft);
                            setDraftDetailOpen(true);
                          }}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{formatDraftName(draft)}</p>
                              <p className="text-xs text-muted-foreground">
                                Session: {draft.session_id.slice(-8)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {draft.email ? (
                                <a 
                                  href={`mailto:${draft.email}`} 
                                  className="text-sm hover:text-primary flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Mail className="h-3 w-3" />
                                  {draft.email}
                                </a>
                              ) : (
                                <span className="text-sm text-muted-foreground">No email yet</span>
                              )}
                              {draft.phone && (
                                <a 
                                  href={`tel:${draft.phone}`} 
                                  className="text-sm hover:text-primary flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Phone className="h-3 w-3" />
                                  {draft.phone}
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="w-32">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span>{progress.name}</span>
                                <span className="text-muted-foreground">{progress.step}/8</span>
                              </div>
                              <Progress value={progress.percentage} className="h-1.5" />
                            </div>
                          </TableCell>
                          <TableCell>{getDraftStatusBadge(draft)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(draft.created_at), 'dd MMM yyyy')}
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(draft.created_at), 'HH:mm')}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(draft.updated_at), 'dd MMM yyyy')}
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(draft.updated_at), 'HH:mm')}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedDraft(draft);
                                  setDraftDetailOpen(true);
                                }}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                {draft.email && (
                                  <DropdownMenuItem onClick={() => window.location.href = `mailto:${draft.email}`}>
                                    <Mail className="h-4 w-4 mr-2" />
                                    Send Email
                                  </DropdownMenuItem>
                                )}
                                {draft.phone && (
                                  <DropdownMenuItem onClick={() => window.location.href = `tel:${draft.phone}`}>
                                    <Phone className="h-4 w-4 mr-2" />
                                    Call
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lead Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
            <DialogDescription>
              Review and manage this lead
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-6">
              {/* Lead Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-medium"><LeadName lead={selectedLead} /></p>
                    <LeadSpamBadge
                      suspected={selectedLead.suspected_spam}
                      reasons={selectedLead.spam_reasons}
                    />
                    <LeadNotSpamButton
                      suspected={selectedLead.suspected_spam}
                      onClear={() => clearSpamFlag(selectedLead.id)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedLead.status)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <LeadContactValue
                    kind="email"
                    value={selectedLead.email}
                    className="text-primary hover:underline"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <LeadContactValue
                    kind="phone"
                    value={selectedLead.phone}
                    className="text-primary hover:underline"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Enquiry Type</Label>
                  <div className="mt-1">{getEnquiryTypeBadge(selectedLead.enquiry_type)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Language</Label>
                  <p>{selectedLead.preferred_language === 'es' ? '🇪🇸 Spanish' : '🇬🇧 English'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Submitted</Label>
                  <p>{format(new Date(selectedLead.created_at), 'dd MMM yyyy HH:mm')}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Source</Label>
                  <p className="capitalize">{selectedLead.source?.replace('_', ' ')}</p>
                </div>
              </div>

              {/* INTRODUCING ICE ALARM — the section this dialog exists for once the
                  details have been read. Above the notes, because it is what the operator
                  came here to do; the notes are what they write afterwards. */}
              <LeadIntroduceSection lead={selectedLead} onChanged={() => { fetchLeads(); setCommsKey((k) => k + 1); }} />

              <LeadTimeline leadId={selectedLead.id} refreshKey={commsKey} />

              {/* Message */}
              {selectedLead.message && (
                <div>
                  <Label className="text-xs text-muted-foreground">Message</Label>
                  <div className="mt-1 p-3 bg-muted rounded-lg text-sm">
                    {selectedLead.message}
                  </div>
                </div>
              )}

              {/* Assign */}
              <div>
                <Label className="text-xs text-muted-foreground">Assign To</Label>
                <Select 
                  value={selectedLead.assigned_to || ""} 
                  onValueChange={(value) => assignLead(selectedLead.id, value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                />
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2"
                  onClick={saveNotes}
                >
                  Save Notes
                </Button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  className="flex-1"
                  onClick={() => {
                    convertToMember(selectedLead);
                    setDetailOpen(false);
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Convert to Member
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    updateLeadStatus(selectedLead.id, 'contacted');
                    setDetailOpen(false);
                  }}
                >
                  Mark Contacted
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Draft Detail Dialog */}
      <Dialog open={draftDetailOpen} onOpenChange={setDraftDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registration Draft Details</DialogTitle>
            <DialogDescription>
              Incomplete registration - review captured information
            </DialogDescription>
          </DialogHeader>
          {selectedDraft && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <p className="font-medium">{formatDraftName(selectedDraft)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">{getDraftStatusBadge(selectedDraft)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  {selectedDraft.email ? (
                    <a href={`mailto:${selectedDraft.email}`} className="text-primary hover:underline flex items-center gap-1">
                      {selectedDraft.email}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="text-muted-foreground">Not provided yet</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  {selectedDraft.phone ? (
                    <a href={`tel:${selectedDraft.phone}`} className="text-primary hover:underline flex items-center gap-1">
                      {selectedDraft.phone}
                      <Phone className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="text-muted-foreground">Not provided yet</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Started</Label>
                  <p>{format(new Date(selectedDraft.created_at), 'dd MMM yyyy HH:mm')}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Last Activity</Label>
                  <p>{format(new Date(selectedDraft.updated_at), 'dd MMM yyyy HH:mm')}</p>
                </div>
              </div>

              {/* Progress */}
              <div>
                <Label className="text-xs text-muted-foreground">Registration Progress</Label>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span>
                      Step {selectedDraft.current_step} of{" "}
                      {getStepProgress(selectedDraft.current_step, selectedDraft.schema_version ?? 1).total}:{" "}
                      {getStepProgress(selectedDraft.current_step, selectedDraft.schema_version ?? 1).name}
                      {(selectedDraft.schema_version ?? 1) === 1 && (
                        <span className="ml-1 text-xs text-muted-foreground">(v1, pre-split)</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {getStepProgress(selectedDraft.current_step, selectedDraft.schema_version ?? 1).percentage}%
                    </span>
                  </div>
                  <Progress value={getStepProgress(selectedDraft.current_step, selectedDraft.schema_version ?? 1).percentage} className="h-2" />
                </div>
              </div>

              {/* Wizard Data Summary */}
              {selectedDraft.wizard_data && Object.keys(selectedDraft.wizard_data).length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Captured Information</Label>
                  <div className="mt-2 p-3 bg-muted rounded-lg space-y-2 text-sm">
                    {selectedDraft.wizard_data.membershipType && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Membership Type:</span>
                        <span className="capitalize">{selectedDraft.wizard_data.membershipType}</span>
                      </div>
                    )}
                    {selectedDraft.wizard_data.billingFrequency && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Billing:</span>
                        <span className="capitalize">{selectedDraft.wizard_data.billingFrequency}</span>
                      </div>
                    )}
                    {selectedDraft.wizard_data.includePendant !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">EV-07B Pendant:</span>
                        <span>{selectedDraft.wizard_data.includePendant ? 'Yes' : 'No'}</span>
                      </div>
                    )}
                    {selectedDraft.wizard_data.address?.city && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">City:</span>
                        <span>{selectedDraft.wizard_data.address.city}</span>
                      </div>
                    )}
                    {(selectedDraft.wizard_data.emergencyContacts?.length ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Emergency Contacts:</span>
                        <span>{selectedDraft.wizard_data.emergencyContacts?.length ?? 0} added</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                {selectedDraft.email && (
                  <Button 
                    className="flex-1"
                    onClick={() => window.location.href = `mailto:${selectedDraft.email}?subject=Complete%20Your%20ICE%20Alarm%20Registration`}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Send Follow-up Email
                  </Button>
                )}
                {selectedDraft.phone && (
                  <Button 
                    variant="outline"
                    onClick={() => window.location.href = `tel:${selectedDraft.phone}`}
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Lead Dialog */}
      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the lead for {leadToDelete?.first_name} {leadToDelete?.last_name} ({leadToDelete?.email}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => leadToDelete && deleteLead(leadToDelete.id)}
            >
              Delete Lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}