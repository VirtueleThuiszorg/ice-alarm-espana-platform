import { useEffect, useMemo, useState } from "react";
import { useMedicalInfo } from "@/hooks/useMemberProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Edit, Home, Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { functionError } from "@/lib/functionError";
import { PageHeader } from "@/components/client/PageHeader";
import {
  FieldLabel,
  LockedValue,
  MedicalFieldRow,
} from "@/components/client/MedicalFieldRow";
import {
  MEDICAL_FIELDS,
  MEDICAL_SECTIONS,
  MEMBER_ACCESS_FIELDS,
} from "@/lib/medicalFields";

/**
 * ALL SIXTEEN FIELDS, plus the access section — MEMBER_UX_RULES R6, and the brief's WP4.
 *
 * WHAT THIS REPLACED. 583 lines of hand-rolled per-field markup that showed EIGHT of the sixteen
 * columns `medical_information` holds. The other eight — where the medication is kept and any
 * notes about it, mobility, hearing, sight, the medical centre, the private insurer and the
 * policy number — were collected somewhere and then invisible to the person they are about.
 *
 * It could not have been otherwise: `types.ts` was missing ten of those columns outright until
 * #188, so half of them would not have compiled. This is the presentation half of a fix whose
 * other half was a type-generation bug.
 *
 * NOW DRIVEN FROM `src/lib/medicalFields.ts`, which is checked against the generated Row type at
 * COMPILE TIME. A column added by a future migration stops the build until somebody places it.
 * Eight-of-sixteen is a state a hand-written page can sit in for months without anybody
 * noticing, and it did — so the page is no longer the sort of thing that can be in that state.
 *
 * THE SUBTITLE IS THE REASON THE COMPLETENESS MATTERS. *"This is exactly what an operator sees
 * the moment you press your pendant."* If that sentence is on the screen it has to be true, and
 * with eight fields missing it was not.
 */

type Scalar = string;
type Values = Record<string, Scalar | string[]>;

function emptyValues(): Values {
  const v: Values = {};
  for (const f of MEDICAL_FIELDS) v[f.column] = f.kind === "list" ? [] : "";
  return v;
}

