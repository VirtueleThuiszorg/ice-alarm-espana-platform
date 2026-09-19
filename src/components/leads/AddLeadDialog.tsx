import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toE164 } from "@/lib/phone";
import { extractFunctionErrorBody } from "@/lib/functionError";
import { HEARD_ABOUT } from "../../../supabase/functions/_shared/staff-lead";

/**
 * "+ ADD LEAD" — for the people who did not find the website.
 *
 * An operator uses this while the person is still on the telephone, or standing in front of
 * them at a stall. That shapes three things:
 *
 *   THE PHONE NUMBER IS SHOWN BACK AS IT WILL BE STORED, under the box, the moment it is
 *   readable. An operator typing `600111222` sees `+34 600 111 222` appear and knows it was
 *   understood; typing a number that cannot be read gets nothing, which is the signal to check
 *   it while the person is still there rather than after they have gone.
 *
 *   A DUPLICATE IS A LINK, not a sentence. "This person is already a member" with nowhere to go
 *   gets worked around by typing the number differently. The refusal carries the record.
 *
 *   THE CONSENT TICK IS NOT PRE-TICKED AND CANNOT BE. It is the only statement on this form
 *   that is about the OPERATOR rather than the lead — they are putting on the record that this
 *   person agreed — and a box that arrives already ticked is not a statement anybody made.
 */

interface AddLeadDialogProps {
  onAdded?: () => void;
  /** Where a duplicate member's record lives on this surface. */
  memberHref?: (id: string) => string;
  leadsHref?: string;
}

type Existing = { kind: "member" | "lead"; id: string; name: string; status?: string };

const BLANK = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  preferred_language: "en",
  enquiry_type: "general",
  heard_about: "",
  notes: "",
};

