import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Inbox, RefreshCw, Clock, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOutreachInbox, type InboundEmail } from "@/hooks/useInboundEmails";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import DOMPurify from "dompurify";

export function OutreachInboxTab() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "es" ? es : enGB;
  const { data: emails, isLoading, refetch, isRefetching } = useOutreachInbox();
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);

  // Fetch linked CRM lead names for inbox emails
  const linkedIds = emails?.filter(e => e.linked_entity_id).map(e => e.linked_entity_id!) || [];
  const { data: linkedLeads } = useQuery({
    queryKey: ["outreach-linked-leads", linkedIds],
    queryFn: async () => {
      if (linkedIds.length === 0) return {};
      const { data } = await supabase.from("outreach_crm_leads").select("id, company_name").in("id", linkedIds);
      const map: Record<string, string> = {};
      data?.forEach(l => { map[l.id] = l.company_name; });
      return map;
    },
    enabled: linkedIds.length > 0,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t("outreach.inbox.title", "Email Inbox")}</CardTitle>
              <CardDescription>{t("outreach.inbox.subtitle", "Replies and correspondence from outreach campaigns")}</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            {t("common.refresh", "Refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !emails || emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">{t("outreach.inbox.noThreads", "No replies yet")}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("outreach.inbox.subtitle", "Replies to your outreach emails will appear here")}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className="w-full p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium truncate">{email.from_email}</span>
                        {email.is_reply && (
                          <Badge variant="secondary" className="text-xs">
                            {t("outreach.inbox.replyBadge")}
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium mt-1 truncate">{email.subject || t("outreach.inbox.noSubject")}</p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {email.body_snippet || t("outreach.inbox.noPreview")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(email.received_at), "MMM d, HH:mm", { locale: dateLocale })}
                      </span>
                      {email.linked_entity_id && (
                        <Badge variant="outline" className="text-xs">
                          {linkedLeads?.[email.linked_entity_id] || t("outreach.inbox.linked")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Email Detail Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {selectedEmail?.subject || t("outreach.inbox.noSubject")}
            </DialogTitle>
            <DialogDescription>
              {t("outreach.inbox.from")}: {selectedEmail?.from_email} • {selectedEmail && format(new Date(selectedEmail.received_at), "PPpp", { locale: dateLocale })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedEmail?.is_reply && selectedEmail?.linked_entity_id && (
              <div className="p-3 bg-muted rounded-lg text-sm flex items-center justify-between">
                <p className="text-muted-foreground">
                  {t("outreach.inbox.replyToOutreach")}
                  {linkedLeads?.[selectedEmail.linked_entity_id] && (
                    <span className="font-medium ml-1">— {linkedLeads[selectedEmail.linked_entity_id]}</span>
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedEmail(null)}
                >
                  {t("outreach.inbox.viewLead")}
                </Button>
              </div>
            )}

            <div className="border rounded-lg p-4 bg-background">
              {selectedEmail?.body_html ? (
                <div
                  dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(selectedEmail.body_html, {
                      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'div', 'span', 'b', 'i', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr'],
                      ALLOWED_ATTR: ['href', 'class', 'style', 'src', 'alt', 'target', 'rel'],
                      ALLOW_DATA_ATTR: false,
                      FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed'],
                      FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur']
                    })
                  }}
                  className="prose prose-sm max-w-none"
                />
              ) : (
                <p className="whitespace-pre-wrap">{selectedEmail?.body_snippet || t("outreach.inbox.noContent")}</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
