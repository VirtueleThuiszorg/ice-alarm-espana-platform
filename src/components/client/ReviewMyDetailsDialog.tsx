import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Printer } from "lucide-react";
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
import { MemberDocumentView } from "@/components/MemberDocumentView";
import { useMemberDocumentChrome } from "@/hooks/useMemberDocumentChrome";
import { MEDICAL_FIELDS } from "@/lib/medicalFields";
import { overviewDate } from "@/lib/memberOverview";
import { REQUIRED_GROUP_LABELS, type RequiredGroup } from "@/lib/memberRequiredFields";
import {
  documentInitials,
  documentPhone,
  memberDocumentAsPrintHtml,
  type DocumentField,
  type MemberDocument,
} from "@/lib/memberDocument";

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
 * THE BROWSER'S PRINT DIALOG IS STILL THE PDF GENERATOR, and that is still the right answer:
 * it offers "Save as PDF" on every platform these members use, with no dependency and nothing to
 * keep up to date. A bundled generator would add a couple of hundred kilobytes to the MEMBER
 * bundle to produce a worse document than the OS already makes.
 *
 * WHAT CHANGED IS WHAT GETS PRINTED. It used to be `window.print()` over this dialog with
 * `@media print` rules — a printed modal, with the app's ground behind it and no way to set an
 * A4 page, a margin, or a rule against splitting a section across two sheets. It now builds the
 * SAME standalone document the staff Overview prints, in an off-screen iframe. One template, two
 * surfaces: see `src/lib/memberDocument.ts`.
 *
 * THE MEMBER'S OWN IDENTITY NUMBERS ARE ON IT. On the staff sheet a NIE is withheld unless
 * somebody ticks a box, because that sheet is printed ABOUT a member by somebody else. This one
 * is the member's own record, printed by them, and a "what do you hold about me" answer that
 * redacts their own NIE answers the question wrongly.
 *
 * AND THEIR STATUS IS NOT. `active` / `pending_review` is an operational fact about our billing,
 * not about them; a member reading "Pending review" on their own record would reasonably think
 * something was wrong with their alarm. The staff sheet carries the chip because staff act on it.
 */

export interface ReviewMyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null | undefined;
}

/**
 * A line on the sheet, already carrying how it should LOOK on the document.
 *
 * The staff sheet can decide that from the label, because `buildMemberOverview` emits fixed
 * English labels. This one's labels are translated, so matching on them would work in English
 * and quietly stop working in Spanish — the note box and the grouped phone number would vanish
 * for exactly the members who read the Spanish sheet. So the flag is set where the row is built.
 */
type Row = DocumentField;

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
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en-GB";

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

    const row = (label: string, value: unknown, extra?: Partial<Row>): Row[] =>
      present(value) ? [{ label, value: asText(value), ...extra }] : [];

    /*
      THE SAME LONG FORM, IN THE MEMBER'S OWN LANGUAGE, from the same function the staff sheet
      uses. `date-fns`' `format` is locale-blind unless you hand it a locale object, so this
      printed "9 March 1947" on a sheet that was otherwise entirely in Spanish.
    */
    const date = (value: unknown): string | null =>
      present(value) ? (overviewDate(value, locale) ?? String(value)) : null;

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
      ...row(t("member.phone", "Phone"), present(m.phone) ? documentPhone(asText(m.phone)) : null),
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
        value: c.phone ? documentPhone(c.phone) : "",
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
  }, [data, locale, t]);

  const memberName =
    [data?.member?.first_name, data?.member?.last_name].filter(Boolean).join(" ").trim() ||
    t("reviewDetails.you", "Your record");

  const chrome = useMemberDocumentChrome();

  const doc = useMemo<MemberDocument>(
    () => ({
      title: chrome.title,
      subject: {
        name: memberName,
        initials: documentInitials(memberName),
        photoUrl: typeof data?.member?.photo_url === "string" ? data.member.photo_url : null,
        // No member number exists on `members`, and no status chip on purpose — see the note at
        // the top of this file.
        memberNumber: null,
        status: null,
      },
      factCount: t("reviewDetails.factCount", "{{count}} details on file", {
        count: sections.reduce((total, s) => total + s.rows.length, 0),
      }),
      // Nobody "printed by" here: it is the member's own record, printed by them.
      meta: chrome.metaPrintedBy(null),
      company: chrome.company,
      confidentiality: chrome.confidentiality,
      sections: sections.map(({ group, rows }) => ({
        key: group,
        title:
          group === "away"
            ? t("profile.awayTitle", "Going away?")
            : t(REQUIRED_GROUP_LABELS[group].key, REQUIRED_GROUP_LABELS[group].fallback),
        fields: rows,
      })),
    }),
    [chrome, data, memberName, sections, t],
  );

  /**
   * Print the DOCUMENT, from an off-screen iframe — the same path the staff Overview uses.
   *
   * `window.open` is blocked often enough that the button would sometimes do nothing at all,
   * with no way for the member pressing it to tell why; an iframe in the current document always
   * exists. And printing a separate document rather than this dialog is what makes the sheet A4
   * with margins, keeps a section off a page boundary, and puts the company and the
   * confidentiality notice on it — none of which `@media print` over a modal can do.
   */
  const print = () => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", `${memberName} — ${chrome.title}`);
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const frameDoc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!frameDoc || !win) {
      frame.remove();
      toast.error(t("reviewDetails.printFailed", "Could not open the print view"));
      return;
    }
    frameDoc.open();
    frameDoc.write(memberDocumentAsPrintHtml(doc));
    frameDoc.close();
    win.focus();
    win.print();
    // Removed after the print dialog has taken its snapshot; removing it synchronously cancels
    // the print in some browsers.
    window.setTimeout(() => frame.remove(), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
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
              "We do not hold any details for you yet. Use \u201cComplete my details\u201d to add them.",
            )}
          </p>
        ) : (
          <div data-testid="review-details-body">
            <MemberDocumentView doc={doc} />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="touch-target"
          >
            {t("common.close", "Close")}
          </Button>
          {sections.length > 0 && (
            /*
              The one red button on this sheet (R1). The browser's own print dialog is the PDF
              generator — see the note at the top of this file for why that is still right and
              what changed about the document it is handed.
            */
            <Button
              variant="ink"
              onClick={print}
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
