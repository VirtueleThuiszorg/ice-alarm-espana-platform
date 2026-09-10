import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BLOOD_TYPES } from "@/lib/medicalFields";
import {
  REQUIRED_GROUP_LABELS,
  type RequiredField,
} from "@/lib/memberRequiredFields";
import {
  buildUpdateSubmission,
  groupUpdateFormFields,
  updateFormFields,
  type UpdateFormField,
} from "@/lib/memberUpdateForm";

/**
 * "COMPLETE MY DETAILS" — the member fills in what we have been chasing, in one place.
 *
 * THE SAME DEFINITION AS EVERYWHERE ELSE. The fields come from `memberRequiredFields.ts` via
 * `useMemberMissingInfo`, and the controls from `memberUpdateForm.ts` — the module the emailed
 * update LINK already uses. That is deliberate and it is the whole reason this dialog is short:
 * a member answering the same question from their dashboard rather than from an email gets the
 * same list, the same grouping and the same controls, because there is one list. A hand-written
 * form here would be the fifth opinion `memberRequiredFields` was written to end.
 *
 * WHAT THE DIALOG DOES NOT OFFER. Anything with `memberCanSupply: false` — a pendant's IMEI, a
 * tested pendant, an active subscription. `updateFormFields` filters them out by construction,
 * because asking a member to type the IMEI of a device we have not sent yet is asking for
 * something they cannot give, on a form whose whole promise is "fill this in and you are done".
 *
 * WHY THE WRITES GO WHERE THEY GO. Two targets, two existing routes, and neither is new:
 *
 *   - `members` columns → a direct self-UPDATE, the route `clientWriteSweep.test.ts` pins as
 *     allowed and the one `ProfilePage` has always used.
 *   - `medical_information` → `member-self-service`, because that table has a member UPDATE
 *     policy and NO member INSERT, so a member's first medical save is RLS-denied without it.
 *
 * CONTACTS ARE NOT HERE. `emergency_contact` and `emergency_contact_phone` are the contacts
 * EDITOR, not a field — a repeated block with a name, a relationship, a phone and a priority.
 * Cramming it into a dialog beside eight single-line inputs would produce a worse editor than
 * the page that already exists, so the dialog says what is missing and links to it. That is the
 * honest version of "each an inline input": every field that IS a field gets one.
 */

export interface CompleteMyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null | undefined;
  /** The missing REQUIRED items, from `useMemberMissingInfo`. */
  missing: readonly RequiredField[];
  /** Called after a save that wrote something, so the badge can be re-read. */
  onSaved?: () => void;
}

