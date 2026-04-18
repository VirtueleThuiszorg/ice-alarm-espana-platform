import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { 
  Search, 
  Phone, 
  Mail, 
  Clock,
  CheckCircle,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  UserPlus
} from "lucide-react";

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
  created_at: string;
  contacted_at: string | null;
  assigned_staff?: {
    first_name: string;
    last_name: string;
  };
}

export default function CallCentreLeadsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("new");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const fetchStaffId = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setStaffId(data.id);
    };
    fetchStaffId();
  }, [user?.id]);

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel('call-centre-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterStatus]);

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

    const { data, error } = await query.limit(100);
    if (error) {
      console.error('Error fetching leads:', error);
      toast.error(t("leads.failedToLoad", "Failed to load leads"));
    } else {
      setLeads(data as Lead[] || []);
    }
    setLoading(false);
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    const updateData: any = { status };
    if (status === 'contacted') {
      updateData.contacted_at = new Date().toISOString();
    }
    if (!leads.find(l => l.id === leadId)?.assigned_to && staffId) {
      updateData.assigned_to = staffId;
    }

    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId);

    if (error) {
      toast.error(t("leads.failedToUpdate", "Failed to update lead status"));
    } else {
      toast.success(t("leads.markedAs", "Lead marked as {{status}}", { status }));
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
      toast.error(t("leads.failedToSaveNotes", "Failed to save notes"));
    } else {
      toast.success(t("leads.notesSaved", "Notes saved"));
      fetchLeads();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30">{t("leads.status.new", "New")}</Badge>;
      case 'contacted':
        return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">{t("leads.status.contacted", "Contacted")}</Badge>;
      case 'qualified':
        return <Badge className="bg-purple-500/20 text-purple-700 border-purple-500/30">{t("leads.status.qualified", "Qualified")}</Badge>;
      case 'converted':
        return <Badge className="bg-status-active/20 text-status-active border-status-active/30">{t("leads.status.converted", "Converted")}</Badge>;
      case 'lost':
        return <Badge variant="secondary">{t("leads.status.lost", "Lost")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getEnquiryLabel = (type: string) => {
    const labels: Record<string, string> = {
      general: t("leads.enquiry.general", "General Enquiry"),
      pricing: t("leads.enquiry.pricing", "Pricing Info"),
      demo: t("leads.enquiry.demo", "Demo Request"),
      partnership: t("leads.enquiry.partnership", "Partnership"),
      support: t("leads.enquiry.support", "Support"),
    };
    return labels[type] || type;
  };

  const filteredLeads = leads.filter(lead => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      lead.first_name.toLowerCase().includes(search) ||
      lead.last_name.toLowerCase().includes(search) ||
      lead.email.toLowerCase().includes(search) ||
      lead.phone.includes(search)
    );
  });

  const stats = {
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center justify-between mb-4">
           <div>
             <h1 className="text-2xl font-bold">{t("callCentreLeads.title", "Leads")}</h1>
             <p className="text-sm text-muted-foreground">
               {t("callCentreLeads.subtitle", "Contact form enquiries from potential members")}
             </p>
           </div>
           <Button onClick={fetchLeads} variant="outline" size="sm">
             <RefreshCw className="h-4 w-4 mr-2" />
             {t("common.refresh", "Refresh")}
           </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card className={stats.new > 0 ? "border-blue-500/50 bg-blue-500/5" : ""}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <UserPlus className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.new}</p>
                <p className="text-xs text-muted-foreground">{t("leads.newLeads", "New Leads")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <MessageSquare className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.contacted}</p>
                <p className="text-xs text-muted-foreground">{t("leads.status.contacted", "Contacted")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("leads.searchPlaceholder", "Search by name, email, phone...")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">{t("leads.status.new", "New")}</SelectItem>
              <SelectItem value="contacted">{t("leads.status.contacted", "Contacted")}</SelectItem>
              <SelectItem value="qualified">{t("leads.status.qualified", "Qualified")}</SelectItem>
              <SelectItem value="all">{t("common.all", "All")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Leads List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">{t("leads.loading", "Loading leads...")}</div>
        ) : filteredLeads.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>{t("leads.noLeads", "No leads found")}</p>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <Card 
              key={lead.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                setSelectedLead(lead);
                setNotes(lead.notes || "");
                setDetailOpen(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{lead.first_name} {lead.last_name}</p>
                      {getStatusBadge(lead.status)}
                      <Badge variant="outline" className="text-xs">
                        {getEnquiryLabel(lead.enquiry_type)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {lead.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {lead.phone}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(lead.created_at), 'dd MMM yyyy HH:mm')}
                      <span className="capitalize">
                        • {lead.preferred_language === 'es' ? `🇪🇸 ${t("common.spanish", "Spanish")}` : `🇬🇧 ${t("common.english", "English")}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => window.location.href = `tel:${lead.phone}`}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => window.location.href = `mailto:${lead.email}`}
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                    {lead.status === 'new' && (
                      <Button 
                        size="sm"
                        onClick={() => updateLeadStatus(lead.id, 'contacted')}
                      >
                        {t("leads.markContacted", "Mark Contacted")}
                      </Button>
                    )}
                  </div>
                </div>
                {lead.message && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2 bg-muted/50 p-2 rounded">
                    {lead.message}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Lead Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("leads.details", "Lead Details")}</DialogTitle>
            <DialogDescription>
              {t("leads.detailsDesc", "Review and follow up with this lead")}
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              {/* Lead Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.name", "Name")}</Label>
                  <p className="font-medium">{selectedLead.first_name} {selectedLead.last_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.status", "Status")}</Label>
                  <div className="mt-1">{getStatusBadge(selectedLead.status)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.email", "Email")}</Label>
                  <a href={`mailto:${selectedLead.email}`} className="text-primary hover:underline flex items-center gap-1 text-sm">
                    {selectedLead.email}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.phone", "Phone")}</Label>
                  <a href={`tel:${selectedLead.phone}`} className="text-primary hover:underline flex items-center gap-1 text-sm">
                    {selectedLead.phone}
                    <Phone className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("leads.enquiryType", "Enquiry Type")}</Label>
                  <p className="text-sm">{getEnquiryLabel(selectedLead.enquiry_type)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("leads.language", "Language")}</Label>
                  <p className="text-sm">{selectedLead.preferred_language === 'es' ? `🇪🇸 ${t("common.spanish", "Spanish")}` : `🇬🇧 ${t("common.english", "English")}`}</p>
                </div>
              </div>

              {/* Message */}
              {selectedLead.message && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t("leads.message", "Message")}</Label>
                  <div className="mt-1 p-3 bg-muted rounded-lg text-sm">
                    {selectedLead.message}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground">{t("leads.notes", "Notes")}</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("leads.notesPlaceholder", "Add notes about this lead...")}
                />
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2"
                  onClick={saveNotes}
                >
                  {t("leads.saveNotes", "Save Notes")}
                </Button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  className="flex-1"
                  onClick={() => {
                    window.location.href = `tel:${selectedLead.phone}`;
                  }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  {t("leads.callNow", "Call Now")}
                </Button>
                {selectedLead.status === 'new' && (
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      updateLeadStatus(selectedLead.id, 'contacted');
                      setDetailOpen(false);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Contacted
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}