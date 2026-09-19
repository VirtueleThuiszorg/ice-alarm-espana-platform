import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { Mail, MessageSquare, Check, SlashIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * EVERY MESSAGE SENT TO THIS LEAD, INCLUDING THE ONES THAT WERE NOT.
 *
 * A timeline that showed only successful sends would read, on a platform with all three channels
 * switched off, as "nobody has ever contacted this person" — while the operator who pressed send
 * four times remembers doing it. The skips are the interesting rows: they are the difference
 * between "we have not got round to them" and "we tried and the platform declined".
 *
 * It reads `lead_communications` directly rather than through a hook, because there is exactly
 * one place that shows it and a hook with one caller is a layer, not an abstraction.
 */

interface Row {
  id: string;
  channel: string;
  template: string | null;
  outcome: string;
  detail: string | null;
  created_at: string;
  staff?: { first_name: string; last_name: string } | null;
}

const ICON: Record<string, typeof Mail> = { email: Mail, sms: MessageSquare, whatsapp: MessageSquare };

export function LeadTimeline({ leadId, refreshKey = 0 }: { leadId: string; refreshKey?: number }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("lead_communications")
        .select("id, channel, template, outcome, detail, created_at, staff:staff_id(first_name, last_name)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (live) setRows((data as unknown as Row[]) ?? []);
    })();
    return () => { live = false; };
  }, [leadId, refreshKey]);

  if (rows === null) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">
        {t("leads.timeline.title", "What we have sent")}
      </Label>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="lead-timeline-empty">
          {t("leads.timeline.empty", "Nothing has been sent to this person yet.")}
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="lead-timeline">
          {rows.map((row) => {
            const Icon = ICON[row.channel] ?? Mail;
            const sent = row.outcome === "sent";
            return (
              <li key={row.id} className="flex items-start gap-2 text-sm">
                <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0",
                  sent ? "text-muted-foreground" : "text-muted-foreground/50")} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5">
                    <span className="capitalize">{row.channel}</span>
                    {sent
                      ? <Check className="h-3 w-3 text-status-active" aria-hidden="true" />
                      : <SlashIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                    {/* The outcome in plain words. A skip is a fact, not a failure. */}
                    <span className={cn("text-xs", sent ? "text-muted-foreground" : "text-muted-foreground")}>
                      {t(`leads.outcome.${row.outcome}`, row.outcome.replace(/_/g, " "))}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    {row.staff ? ` · ${row.staff.first_name} ${row.staff.last_name}`.trimEnd() : ""}
                    {row.detail ? ` · ${row.detail}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
