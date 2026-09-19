import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, MessageSquare, Send, Loader2, Check, Link2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { extractFunctionError } from "@/lib/functionError";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leadStatus";
import { LeadContactButton } from "@/components/leads/LeadContact";

/**
 * "INTRODUCE ICE ALARM" — the section a staff member works a lead from.
 *
 * ── WHY THE PREVIEW IS NOT OPTIONAL ─────────────────────────────────────────
 *
 * Pressing Email or SMS shows the message first, in the lead's own language, and sends on a
 * second press. Nobody here reads Dutch; an operator sending the Dutch template is trusting a
 * row in a table they have never seen, to a person they have just promised to look after. The
 * preview is the only moment anybody looks at what actually goes out.
 *
 * ── THE LINK IS ALWAYS ON SCREEN ────────────────────────────────────────────
 *
 * All three channels are OFF in production today. The result of pressing send is therefore
 * usually three rows saying "skipped: channel off" — and the URL, which the operator reads out
 * over the telephone or pastes into their own WhatsApp. That is not a fallback path; for now it
 * is the path.
 */

type Channel = "sms" | "whatsapp" | "email";

interface ReportRow {
  channel: string;
  to: string | null;
  outcome: string;
  subject?: string;
  body?: string;
  detail?: string;
}

interface Lead {
  id: string;
  first_name: string;
  phone: string | null;
  email: string | null;
  preferred_language: string | null;
  status: string;
  do_not_contact?: boolean | null;
}

const CHANNEL_ICON = { sms: MessageSquare, whatsapp: MessageSquare, email: Mail } as const;

export function LeadIntroduceSection({
  lead,
  onChanged,
}: {
  lead: Lead;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ channel: Channel; rows: ReportRow[]; link: string } | null>(null);
  const [busy, setBusy] = useState<Channel | "status" | null>(null);
  const [sentReport, setSentReport] = useState<ReportRow[] | null>(null);
  const [joinLink, setJoinLink] = useState<string | null>(null);

  // A lead who has asked not to be written to again disables every channel, on screen and on
  // the server. Both, because the server is the rule and the screen is the courtesy.
  const silenced = lead.do_not_contact === true;

  useEffect(() => {
    setPreview(null);
    setSentReport(null);
    setJoinLink(null);
  }, [lead.id]);

  const call = async (channel: Channel, send: boolean) => {
    setBusy(channel);
    try {
      const { data, error } = await supabase.functions.invoke("send-lead-message", {
        body: { leadId: lead.id, kind: "intro", channels: [channel], preview: !send },
      });
      if (error) {
        toast.error(await extractFunctionError(error, t("leads.intro.failed", "Could not prepare the message")));
        return;
      }
      setJoinLink(data.joinLink);
      if (send) {
        setPreview(null);
        setSentReport(data.report);
        onChanged?.();
      } else {
        setPreview({ channel, rows: data.report, link: data.joinLink });
      }
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: LeadStatus) => {
    setBusy("status");
    try {
      const { error } = await supabase
        .from("leads")
        .update({ status, status_changed_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) {
        toast.error(t("leads.status.failed", "Could not change the status"));
        return;
      }
      toast.success(t("leads.status.changed", "Status updated"));
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t("leads.intro.title", "Introduce ICE Alarm")}
        </Label>
        {silenced && (
          <Badge variant="outline" className="text-xs text-muted-foreground" data-testid="lead-silenced">
            {t("leads.intro.doNotContact", "Asked not to be contacted")}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["email", "sms", "whatsapp"] as Channel[]).map((channel) => {
          const Icon = CHANNEL_ICON[channel];
          return (
            <Button
              key={channel}
              variant="outline"
              size="sm"
              disabled={silenced || busy !== null}
              onClick={() => call(channel, false)}
              data-testid={`lead-intro-${channel}`}
            >
              {busy === channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 mr-1.5" />}
              {t(`leads.intro.${channel}`, channel === "email" ? "Email" : channel === "sms" ? "SMS" : "WhatsApp")}
            </Button>
          );
        })}
        {/*
          CALL IS A `tel:` HAND-OFF, not a composed message — there is no template for a
          conversation, and pretending there is would put words in an operator's mouth.

          Through `LeadContactButton` rather than a hand-built anchor, so a lead with no number
          gets a disabled button WITH THE REASON instead of a link that looks identical to a
          working one and does nothing. That rule already exists; a second hand-rolled `tel:`
          here is how it would have started coming apart.
        */}
        <LeadContactButton
          kind="phone"
          value={lead.phone}
          size="sm"
          label={t("leads.intro.call", "Call")}
        />
      </div>

      {/* THE PREVIEW. Shown before anything is sent, in the lead's language. */}
      {preview && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3" data-testid="lead-preview">
          {preview.rows.map((row) => (
            <div key={row.channel} className="space-y-1">
              {row.subject && <p className="text-sm font-medium">{row.subject}</p>}
              <Textarea readOnly rows={row.channel === "email" ? 10 : 4} value={row.body ?? ""}
                className="text-sm bg-background" data-testid="lead-preview-body" />
              {row.outcome !== "sent" && (
                <p className="text-xs text-muted-foreground">
                  {t("leads.intro.willSkip", "This channel is not available: {{reason}}", { reason: row.outcome })}
                </p>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => call(preview.channel, true)} disabled={busy !== null}>
              <Send className="h-4 w-4 mr-1.5" />
              {t("leads.intro.send", "Send it")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              {t("common.cancel", "Cancel")}
            </Button>
          </div>
        </div>
      )}

      {sentReport && (
        <div className="space-y-1 text-sm" role="status" data-testid="lead-send-report">
          {sentReport.map((row) => (
            <p key={row.channel} className="flex items-center gap-2">
              {row.outcome === "sent"
                ? <Check className="h-3.5 w-3.5 text-status-active" />
                : <span className="h-3.5 w-3.5" />}
              <span className="font-medium capitalize">{row.channel}</span>
              <span className={cn(row.outcome === "sent" ? "" : "text-muted-foreground")}>
                {row.outcome}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* THE URL, ALWAYS. With every channel off it is the only thing that reaches anybody. */}
      {joinLink && (
        <div className="flex items-center gap-2 rounded-md border bg-background p-2">
          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <code className="text-xs truncate flex-1" data-testid="lead-join-link">{joinLink}</code>
          <Button size="icon" variant="ghost" className="h-7 w-7"
            aria-label={t("leads.intro.copy", "Copy the link")}
            onClick={() => {
              navigator.clipboard?.writeText(joinLink);
              toast.success(t("leads.intro.copied", "Link copied"));
            }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* THE LADDER. Each button records who moved it and when. */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {LEAD_STATUSES.filter((s) => s !== lead.status).map((status) => (
          <Button key={status} size="sm" variant="ghost" className="h-7 text-xs"
            disabled={busy !== null} onClick={() => setStatus(status)}
            data-testid={`lead-status-${status}`}>
            {t(`leads.status.${status}`, status.replace(/_/g, " "))}
          </Button>
        ))}
      </div>
    </div>
  );
}
