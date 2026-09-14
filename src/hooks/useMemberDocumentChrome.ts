import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { MEMBER_DOCUMENT_CONFIDENTIALITY, type DocumentCompany } from "@/lib/memberDocument";

/**
 * THE PARTS OF THE MEMBER DOCUMENT THAT ARE THE SAME ON BOTH SURFACES.
 *
 * The staff Overview and the member's own "Review my details" print the same kind of document
 * about the same person. Its title, its printed-by line, what a withheld identity number says,
 * and the confidentiality notice are properties of THE DOCUMENT, not of either dialog — so they
 * are assembled once. Two copies is how the staff sheet ends up with the notice and the member's
 * own copy without it.
 *
 * ── THE CLOCK IS MADRID'S, ALWAYS ───────────────────────────────────────────
 *
 * `toLocaleString()` uses the reader's machine. A record printed by an operator on a laptop still
 * set to London, and the same record printed by the member in Almería, would carry timestamps an
 * hour apart for the same act — and the two sheets end up in the same folder. The company is in
 * Almería and the members are in Spain, so the document's clock is Europe/Madrid and it says so
 * by being consistent, not by carrying a timezone abbreviation nobody reads.
 *
 * ── THE NOTICE IS NOT TRANSLATED, IT IS TRILINGUAL ──────────────────────────
 *
 * All three lines print, whatever the reader's language. A sheet about a Spanish member of a
 * Dutch-owned company, handed to a British family and filed by a Spanish clinic, has no single
 * right language for "destroy this securely" — and the person who most needs to read it is
 * whoever finds it later, who was never in the conversation that set the language.
 */
export interface MemberDocumentChrome {
  /** "Member record" / "Ficha del socio" / "Ledendossier". */
  title: string;
  /** What a withheld identity number says in place of its value. */
  redacted: string;
  /** The three-language confidentiality notice, in document order. */
  confidentiality: readonly string[];
  /**
   * The company block, from `system_settings` — the same four settings the public site reads,
   * never a literal. `phone` is null when `settings_emergency_phone` is unset, and the document
   * then omits the line rather than printing a separator around nothing.
   */
  company: DocumentCompany;
  /**
   * The meta line. `null` when nobody is signed in as staff — the member printing their own
   * record is not "printed by" anybody, and naming them would be odd on their own document.
   */
  metaPrintedBy: (who: string | null) => string;
}

export function useMemberDocumentChrome(): MemberDocumentChrome {
  const { t, i18n } = useTranslation();
  const { settings } = useCompanySettings();

  const when = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language || "en-GB", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Madrid",
      }),
    [i18n.language],
  );

  const metaPrintedBy = useCallback(
    (who: string | null) => {
      const date = when.format(new Date());
      return who
        ? t("memberDocument.printedBy", "Printed by {{who}} on {{date}} · icealarm.es", {
            who,
            date,
          })
        : t("memberDocument.printedOn", "Printed on {{date}} · icealarm.es", { date });
    },
    [t, when],
  );

  const company = useMemo<DocumentCompany>(
    () => ({
      name: settings.company_name,
      phone: settings.emergency_phone,
      email: settings.support_email,
      address: settings.address,
    }),
    [settings],
  );

  return {
    title: t("memberDocument.title", "Member record"),
    redacted: t("memberDocument.redacted", "Held — not printed"),
    confidentiality: MEMBER_DOCUMENT_CONFIDENTIALITY,
    company,
    metaPrintedBy,
  };
}
