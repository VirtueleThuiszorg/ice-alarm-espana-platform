import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MEDICAL_FIELDS } from "@/lib/medicalFields";
import { REQUIRED_GROUP_LABELS, type RequiredGroup } from "@/lib/memberRequiredFields";

/**
 * "REVIEW MY DETAILS" — everything we hold about a member, read-only, on one sheet.
 *
 * WHY IT EXISTS SEPARATELY FROM THE PAGES. A member's record is spread over Profile, Medical and
 * Contacts, and the question *"what do you actually have about me?"* is a GDPR-shaped question
 * that no single page answers. It is also the question somebody asks before a hospital
 * appointment, which is why the sheet prints.
 *
 * ONLY FIELDS WITH VALUES. An empty row here is not "Not added" — it is noise. On the editing
 * pages an absent value matters (R6: "Not added" + inline Add, so the member can see what to
 * fill in); on a sheet whose job is to answer "what do you hold", a list of things we do NOT
 * hold is the wrong answer to the question and makes the real content harder to find.
 *
 * SAME GROUPS, SAME ORDER as the Complete dialog and the staff Missing-info sheet, from
 * `REQUIRED_GROUP_LABELS`. A member who has just filled in "Medical" should find it under
 * "Medical".
 *
 * PRINT IS `window.print()`, AND THAT IS THE RIGHT ANSWER. Every browser's print dialog offers
 * "Save as PDF", on every platform these members use, with no dependency and nothing to keep up
 * to date. A bundled PDF generator would add ~200 KB to the member bundle to produce a worse
 * document than the one the OS already makes — and `@media print` rules are what make the
 * printed page a document rather than a screenshot of a modal.
 */

export interface ReviewMyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null | undefined;
}

interface Row {
  label: string;
  value: string;
}

