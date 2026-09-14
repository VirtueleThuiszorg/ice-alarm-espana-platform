import { CONTACT_TYPES } from "@/lib/contactTypes";
import { MEDICAL_FIELDS } from "@/lib/medicalFields";
import { documentPhone, type DocumentSection } from "@/lib/memberDocument";

/**
 * EVERYTHING WE HAVE ON THIS MEMBER, ON ONE SHEET — and nothing we do not.
 *
 * WHAT IT IS FOR. Twelve tabs is the right shape for working a record and the wrong shape for
 * answering "what do we actually know about her?" — the question somebody asks on the phone,
 * before a home visit, or when handing a case to a colleague. This assembles that answer once,
 * read-only, in one dialog they can copy or print.
 *
 * EMPTY FIELDS ARE OMITTED, NEVER SHOWN AS "—". A sheet of dashes is a worse answer than a
 * short sheet: it takes longer to read, it buries the four facts that are there among thirty
 * that are not, and printed out it looks like a form somebody failed to fill in. What is
 * missing has its own dialog, with the reasons and a way to ask for it — this one is only what
 * we hold.
 *
 * PURE, so what appears on the sheet is a function of the record and can be asserted without
 * rendering anything. The dialog decides how it looks; this decides what is on it.
 */

export type OverviewGroupKey =
  | "identity"
  | "address"
  | "contact"
  | "medical"
  | "contacts"
  | "device"
  | "membership"
  | "payer";

export interface OverviewRow {
  label: string;
  value: string;
}

export interface OverviewSection {
  key: OverviewGroupKey;
  title: string;
  rows: OverviewRow[];
}

/** Every read the sheet makes. All nullable: a source that has not answered contributes nothing. */
export interface MemberOverviewData {
  member: Record<string, unknown> | null | undefined;
  medical: Record<string, unknown> | null | undefined;
  contacts:
    | ReadonlyArray<{
        contact_name?: string | null;
        relationship?: string | null;
        contact_type?: string | null;
        phone?: string | null;
        email?: string | null;
        is_primary?: boolean | null;
        speaks_spanish?: boolean | null;
        can_attend_in_person?: boolean | null;
        availability_notes?: string | null;
        notes?: string | null;
      }>
    | null
    | undefined;
  device:
    | {
        imei?: string | null;
        model?: string | null;
        status?: string | null;
        last_checkin_at?: string | null;
        is_online?: boolean | null;
        battery_level?: number | null;
        sim_phone_number?: string | null;
      }
    | null
    | undefined;
  /** From the readiness view — the canonical answer, not re-derived from orders. */
  deviceTestedAt?: string | null;
  subscription:
    | {
        plan_type?: string | null;
        status?: string | null;
        billing_frequency?: string | null;
        renewal_date?: string | null;
        amount?: number | null;
        has_pendant?: boolean | null;
        payment_method?: string | null;
        is_free_of_charge?: boolean | null;
      }
    | null
    | undefined;
  /** Only when somebody OTHER than the member pays. */
  payer:
    | {
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
        relationship?: string | null;
      }
    | null
    | undefined;
}

/** A value worth printing. Blank, empty and absent values are not. */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // `false` is a fact ("does not speak Spanish"), so it prints. Only absence is dropped.
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim()).filter(Boolean);
    return items.length > 0 ? items.join(", ") : null;
  }
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * A date somebody reads, not an ISO string. Unparseable input contributes nothing.
 *
 * LONG FORM, IN THE READER'S LANGUAGE. `5 April 1938` / `5 de abril de 1938` / `5 april 1938`.
 * Long rather than numeric because `05/04/1938` and `04/05/1938` are the same eight characters
 * and different days — a British member, a Spanish clinic and a Dutch relative each read that
 * ordering as their own, and this sheet is handed between exactly those three. A month spelt out
 * cannot be misread.
 *
 * The locale defaults to en-GB so every existing caller and test is unchanged; the member
 * document passes the active language.
 */
export function overviewDate(value: unknown, locale = "en-GB"): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function row(label: string, value: unknown): OverviewRow | null {
  const printable = text(value);
  return printable === null ? null : { label, value: printable };
}

function section(
  key: OverviewGroupKey,
  title: string,
  rows: Array<OverviewRow | null>,
): OverviewSection | null {
  const kept = rows.filter((r): r is OverviewRow => r !== null);
  // A section with nothing in it is not a heading over a blank space; it is absent.
  return kept.length > 0 ? { key, title, rows: kept } : null;
}

