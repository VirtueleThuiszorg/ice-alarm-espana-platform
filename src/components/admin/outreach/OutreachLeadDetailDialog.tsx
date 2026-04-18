import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Globe, Mail, Phone, MapPin, Star, Send, XCircle, RefreshCw, FileText } from "lucide-react";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import { useOutreachPipeline } from "@/hooks/useOutreachPipeline";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface LeadDetailDialogProps {
  lead: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OutreachLeadDetailDialog({ lead, open, onOpenChange }: LeadDetailDialogProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;
  const { generateDrafts, isDrafting, sendEmails, isSending } = useOutreachPipeline();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<any[]>([]);

  useEffect(() => {
    if (!lead?.id || !open) { setDrafts([]); return; }
    supabase.from("outreach_email_drafts")
      .select("id, subject, body_text, status, draft_type, sequence_number, created_at")
      .eq("crm_lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setDrafts(data || []));
  }, [lead?.id, open]);

  if (!lead) return null;

  const enrichment = lead.enrichment_data || lead.research_summary;

  const handleMarkDNC = async () => {
    await supabase.from("outreach_crm_leads").update({ do_not_contact: true, status: "closed" }).eq("id", lead.id);
    if (lead.email) {
      await supabase.from("outreach_suppression").upsert({
        email: lead.email.toLowerCase(),
        domain: lead.email.split("@")[1] || "",
        reason: "dnc",
        source: "manual",
      }, { onConflict: "email" });
    }
    queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
    toast({ title: t("outreach.leadDetail.markedDNC") });
    onOpenChange(false);
  };

  const handleRegenerateDraft = async () => {
    // Delete existing drafts for this lead, then generate new one
    await supabase.from("outreach_email_drafts").delete().eq("crm_lead_id", lead.id);
    await generateDrafts([lead.id]);
  };

  const handleApproveSend = async () => {
    // Approve all drafts for this lead
    const { data: drafts } = await supabase.from("outreach_email_drafts").select("id").eq("crm_lead_id", lead.id).eq("status", "draft");
    if (drafts && drafts.length > 0) {
      await supabase.from("outreach_email_drafts").update({ status: "approved" }).in("id", drafts.map((d: any) => d.id));
      await sendEmails(drafts.map((d: any) => d.id));
    } else {
      toast({ title: t("outreach.leadDetail.noDraftsToSend"), description: t("outreach.leadDetail.generateFirst"), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.company_name}
            {lead.ai_score && (
              <Badge variant="outline" className="ml-2">
                <Star className="mr-1 h-3 w-3" /> {Number(lead.ai_score).toFixed(1)}
              </Badge>
            )}
            <Badge variant={lead.do_not_contact ? "destructive" : "secondary"}>
              {lead.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact Info */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              {lead.contact_name && <p className="text-sm"><strong>{t("outreach.leadDetail.contact")}:</strong> {lead.contact_name}</p>}
              {lead.email && <p className="text-sm flex items-center gap-2"><Mail className="h-3 w-3" /> {lead.email}</p>}
              {lead.phone && <p className="text-sm flex items-center gap-2"><Phone className="h-3 w-3" /> {lead.phone}</p>}
              {lead.website_url && <p className="text-sm flex items-center gap-2"><Globe className="h-3 w-3" /> <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{lead.website_url}</a></p>}
              {lead.location && <p className="text-sm flex items-center gap-2"><MapPin className="h-3 w-3" /> {lead.location}</p>}
              {lead.category && <p className="text-sm"><strong>{t("outreach.leadDetail.industry")}:</strong> {lead.category}</p>}
            </CardContent>
          </Card>

          {/* Enrichment / Research */}
          {enrichment && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">{t("outreach.leadDetail.enrichment")}</h4>
                {typeof enrichment === "object" ? (
                  <Card>
                    <CardContent className="pt-4 text-sm space-y-1">
                      {enrichment.description && <p><strong>{t("outreach.leadDetail.description")}:</strong> {enrichment.description}</p>}
                      {enrichment.services && <p><strong>{t("outreach.leadDetail.services")}:</strong> {Array.isArray(enrichment.services) ? enrichment.services.join(", ") : enrichment.services}</p>}
                      {enrichment.why_fit && <p><strong>{t("outreach.leadDetail.whyFit")}:</strong> {enrichment.why_fit}</p>}
                      {enrichment.recommended_approach && <p><strong>{t("outreach.leadDetail.approach")}:</strong> {enrichment.recommended_approach}</p>}
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">{String(enrichment)}</p>
                )}
              </div>
            </>
          )}

          {/* AI Score */}
          {lead.ai_score && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">{t("outreach.leadDetail.aiScore")}</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-lg px-3 py-1">{Number(lead.ai_score).toFixed(1)} / 5.0</Badge>
                </div>
                {lead.personalization_hooks && typeof lead.personalization_hooks === "object" && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    {Object.entries(lead.personalization_hooks).map(([k, v]) => (
                      <p key={k}><strong>{k}:</strong> {String(v)}</p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Follow-up Info */}
          {(lead.next_followup_at || lead.followup_count > 0) && (
            <>
              <Separator />
              <div className="text-sm space-y-1">
                <h4 className="font-medium">{t("outreach.leadDetail.followupStatus")}</h4>
                <p>{t("outreach.leadDetail.followupsSent")}: {lead.followup_count || 0}</p>
                {lead.next_followup_at && <p>{t("outreach.leadDetail.nextFollowup")}: {format(new Date(lead.next_followup_at), "d MMM yyyy", { locale: dateLocale })}</p>}
                {lead.last_contacted_at && <p>{t("outreach.leadDetail.lastContacted")}: {format(new Date(lead.last_contacted_at), "d MMM yyyy", { locale: dateLocale })}</p>}
              </div>
            </>
          )}

          {/* Email Drafts */}
          {drafts.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> {t("outreach.leadDetail.emailDrafts")} ({drafts.length})
                </h4>
                <div className="space-y-2">
                  {drafts.map((draft) => (
                    <Card key={draft.id}>
                      <CardContent className="pt-3 pb-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{draft.subject}</p>
                          <Badge variant={draft.status === "sent" ? "default" : draft.status === "approved" ? "secondary" : "outline"} className="text-xs">
                            {draft.draft_type === "followup" ? `Follow-up #${draft.sequence_number}` : draft.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{draft.body_text}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleApproveSend} disabled={isSending || lead.do_not_contact}>
              <Send className="mr-2 h-4 w-4" />{isSending ? t("outreach.leadDetail.sending") : t("outreach.leadDetail.approveSend")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleRegenerateDraft} disabled={isDrafting}>
              <RefreshCw className="mr-2 h-4 w-4" />{isDrafting ? t("outreach.leadDetail.generating") : t("outreach.leadDetail.regenerateDraft")}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleMarkDNC} disabled={lead.do_not_contact}>
              <XCircle className="mr-2 h-4 w-4" />{t("outreach.leadDetail.markDNC")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
