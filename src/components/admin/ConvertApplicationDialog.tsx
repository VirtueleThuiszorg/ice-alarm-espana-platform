import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PARTNER_TYPES, getPartnerTypeLabel } from "@/config/partnerTypes";
import { functionError } from "@/lib/functionError";

/** The subset of a `partners` application row this dialog needs. */
export interface PartnerApplication {
  id: string;
  contact_name: string;
  email: string;
  preferred_language?: string | null;
  partner_type?: string | null;
  region?: string | null;
  how_heard_about_us?: string | null;
  motivation?: string | null;
}

interface ConvertApplicationDialogProps {
  /** The application to convert, or null when closed. */
  application: PartnerApplication | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Converts a partner APPLICATION (`status='pending'`, from /partner → partner-apply)
 * into an invited partner — the admin half of Option C (PARTNER_JOURNEY.md §3).
 *
 * An application has no `user_id` and no credentials, so the applicant can never log
 * in: `PartnerLogin` looks up `partners` by `user_id` and `get_user_role_info`
 * requires a `user_id` match. This is the only route from "someone filled a form" to
 * "someone has an account", and it deliberately runs through an admin.
 *
 * The applicant sets their own password via the invite, so no credential is ever
 * created on their behalf. `partner-admin-invite` stamps `reviewed_by` /
 * `reviewed_at` / `review_notes` server-side.
 */
export function ConvertApplicationDialog({ application, onOpenChange }: ConvertApplicationDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [partnerType, setPartnerType] = useState<string>(application?.partner_type ?? "referral");
  const [language, setLanguage] = useState<string>(application?.preferred_language ?? "es");

  // Re-seed from the row whenever a different application is opened. Keyed render
  // in the parent would also work; this keeps the parent simpler.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (application && seededFor !== application.id) {
    setSeededFor(application.id);
    setPartnerType(application.partner_type ?? "referral");
    setLanguage(application.preferred_language ?? "es");
    setReviewNotes("");
  }

  const handleConvert = async () => {
    if (!application) return;
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("partner-admin-invite", {
        body: {
          contact_name: application.contact_name,
          email: application.email,
          preferred_language: language,
          partner_type: partnerType,
          // Recorded on the partner row as part of the review. Optional — an empty
          // note is simply not written, rather than stored as an empty string.
          ...(reviewNotes.trim() ? { review_notes: reviewNotes.trim() } : {}),
        },
      });

      // The server's reason reaches the user here — e.g. it refuses to convert an
      // already-active or suspended partner, and that refusal is worth reading.
      if (error) throw await functionError(error, t("partnerConvert.error", "Could not convert the application"));
      if (!data?.success) {
        throw new Error(data?.error || t("partnerConvert.error", "Could not convert the application"));
      }

      toast({ title: t("partnerConvert.success", "Invitation sent — the application is now an invited partner.") });
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner-global-stats"] });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: t("partnerConvert.error", "Could not convert the application"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={application !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("partnerConvert.title", "Convert application to partner")}</DialogTitle>
          <DialogDescription>
            {t(
              "partnerConvert.description",
              "This sends {{name}} an invitation to set their own password and complete their profile. Their application is recorded as reviewed by you.",
              { name: application?.contact_name ?? "" }
            )}
          </DialogDescription>
        </DialogHeader>

        {application && (
          <div className="space-y-4">
            {/* What the applicant actually told us. Shown read-only so the decision
                is made against the application rather than from memory. */}
            <dl className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="text-muted-foreground">{t("common.email", "Email")}</dt>
                <dd className="font-medium break-all">{application.email}</dd>
              </div>
              {application.region && (
                <div className="flex justify-between gap-4 py-0.5">
                  <dt className="text-muted-foreground">{t("common.region", "Region")}</dt>
                  <dd>{application.region}</dd>
                </div>
              )}
              {application.how_heard_about_us && (
                <div className="flex justify-between gap-4 py-0.5">
                  <dt className="text-muted-foreground">{t("common.source", "Heard about us")}</dt>
                  <dd>{application.how_heard_about_us}</dd>
                </div>
              )}
              {application.motivation && (
                <div className="pt-1.5">
                  <dt className="text-muted-foreground">{t("common.motivation", "Motivation")}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{application.motivation}</dd>
                </div>
              )}
            </dl>

            <div>
              <Label htmlFor="convert-partner-type">{t("common.partnerType", "Partner Type")}</Label>
              <Select value={partnerType} onValueChange={setPartnerType}>
                <SelectTrigger id="convert-partner-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {getPartnerTypeLabel(pt.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="convert-language">{t("common.language", "Language")}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="convert-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="convert-review-notes">
                {t("partnerConvert.reviewNotes", "Review notes (optional)")}
              </Label>
              <Textarea
                id="convert-review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={t(
                  "partnerConvert.reviewNotesPlaceholder",
                  "Why you are approving this application — kept on the partner record."
                )}
                maxLength={1000}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button type="button" onClick={handleConvert} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("partnerConvert.converting", "Sending…")}
                  </>
                ) : (
                  t("partnerConvert.convert", "Send invitation")
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