/** Blank, null and an empty array are all "we do not hold this". */
function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function ReviewMyDetailsDialog({
  open,
  onOpenChange,
  memberId,
}: ReviewMyDetailsDialogProps) {
  const { t } = useTranslation();

  /*
    READ ONLY WHEN THE DIALOG IS OPEN. This is the widest read in the member portal — the whole
    member row, the whole medical row and every contact — and it is opened by a small number of
    members occasionally. Fetching it on every dashboard render would put three queries on the
    page a member opens most, to answer a question they have not asked.
  */
  const { data, isLoading } = useQuery({
    queryKey: ["member-review-details", memberId],
    enabled: open && !!memberId,
    queryFn: async () => {
      const id = memberId as string;
      const [member, medical, contacts] = await Promise.all([
        supabase.from("members").select("*").eq("id", id).maybeSingle(),
        supabase.from("medical_information").select("*").eq("member_id", id).maybeSingle(),
        supabase
          .from("emergency_contacts")
          .select("contact_name, relationship, phone, priority_order")
          .eq("member_id", id)
          .order("priority_order"),
      ]);
      return {
        member: (member.data ?? null) as Record<string, unknown> | null,
        medical: (medical.data ?? null) as Record<string, unknown> | null,
        contacts: (contacts.data ?? []) as Array<{
          contact_name: string | null;
          relationship: string | null;
          phone: string | null;
        }>,
      };
    },
  });

  const sections = useMemo((): Array<{ group: RequiredGroup | "away"; rows: Row[] }> => {
    if (!data) return [];
    const m = data.member ?? {};

    const row = (label: string, value: unknown): Row[] =>
      present(value) ? [{ label, value: asText(value) }] : [];

    const date = (value: unknown): string | null => {
      if (!present(value)) return null;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? String(value) : format(parsed, "d MMMM yyyy");
    };

    const identity: Row[] = [
      ...row(t("member.firstName", "First name"), m.first_name),
      ...row(t("member.lastName", "Last name"), m.last_name),
      ...row(t("member.dateOfBirth", "Date of birth"), date(m.date_of_birth)),
      ...row(t("common.nieDni", "NIE / DNI"), m.nie_dni),
      ...row(t("profile.preferredLanguage", "Preferred language"), m.preferred_language),
    ];

    const address: Row[] = [
      ...row(t("member.addressLine1", "Address"), m.address_line_1),
      ...row(t("profile.addressLine2", "Address line 2"), m.address_line_2),
      ...row(t("profile.urbanizacion", "Urbanización"), m.urbanizacion),
      ...row(t("profile.bloque", "Bloque"), m.bloque),
      ...row(t("profile.portal", "Portal"), m.portal),
      ...row(t("profile.escalera", "Escalera"), m.escalera),
      ...row(t("member.city", "Town or city"), m.city),
      ...row(t("member.province", "Province"), m.province),
      ...row(t("member.postalCode", "Postal code"), m.postal_code),
      ...row(t("profile.country", "Country"), m.country),
    ];

    const contact: Row[] = [
      ...row(t("member.phone", "Phone"), m.phone),
      ...row(t("member.email", "Email"), m.email),
    ];

    /*
      MEDICAL COMES FROM `medicalFields.ts`, all sixteen, in its own order.

      Not a hand-written list: that module is checked against the generated Row type at compile
      time, so a column added by a future migration appears here without anybody remembering to
      add it. A hand-written list is how the Medical PAGE sat at eight-of-sixteen for months.
    */
    const medical: Row[] = data.medical
      ? MEDICAL_FIELDS.flatMap((field) =>
          row(t(field.label.key, field.label.fallback), data.medical?.[field.column]),
        )
      : [];

    const contactsRows: Row[] = data.contacts
      .filter((c) => present(c.contact_name) || present(c.phone))
      .map((c) => ({
        label: [c.contact_name, c.relationship].filter(Boolean).join(" — ") || "—",
        value: c.phone ?? "",
      }));

    // Away is not one of the required groups, but it is something we hold and a member asking
    // "what do you have" should see it.
    const away: Row[] = [
      ...row(t("profile.awayFrom", "Away from"), date(m.away_from)),
      ...row(t("profile.awayUntil", "Back on"), date(m.away_until)),
    ];

    return (
      [
        { group: "identity" as const, rows: identity },
        { group: "address" as const, rows: address },
        { group: "contact" as const, rows: contact },
        { group: "medical" as const, rows: medical },
        { group: "contacts" as const, rows: contactsRows },
        { group: "away" as const, rows: away },
      ]
        // Empty groups are omitted whole, for the same reason empty rows are.
        .filter((section) => section.rows.length > 0)
    );
  }, [data, t]);

  const memberName = [data?.member?.first_name, data?.member?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto print:max-h-none print:overflow-visible">
        <DialogHeader>
          <DialogTitle>{t("reviewDetails.title", "Review my details")}</DialogTitle>
          <DialogDescription>
            {t(
              "reviewDetails.subtitle",
              "Everything we hold about you. Only the things we actually have are listed.",
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sections.length === 0 ? (
          <p className="text-base text-muted-foreground" data-testid="review-empty">
            {t(
              "reviewDetails.empty",
              "We do not hold any details for you yet. Use “Complete my details” to add them.",
            )}
          </p>
        ) : (
          <div className="space-y-6" data-testid="review-details-body">
            {/* Only on the PRINTED sheet: a document needs to say whose it is and when. */}
            <div className="hidden print:block">
              <p className="text-base font-semibold">{memberName}</p>
              <p className="text-[0.8125rem] text-muted-foreground">
                {t("reviewDetails.printedOn", "Printed {{date}}", {
                  date: format(new Date(), "d MMMM yyyy"),
                })}
              </p>
            </div>

            {sections.map(({ group, rows }) => (
              <section key={group} data-testid={`review-group-${group}`} className="space-y-2">
                <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group === "away"
                    ? t("profile.awayTitle", "Going away?")
                    : t(REQUIRED_GROUP_LABELS[group].key, REQUIRED_GROUP_LABELS[group].fallback)}
                </h3>
                <dl className="divide-y">
                  {rows.map((r, i) => (
                    <div
                      key={`${r.label}-${i}`}
                      className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-6"
                    >
                      <dt className="text-[0.8125rem] uppercase tracking-wide text-muted-foreground">
                        {r.label}
                      </dt>
                      <dd className="whitespace-pre-wrap text-base sm:text-right">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}

        <DialogFooter className="print:hidden">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="touch-target"
          >
            {t("common.close", "Close")}
          </Button>
          {sections.length > 0 && (
            /*
              `window.print()`. Every browser's print dialog offers "Save as PDF" on every
              platform these members use, with no dependency and nothing to keep up to date. A
              bundled PDF generator would add a couple of hundred kilobytes to the member bundle
              to produce a worse document than the one the OS already makes.
            */
            <Button
              variant="ink"
              onClick={() => window.print()}
              className="touch-target"
              data-testid="review-details-print"
            >
              <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("reviewDetails.print", "Print / Save as PDF")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