/**
 * THE THREE ROWS THAT ARE NOT PRINTED BY DEFAULT.
 *
 * A NIE, a passport number and a social-security number are the three things on this sheet that
 * are worth stealing on their own — they open a bank account and a clinic file. The rest of the
 * record is sensitive; these are *transferable*. A sheet left on a desk, faxed to a surgery or
 * dropped in a recycling bin should not carry them unless somebody decided it should.
 *
 * So they are REDACTED, NOT REMOVED. Removing the rows would say we do not hold them, which is a
 * different and false statement — and the fact-count would change depending on a print option.
 * The row stays, the value says it is held and not shown, and a tick box prints it in full.
 *
 * Labels rather than column names because the sheet is built from labels; they are declared here
 * and used below, so the two cannot drift into a redaction that silently matches nothing.
 */
export const IDENTITY_NUMBER_LABELS = ["NIE / DNI", "Passport", "Social security number"] as const;

/**
 * Rows somebody typed a paragraph into. Squeezed into the value column of a two-column grid they
 * wrap to eight ragged lines; on the document they get the full measure and a border.
 */
export const NOTE_LABELS = ["Access notes", "Language notes"] as const;

/** Rows that hold a bare number, which is grouped so it can be read down a line. */
export const PHONE_LABELS = ["Phone", "SIM number"] as const;

const CONTACT_TYPE_LABEL = new Map<string, string>(
  CONTACT_TYPES.map((t) => [t.type, t.label.fallback]),
);

/**
 * Assemble the sheet.
 *
 * Section order is the order somebody reads it under pressure: who they are, where they are,
 * how to reach them, what is wrong with them, who else to call — then the commercial facts.
 */
export function buildMemberOverview(
  data: MemberOverviewData,
  /** BCP-47 tag for the dates on the sheet. Defaults to en-GB, the language this file's own
   *  labels are written in, so a caller that does not care is unchanged. */
  locale = "en-GB",
): OverviewSection[] {
  const m = data.member ?? {};
  const med = data.medical ?? {};
  const onDate = (value: unknown) => overviewDate(value, locale);

  const sections: Array<OverviewSection | null> = [
    section("identity", "Identity", [
      row("Name", [m.title, m.first_name, m.last_name].map(text).filter(Boolean).join(" ")),
      row("Known as", m.nickname),
      row("Date of birth", onDate(m.date_of_birth)),
      row(IDENTITY_NUMBER_LABELS[0], m.nie_dni),
      row(IDENTITY_NUMBER_LABELS[1], m.passport_number),
      row(IDENTITY_NUMBER_LABELS[2], m.an_ss_number),
      row("Nationality", m.nationality),
      row("Gender", m.gender),
      row("Marital status", m.marital_status),
      row("Preferred language", m.preferred_language),
      row(NOTE_LABELS[1], m.language_notes),
      // If it is set at all, nothing else on the sheet matters as much.
      row("Deceased", onDate(m.deceased_at)),
    ]),

    section("address", "Address", [
      row("Address", m.address_line_1),
      row("Address line 2", m.address_line_2),
      // Spanish addresses are found by these, not by the street line alone. Whoever is directing
      // an ambulance to a coastal urbanización needs the block and the stair, and we hold them.
      row("Urbanización", m.urbanizacion),
      row("Block", m.bloque),
      row("Portal", m.portal),
      row("Stair", m.escalera),
      row("Town or city", m.city),
      row("Province", m.province),
      row("Postal code", m.postal_code),
      row("Country", m.country),
      row("Map", m.map_link),
      // How to get in — whoever is sent round needs this beside the address, not three tabs away.
      row(NOTE_LABELS[0], m.special_instructions),
      row("Away from", onDate(m.away_from)),
      row("Away until", onDate(m.away_until)),
    ]),

    section("contact", "Contact details", [
      row(PHONE_LABELS[0], m.phone),
      row("Email", m.email),
      row("Preferred contact method", m.preferred_contact_method),
      row("Best time to call", m.preferred_contact_time),
    ]),

    // Every medical column, in the order medicalFields.ts declares them. MEDICAL_FIELDS is the
    // flattened list the Medical tab itself renders, so this sheet cannot drift from that tab,
    // and a column added by a future migration appears here without anybody editing this file.
    section(
      "medical",
      "Medical",
      MEDICAL_FIELDS.map((f) => row(f.label.fallback, med[f.column])),
    ),

    section(
      "contacts",
      "Emergency contacts",
      (data.contacts ?? []).map((c, index) => {
        const name = text(c.contact_name);
        // A row with no name is not a contact — it is a half-saved record, and printing
        // "Contact 2: 600 000 000" tells an operator to ring a stranger.
        if (!name) return null;
        const kind =
          text(c.relationship) ??
          (c.contact_type ? (CONTACT_TYPE_LABEL.get(c.contact_type) ?? null) : null);
        const parts = [
          kind,
          text(c.phone),
          text(c.email),
          c.is_primary === true ? "primary" : null,
          c.speaks_spanish === true ? "speaks Spanish" : null,
          // Tri-state: unknown stays unsaid rather than becoming "cannot attend".
          c.can_attend_in_person === true
            ? "can attend in person"
            : c.can_attend_in_person === false
              ? "cannot attend in person"
              : null,
          text(c.availability_notes),
          text(c.notes),
        ].filter(Boolean);
        return { label: `Contact ${index + 1}`, value: [name, ...parts].join(" · ") };
      }),
    ),

    section("device", "Device", [
      row("IMEI", data.device?.imei),
      row("Model", data.device?.model),
      row(PHONE_LABELS[1], data.device?.sim_phone_number),
      row("Status", data.device?.status),
      row("Online now", data.device?.is_online),
      row(
        "Battery",
        typeof data.device?.battery_level === "number" ? `${data.device.battery_level}%` : null,
      ),
      row("Last check-in", onDate(data.device?.last_checkin_at)),
      row("Tested with an operator", onDate(data.deviceTestedAt)),
    ]),

    section("membership", "Membership", [
      row("Plan", data.subscription?.plan_type),
      row("Status", data.subscription?.status),
      row("Billing", data.subscription?.billing_frequency),
      row(
        "Amount",
        typeof data.subscription?.amount === "number"
          ? `€${data.subscription.amount.toFixed(2)}`
          : null,
      ),
      row("Payment method", data.subscription?.payment_method),
      row("Free of charge", data.subscription?.is_free_of_charge === true ? true : null),
      row("Includes a pendant", data.subscription?.has_pendant),
      row("Next renewal", onDate(data.subscription?.renewal_date)),
    ]),

    // Only when somebody else pays. For a member who pays for themselves this section does not
    // exist, rather than repeating their own name under a second heading.
    section("payer", "Paid for by", [
      row("Name", data.payer?.full_name),
      row("Relationship", data.payer?.relationship),
      row("Email", data.payer?.email),
      row("Phone", data.payer?.phone),
    ]),
  ];

  return sections.filter((s): s is OverviewSection => s !== null);
}

