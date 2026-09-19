import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  LEAD_TEMPLATE_PLACEHOLDERS,
  leadEventKey,
  type LeadChannel,
  type LeadMessageKind,
} from "../../../../supabase/functions/_shared/lead-message";

/**
 * WHAT WE SAY TO A LEAD, EDITABLE WITHOUT A DEPLOY.
 *
 * The six lead messages — introduce and follow up, over SMS, WhatsApp and email — in all three
 * languages. `send-lead-message` reads these rows and has NO inline fallback text, so this is
 * the only place the wording exists.
 *
 * ── WHY THE PLACEHOLDER LIST IS ON SCREEN AND NOT IN A DOCUMENT ─────────────
 *
 * `renderTemplate` leaves an unknown `{{x}}` visible rather than blanking it, which is the right
 * behaviour — a message reading "Hola {{nombre}}" tells whoever sees it that something is wrong,
 * where "Hola " tells them nothing. But it only helps if somebody SEES it, and the person who
 * typed `{{nombre}}` is not the person who will read the text on a stranger's telephone.
 *
 * So the four names are listed beside every box, read from the code that supplies them rather
 * than written out here, and anything in the body that is not one of them is called out as you
 * type. That is the whole editor: it cannot stop somebody writing a bad sentence, but it can
 * stop them shipping a variable that will never be filled in.
 *
 * ── SMS LENGTH IS SHOWN, BECAUSE IT COSTS MONEY ─────────────────────────────
 *
 * Two GSM segments is 320 characters INCLUDING a join link of about 70. A third segment is a
 * third of the price again, on every message, for ever — and nobody typing into a box knows
 * they have crossed it. The count is against the RENDERED length, with a realistic link, because
 * counting the template would be reassuring and wrong.
 */

const KINDS: LeadMessageKind[] = ["intro", "followup"];
const CHANNELS: LeadChannel[] = ["sms", "whatsapp", "email"];
const LOCALES = ["en", "es", "nl"] as const;

/** Two GSM segments. A third costs a third again, on every message, for ever. */
const SMS_LIMIT = 320;

/**
 * A realistic link and name, so the count means something. The template is always shorter than
 * what actually goes out, and the difference is most of a segment.
 */
const SAMPLE = {
  first_name: "Rosa",
  staff_name: "Ana Soares",
  join_link: "https://icealarm.es/join?lead=Xk3p9QwTzR2vNm7bJ4hL&ref=PARTNER01",
  phone_24h: "+34 950 473 199",
};

interface Row {
  event_key: string;
  channel: string;
  locale: string;
  subject: string | null;
  body: string;
}

const rendered = (body: string) =>
  body.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(SAMPLE, key) ? SAMPLE[key as keyof typeof SAMPLE] : whole,
  );

/** Placeholders in the body that nothing will ever fill in. */
const unknownPlaceholders = (body: string): string[] => {
  const used = [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return [...new Set(used)].filter(
    (name) => !(LEAD_TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name),
  );
};

export function LeadTemplatesCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const keyOf = (kind: LeadMessageKind, channel: LeadChannel, locale: string) =>
    `${leadEventKey(kind, channel)}|${channel}|${locale}`;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("notification_templates")
        .select("event_key, channel, locale, subject, body")
        .like("event_key", "lead.%");
      const map = new Map<string, Row>();
      for (const r of (data ?? []) as Row[]) map.set(`${r.event_key}|${r.channel}|${r.locale}`, r);
      setRows(map);
      setLoading(false);
    })();
  }, []);

  const edit = (key: string, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = new Map(prev);
      const current = next.get(key);
      if (current) next.set(key, { ...current, ...patch });
      return next;
    });
  };

  const save = async (key: string) => {
    const row = rows.get(key);
    if (!row) return;
    setSaving(key);
    try {
      const { error } = await supabase
        .from("notification_templates")
        .update({ subject: row.subject, body: row.body, updated_at: new Date().toISOString() })
        .eq("event_key", row.event_key)
        .eq("channel", row.channel as LeadChannel)
        .eq("locale", row.locale);
      if (error) {
        toast.error(t("leadTemplates.saveFailed", "Could not save this template"));
        return;
      }
      toast.success(t("leadTemplates.saved", "Template saved"));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          {t("common.loading", "Loading…")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          {t("leadTemplates.title", "What we say to a lead")}
        </CardTitle>
        <CardDescription>
          {t("leadTemplates.description",
            "The messages staff send when they introduce ICE Alarm to somebody. Edited here, not in the code.")}
        </CardDescription>
        {/* THE PLACEHOLDER LIST, read from the code that supplies them. */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2" data-testid="lead-template-placeholders">
          <span className="text-xs text-muted-foreground">
            {t("leadTemplates.placeholders", "You can use:")}
          </span>
          {LEAD_TEMPLATE_PLACEHOLDERS.map((name) => (
            <Badge key={name} variant="outline" className="font-mono text-xs">
              {`{{${name}}}`}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="en">
          <TabsList>
            {LOCALES.map((locale) => (
              <TabsTrigger key={locale} value={locale}>{locale.toUpperCase()}</TabsTrigger>
            ))}
          </TabsList>
          {LOCALES.map((locale) => (
            <TabsContent key={locale} value={locale} className="space-y-5 pt-4">
              {KINDS.map((kind) =>
                CHANNELS.map((channel) => {
                  const key = keyOf(kind, channel, locale);
                  const row = rows.get(key);
                  if (!row) {
                    // A missing row is a send that FAILS — the function has no fallback text.
                    // Saying so here is the only place anybody would find out before a staff
                    // member does, in front of a customer.
                    return (
                      <p key={key} className="text-sm text-destructive" data-testid="lead-template-missing">
                        {t("leadTemplates.missing", "Missing: {{key}} ({{locale}}) — sending this will fail.",
                          { key: leadEventKey(kind, channel), locale })}
                      </p>
                    );
                  }
                  const unknown = unknownPlaceholders(row.body);
                  const length = rendered(row.body).length;
                  const tooLong = channel !== "email" && length > SMS_LIMIT;
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-sm font-medium capitalize">
                          {t(`leadTemplates.kind.${kind}`, kind)} · {channel}
                        </Label>
                        {channel !== "email" && (
                          <span className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}
                                data-testid={`lead-template-length-${kind}-${channel}-${locale}`}>
                            {t("leadTemplates.length", "{{n}} of {{max}} characters when sent",
                              { n: length, max: SMS_LIMIT })}
                          </span>
                        )}
                      </div>
                      {row.subject !== null && (
                        <Input
                          value={row.subject ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => edit(key, { subject: e.target.value })}
                          placeholder={t("leadTemplates.subject", "Subject")}
                        />
                      )}
                      <Textarea
                        rows={channel === "email" ? 9 : 3}
                        value={row.body}
                        disabled={!canEdit}
                        onChange={(e) => edit(key, { body: e.target.value })}
                        className={cn("text-sm", (unknown.length > 0 || tooLong) && "border-destructive")}
                      />
                      {unknown.length > 0 && (
                        <p className="text-xs text-destructive" role="alert"
                           data-testid="lead-template-unknown">
                          {t("leadTemplates.unknown",
                             "Nothing will fill in {{names}} — it will be sent exactly as written.",
                             { names: unknown.map((n) => `{{${n}}}`).join(", ") })}
                        </p>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="outline" disabled={saving === key}
                                onClick={() => save(key)}>
                          {saving === key
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><Save className="h-3.5 w-3.5 mr-1.5" />{t("common.save", "Save")}</>}
                        </Button>
                      )}
                    </div>
                  );
                }),
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