export function AddLeadDialog({
  onAdded,
  memberHref = (id) => `/admin/members/${id}`,
  leadsHref = "/admin/leads",
}: AddLeadDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [partnerCode, setPartnerCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [existing, setExisting] = useState<Existing | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear the mark as soon as they start fixing it, not on the next submit.
    setBadFields((prev) => prev.filter((f) => f !== field));
    setExisting(null);
  };

  const invalid = (field: string) => badFields.includes(field);
  const fieldProps = (field: string) => ({
    "aria-invalid": invalid(field) || undefined,
    className: invalid(field) ? "border-destructive focus-visible:ring-destructive" : undefined,
  });

  /** What the server will store, shown back the instant it is readable. */
  const e164 = toE164(form.phone);

  const reset = () => {
    setForm({ ...BLANK });
    setPartnerCode("");
    setConsent(false);
    setBadFields([]);
    setExisting(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBadFields([]);
    setExisting(null);
    try {
      const { data, error } = await supabase.functions.invoke("staff-lead", {
        body: { fields: form, consent, partnerCode: partnerCode || null },
      });
      if (error) {
        const body = await extractFunctionErrorBody(error);
        const fields = Array.isArray(body?.fields)
          ? (body.fields as unknown[]).filter((f): f is string => typeof f === "string")
          : [];
        setBadFields(fields);
        const dup = body?.existing as Existing | undefined;
        if (dup) setExisting(dup);
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : t("leads.add.failed", "Could not save this lead"),
        );
        return;
      }
      if (!data?.ok) throw new Error("staff-lead did not confirm the insert");
      toast.success(t("leads.add.saved", "Lead added"));
      reset();
      setOpen(false);
      onAdded?.();
    } catch {
      toast.error(t("leads.add.failed", "Could not save this lead"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" data-testid="add-lead-open">
          <UserPlus className="h-4 w-4" />
          {t("leads.add.button", "Add lead")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("leads.add.title", "Add a lead")}</DialogTitle>
          <DialogDescription>
            {t("leads.add.description",
              "Someone who got in touch by telephone, at an event, or through another member.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-first">{t("leads.add.firstName", "First name")} *</Label>
              <Input id="lead-first" required {...fieldProps("first_name")}
                value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-last">{t("leads.add.lastName", "Surname")}</Label>
              <Input id="lead-last" {...fieldProps("last_name")}
                value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-phone">{t("leads.add.phone", "Phone")} *</Label>
              <Input id="lead-phone" type="tel" required {...fieldProps("phone")}
                value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              {/* Shown back as it will be stored. Silence means it could not be read — which is
                  worth knowing while the person is still on the telephone. */}
              <p className="text-xs text-muted-foreground h-4" data-testid="lead-phone-e164">
                {e164 ? e164.replace(/^(\+\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4") : ""}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">{t("leads.add.email", "Email")}</Label>
              <Input id="lead-email" type="email" {...fieldProps("email")}
                value={form.email} onChange={(e) => set("email", e.target.value)} />
              <p className="text-xs text-muted-foreground h-4">
                {t("leads.add.emailOptional", "Optional")}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-lang">{t("leads.add.language", "Language")}</Label>
              <Select value={form.preferred_language} onValueChange={(v) => set("preferred_language", v)}>
                <SelectTrigger id="lead-lang"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="nl">Nederlands</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-type">{t("leads.add.enquiryType", "Enquiry")}</Label>
              <Select value={form.enquiry_type} onValueChange={(v) => set("enquiry_type", v)}>
                <SelectTrigger id="lead-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* `leads.enquiry.*` ALREADY EXISTS and is what both Leads lists render. The
                      inline defaults below are its English wording verbatim — a second wording
                      here would make the dialog and the list disagree about the same lead. */}
                  <SelectItem value="general">{t("leads.enquiry.general", "General Enquiry")}</SelectItem>
                  <SelectItem value="pricing">{t("leads.enquiry.pricing", "Pricing Info")}</SelectItem>
                  <SelectItem value="demo">{t("leads.enquiry.demo", "Demo Request")}</SelectItem>
                  <SelectItem value="partnership">{t("leads.enquiry.partnership", "Partnership")}</SelectItem>
                  <SelectItem value="support">{t("leads.enquiry.support", "Support")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-heard">{t("leads.add.heardAbout", "How did they hear of us?")} *</Label>
            <Select value={form.heard_about} onValueChange={(v) => set("heard_about", v)}>
              <SelectTrigger id="lead-heard" {...fieldProps("heard_about")}>
                <SelectValue placeholder={t("leads.add.heardAboutPlaceholder", "Choose one")} />
              </SelectTrigger>
              <SelectContent>
                {HEARD_ABOUT.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`leads.heardAbout.${key}`, HEARD_ABOUT_FALLBACK[key])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Only asked for when it is the answer — and then it is required, because a lead that
              claims a partner referral without a code is a partner who never gets paid. */}
          {form.heard_about === "partner_code" && (
            <div className="space-y-1.5">
              <Label htmlFor="lead-partner">{t("leads.add.partnerCode", "Partner code")} *</Label>
              <Input id="lead-partner" {...fieldProps("partner_code")}
                value={partnerCode}
                onChange={(e) => { setPartnerCode(e.target.value); setBadFields((p) => p.filter((f) => f !== "partner_code")); }}
                placeholder="ICE-XXXX" className={cn("font-mono uppercase", fieldProps("partner_code").className)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">{t("leads.add.notes", "Notes")}</Label>
            <Textarea id="lead-notes" rows={3} {...fieldProps("notes")}
              value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder={t("leads.add.notesPlaceholder", "What did they ask about?")} />
          </div>

          {/* THE STATEMENT THE OPERATOR IS MAKING. Never pre-ticked. */}
          <div className={cn(
            "flex items-start gap-3 rounded-md border p-3",
            invalid("consent") && "border-destructive",
          )}>
            <Checkbox id="lead-consent" checked={consent}
              onCheckedChange={(v) => { setConsent(v === true); setBadFields((p) => p.filter((f) => f !== "consent")); }}
              data-testid="lead-consent" />
            <Label htmlFor="lead-consent" className="text-sm font-normal leading-snug">
              {t("leads.add.consent", "The person agreed to be contacted by ICE Alarm España.")}
            </Label>
          </div>

          {existing && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
                 role="alert" data-testid="lead-duplicate">
              <p className="font-medium">
                {existing.kind === "member"
                  ? t("leads.add.dupMember", "Already a member")
                  : t("leads.add.dupLead", "Already a lead")}
                {": "}{existing.name}
              </p>
              <Link
                to={existing.kind === "member" ? memberHref(existing.id) : leadsHref}
                className="text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                {t("leads.add.dupOpen", "Open the existing record")}
              </Link>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : t("leads.add.save", "Add lead")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** English wording, used as the inline default for each `leads.heardAbout.*` key. */
const HEARD_ABOUT_FALLBACK: Record<(typeof HEARD_ABOUT)[number], string> = {
  walk_in: "Walked in",
  phone_call: "Telephoned us",
  event: "Met us at an event",
  member_referral: "Referred by a member",
  partner_code: "Partner referral",
  other: "Something else",
};