/** How many facts the sheet holds — the dialog says so, because "we know 4 things" is a finding. */
export function overviewFactCount(sections: readonly OverviewSection[]): number {
  return sections.reduce((total, s) => total + s.rows.length, 0);
}

export interface OverviewDocumentOptions {
  /**
   * OFF by default, on both surfaces that print this sheet.
   *
   * A default of ON would mean every routine printout carried three transferable identity
   * numbers, and the option would only ever be noticed by whoever thought to turn it off — which
   * is nobody, because the cost of leaving it on is paid by the member months later.
   */
  includeIdentityNumbers: boolean;
  /** What a redacted identity row says instead of its value, in the reader's language. */
  redactedLabel: string;
}

/**
 * The overview sheet as the shared document model.
 *
 * ADAPTER, NOT A SECOND BUILDER. `buildMemberOverview` still decides what is on the sheet; this
 * only decides how each row is presented on a document — which rows are a paragraph rather than
 * a value, which hold a number worth grouping, and which are redacted.
 *
 * Rows are never added or dropped here. A redacted identity number keeps its row and its place
 * in the fact count, because "we hold a NIE and did not print it" and "we hold no NIE" are
 * different facts and the sheet's whole promise is that it says which.
 */
export function overviewAsDocumentSections(
  sections: readonly OverviewSection[],
  { includeIdentityNumbers, redactedLabel }: OverviewDocumentOptions,
): DocumentSection[] {
  const identity = new Set<string>(IDENTITY_NUMBER_LABELS);
  const notes = new Set<string>(NOTE_LABELS);
  const phones = new Set<string>(PHONE_LABELS);

  return sections.map((s) => ({
    key: s.key,
    title: s.title,
    fields: s.rows.map((r) => {
      if (identity.has(r.label) && !includeIdentityNumbers) {
        return { label: r.label, value: redactedLabel };
      }
      if (notes.has(r.label)) return { label: r.label, value: r.value, note: true };
      if (phones.has(r.label)) return { label: r.label, value: documentPhone(r.value) };
      return { label: r.label, value: r.value };
    }),
  }));
}