export function CompleteMyDetailsDialog({
  open,
  onOpenChange,
  memberId,
  missing,
  onSaved,
}: CompleteMyDetailsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /** The missing items that are actually fields, with their controls and target tables. */
  const fields = useMemo(
    () => updateFormFields(missing.map((f) => f.key)),
    [missing],
  );
  const groups = useMemo(() => groupUpdateFormFields(fields), [fields]);

  /** Missing contacts are a link, not an input — see the module comment. */
  const contactsMissing = useMemo(
    () => missing.filter((f) => f.group === "contacts"),
    [missing],
  );

  const typedSomething = Object.values(values).some((v) => v.trim().length > 0);

  const save = async () => {
    if (!memberId) return;
    const { member, medical } = buildUpdateSubmission(fields, values);

    if (Object.keys(member).length === 0 && Object.keys(medical).length === 0) {
      // Nothing typed. Closing silently would look like a save; saying so costs one sentence.
      toast.error(
        t("completeDetails.nothingTyped", "Fill in at least one of these before saving."),
      );
      return;
    }

    setSaving(true);
    try {
      if (Object.keys(member).length > 0) {
        const { error } = await supabase.from("members").update(member).eq("id", memberId);
        if (error) throw error;
      }

      if (Object.keys(medical).length > 0) {
        const { data, error } = await supabase.functions.invoke("member-self-service", {
          body: { action: "save_medical_info", ...medical },
        });
        if (error) throw await functionError(error);
        if (data?.error) throw new Error(data.error);
      }

      /*
        TELL SOMEBODY. The moment a record becomes usable in an emergency is the moment a
        readiness queue entry can be cleared and a courtesy call stopped — without the event the
        writes land silently and somebody rings a member who has already answered.

        FAILING TO NOTIFY IS NOT FAILING TO SAVE. The member's details ARE saved by this point,
        so an error here is logged and swallowed: telling them their details did not save, when
        they visibly did, is the worse outcome and would send them round again.
      */
      const filled = Object.keys(member).length + Object.keys(medical).length;
      try {
        await supabase.functions.invoke("member-self-service", {
          body: {
            action: "details_completed",
            filled,
            remaining: Math.max(0, missing.length - filled),
          },
        });
      } catch {
        console.warn("[completeDetails] staff were not notified; the details are saved");
      }

      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      queryClient.invalidateQueries({ queryKey: ["member-missing-info"] });
      queryClient.invalidateQueries({ queryKey: ["medical-info"] });
      queryClient.invalidateQueries({ queryKey: ["member-dashboard"] });
      toast.success(t("completeDetails.saved", "Thank you — we have saved that."));
      setValues({});
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving member details:", error);
      toast.error(t("completeDetails.failed", "We could not save that. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const control = (field: UpdateFormField) => {
    const id = `complete-${field.key}`;
    const value = values[field.key] ?? "";
    const set = (next: string) => setValues((prev) => ({ ...prev, [field.key]: next }));

    if (field.control === "bloodType") {
      return (
        <Select value={value} onValueChange={set}>
          <SelectTrigger id={id} data-testid={`complete-field-${field.key}`}>
            <SelectValue placeholder={t("medical.chooseBloodType", "Choose")} />
          </SelectTrigger>
          <SelectContent>
            {BLOOD_TYPES.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        id={id}
        data-testid={`complete-field-${field.key}`}
        type={
          field.control === "date"
            ? "date"
            : field.control === "tel"
              ? "tel"
              : field.control === "email"
                ? "email"
                : "text"
        }
        value={value}
        onChange={(event) => set(event.target.value)}
        placeholder={
          field.control === "list"
            ? t("completeDetails.listHint", "Separate each one with a comma")
            : undefined
        }
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("completeDetails.title", "Complete my details")}</DialogTitle>
          <DialogDescription>
            {/*
              WHY WE ARE ASKING, not just what for. `memberRequiredFields` carries a `because`
              sentence per field for exactly this reason — "we need your blood group" reads as
              bureaucracy, "an operator reads this to the ambulance crew" is a reason somebody
              acts on. The per-field sentence is under each input.
            */}
            {t(
              "completeDetails.subtitle",
              "These are the things we still need. Each one is used when somebody presses your alarm.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {groups.map(({ group, fields: groupFields }) => (
            <section key={group} data-testid={`complete-group-${group}`} className="space-y-4">
              <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(REQUIRED_GROUP_LABELS[group].key, REQUIRED_GROUP_LABELS[group].fallback)}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {groupFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`complete-${field.key}`}>
                      {t(field.field.label.key, field.field.label.fallback)}
                    </Label>
                    {control(field)}
                    <p className="text-[0.8125rem] text-muted-foreground">
                      {t(field.field.because.key, field.field.because.fallback)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {contactsMissing.length > 0 && (
            /*
              A LINK, NOT AN INPUT. A contact is a name, a relationship, a phone and a priority —
              a repeated block, not a line. Squeezing the editor in here would produce a worse
              one than the page that already exists, so the dialog says what is missing and
              sends them to it.
            */
            <section data-testid="complete-group-contacts" className="space-y-2 border-t pt-4">
              <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(REQUIRED_GROUP_LABELS.contacts.key, REQUIRED_GROUP_LABELS.contacts.fallback)}
              </h3>
              {contactsMissing.map((field) => (
                <p key={field.key} className="text-base">
                  {t(field.because.key, field.because.fallback)}
                </p>
              ))}
              <Button variant="outline" className="touch-target" asChild>
                <a href="/dashboard/contacts" data-testid="complete-contacts-link">
                  {t("completeDetails.goToContacts", "Add an emergency contact")}
                </a>
              </Button>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="touch-target"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          {/* Only when there IS something to save — a Save on a dialog of links does nothing. */}
          {fields.length > 0 && (
            <Button
              onClick={save}
              disabled={saving || !typedSomething}
              className="touch-target"
              data-testid="complete-details-save"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save", "Save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