export default function MedicalInfoPage() {
  const { t } = useTranslation();
  const { memberId } = useAuth();
  const { data: medicalInfo, isLoading } = useMedicalInfo();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [values, setValues] = useState<Values>(emptyValues);

  /**
   * `member_access` — a different table, read-only for the member by RLS.
   *
   * Its own query rather than a join: `medical_information` and `member_access` have different
   * policies, and a member with one row but not the other must see the half they have rather
   * than nothing.
   */
  const access = useQuery({
    queryKey: ["member-access", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_access")
        .select("key_safe_location, key_safe_code, gate_code, access_notes")
        .eq("member_id", memberId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const fromRecord = useMemo(() => {
    const v = emptyValues();
    if (!medicalInfo) return v;
    for (const f of MEDICAL_FIELDS) {
      const raw = (medicalInfo as unknown as Record<string, unknown>)[f.column];
      v[f.column] = f.kind === "list" ? ((raw as string[] | null) ?? []) : ((raw as string | null) ?? "");
    }
    return v;
  }, [medicalInfo]);

  // Outside edit mode the form mirrors the record, so a save elsewhere is reflected here rather
  // than leaving a stale draft on screen.
  useEffect(() => {
    if (!isEditing) setValues(fromRecord);
  }, [fromRecord, isEditing]);

  const onSave = async () => {
    if (!memberId) return;
    setIsSaving(true);
    try {
      /*
        EVERY field is sent, and an empty one is sent as NULL rather than omitted. Omitting it
        would make "I cleared this" indistinguishable from "I did not touch it", and the member
        who deletes a medication they no longer take needs it gone from what the operator reads.
      */
      const payload: Record<string, unknown> = {};
      for (const f of MEDICAL_FIELDS) {
        const v = values[f.column];
        if (f.kind === "list") {
          const list = (v as string[]) ?? [];
          payload[f.column] = list.length > 0 ? list : null;
        } else {
          const s = ((v as string) ?? "").trim();
          payload[f.column] = s.length > 0 ? s : null;
        }
      }

      // medical_information deliberately has NO member INSERT policy, so a member's first save
      // was always RLS-denied. `member-self-service` upserts the caller's OWN row, identity
      // verified server-side, with a whitelist that `medicalInfoFields.test.ts` proves matches
      // the field list this page renders.
      const { data: result, error } = await supabase.functions.invoke("member-self-service", {
        body: { action: "save_medical_info", ...payload },
      });
      if (error) throw await functionError(error);
      if (result?.error) throw new Error(result.error);

      queryClient.invalidateQueries({ queryKey: ["medical-info"] });
      toast.success(t("common.success"));
      setIsEditing(false);
    } catch (e) {
      console.error("Error saving medical info:", e);
      toast.error(t("common.error"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={t("clientNav.medicalInfo", "Medical Information")}
        subtitle={t(
          "medical.subtitle",
          "This is exactly what an operator sees the moment you press your pendant.",
        )}
        action={
          isEditing ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" />
                {t("common.cancel", "Cancel")}
              </Button>
              <Button onClick={onSave} disabled={isSaving} data-testid="medical-save">
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t("common.save", "Save")}
              </Button>
            </div>
          ) : (
            <Button onClick={() => setIsEditing(true)} data-testid="medical-edit">
              {medicalInfo ? <Edit className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {medicalInfo ? t("common.edit", "Edit") : t("common.add", "Add")}
            </Button>
          )
        }
      />

      {/*
        R2: brand red is never a status. This is a notice about who reads the page, not an alert,
        so it is amber-on-cream — the same treatment R3 gives the readiness notice.
      */}
      <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="font-medium">
              {t("medical.emergencyTitle", "Who reads this")}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {t(
                "medical.emergencyDesc",
                "Our operators see this the moment your pendant is pressed, and they read it out to the ambulance crew. Keeping it up to date is the single most useful thing you can do for yourself here.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {MEDICAL_SECTIONS.map((section) => (
        <Card key={section.key} data-testid={`medical-section-${section.key}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t(section.title.key, section.title.fallback)}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            {section.fields.map((field) => (
              <div
                key={field.column}
                className={field.kind === "textarea" ? "md:col-span-2" : undefined}
              >
                <MedicalFieldRow
                  field={field}
                  isEditing={isEditing}
                  value={values[field.column] ?? (field.kind === "list" ? [] : "")}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.column]: v }))}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/*
        GETTING INTO YOUR HOME — a different table, and read-only by RLS rather than by choice.
        `member_access` gives a member SELECT on their own row and no write: an admin records it.
        A key-safe code the account holder can change is a key-safe code anyone who gets into the
        account can change, and the operator would then read a number a stranger typed.

        So it is shown, locked, WITH A REASON — the pattern R7 already sanctions for DOB and NIE.
        R6's ban on "contact support to change" is about fields the member could perfectly well
        edit themselves; this is not one of those.
      */}
      <Card data-testid="medical-section-access">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Home className="h-5 w-5" aria-hidden="true" />
            {t("medical.section.access", "Getting into your home")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          {access.isError ? (
            <p role="alert" className="md:col-span-2 text-base font-medium text-destructive">
              {t(
                "medical.access.loadFailed",
                "We could not read this section. It is not empty — please try again.",
              )}
            </p>
          ) : (
            MEMBER_ACCESS_FIELDS.map((field) => (
              <div key={field.column} className="space-y-1.5" data-testid={`access-field-${field.column}`}>
                <FieldLabel>{t(field.label.key, field.label.fallback)}</FieldLabel>
                <LockedValue
                  value={(access.data?.[field.column] as string | null) ?? null}
                  secret={field.secret}
                  reason={t(
                    "medical.access.locked",
                    "Call us to change this — we check who you are before we alter how someone gets into your home.",
                  )}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
