import { CONTACT_TYPES } from "@/lib/contactTypes";
import { MEDICAL_FIELDS } from "@/lib/medicalFields";

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

/** A date somebody reads, not an ISO string. Unparseable input contributes nothing. */
export function overviewDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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

const CONTACT_TYPE_LABEL = new Map<string, string>(
  CONTACT_TYPES.map((t) => [t.type, t.label.fallback]),
);

/**
 * Assemble the sheet.
 *
 * Section order is the order somebody reads it under pressure: who they are, where they are,
 * how to reach them, what is wrong with them, who else to call — then the commercial facts.
 */
export function buildMemberOverview(data: MemberOverviewData): OverviewSection[] {
  const m = data.member ?? {};
  const med = data.medical ?? {};

  const sections: Array<OverviewSection | null> = [
    section("identity", "Identity", [
      row("Name", [m.title, m.first_name, m.last_name].map(text).filter(Boolean).join(" ")),
      row("Known as", m.nickname),
      row("Date of birth", overviewDate(m.date_of_birth)),
      row("NIE / DNI", m.nie_dni),
      row("Passport", m.passport_number),
      row("Social security number", m.an_ss_number),
      row("Nationality", m.nationality),
      row("Gender", m.gender),
      row("Marital status", m.marital_status),
      row("Preferred language", m.preferred_language),
      row("Language notes", m.language_notes),
      // If it is set at all, nothing else on the sheet matters as much.
      row("Deceased", overviewDate(m.deceased_at)),
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
      row("Access notes", m.special_instructions),
      row("Away from", overviewDate(m.away_from)),
      row("Away until", overviewDate(m.away_until)),
    ]),

    section("contact", "Contact details", [
      row("Phone", m.phone),
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
      row("SIM number", data.device?.sim_phone_number),
      row("Status", data.device?.status),
      row("Online now", data.device?.is_online),
      row(
        "Battery",
        typeof data.device?.battery_level === "number" ? `${data.device.battery_level}%` : null,
      ),
      row("Last check-in", overviewDate(data.device?.last_checkin_at)),
      row("Tested with an operator", overviewDate(data.deviceTestedAt)),
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
      row("Next renewal", overviewDate(data.subscription?.renewal_date)),
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

/**
 * The sheet as plain text, for the Copy button.
 *
 * Plain text on purpose: it is pasted into a handover note, an email or a message to a
 * colleague, and every one of those mangles rich text differently.
 */
export function overviewAsText(sections: readonly OverviewSection[], heading?: string): string {
  const lines: string[] = [];
  if (heading) lines.push(heading, "=".repeat(heading.length), "");
  for (const s of sections) {
    lines.push(s.title.toUpperCase());
    for (const r of s.rows) lines.push(`  ${r.label}: ${r.value}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** How many facts the sheet holds — the dialog says so, because "we know 4 things" is a finding. */
export function overviewFactCount(sections: readonly OverviewSection[]): number {
  return sections.reduce((total, s) => total + s.rows.length, 0);
}

/**
 * Escaped for the print document. A member called `O'Brien & Sons <Ltd>` is not markup, and a
 * notes field is free text somebody typed — neither may become tags in the printout.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The sheet as a standalone print document.
 *
 * A SEPARATE DOCUMENT, not a print stylesheet over the dialog, because what needs printing is
 * the sheet — not the app chrome, the tabs behind it, or a scroll area clipped to its viewport.
 * Built here rather than in the component so the escaping above has a test.
 */
export function overviewAsPrintHtml(
  sections: readonly OverviewSection[],
  heading: string,
  footer?: string,
): string {
  const body = sections
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.title)}</h2><dl>` +
        s.rows
          .map((r) => `<dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd>`)
          .join("") +
        `</dl></section>`,
    )
    .join("");
  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    `<title>${escapeHtml(heading)}</title>`,
    "<style>",
    "body{font:12pt/1.45 system-ui,sans-serif;margin:24px;color:#111}",
    "h1{font-size:18pt;margin:0 0 4px}",
    "p.meta{margin:0 0 20px;color:#555;font-size:10pt}",
    // Sections must not be split across a page: half a medical record on the next sheet is how
    // the second half gets lost.
    "section{break-inside:avoid;margin:0 0 18px}",
    "h2{font-size:11pt;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #999;padding-bottom:3px;margin:0 0 8px}",
    "dl{display:grid;grid-template-columns:minmax(140px,32%) 1fr;gap:4px 16px;margin:0}",
    "dt{color:#555}dd{margin:0}",
    "</style></head><body>",
    `<h1>${escapeHtml(heading)}</h1>`,
    footer ? `<p class='meta'>${escapeHtml(footer)}</p>` : "",
    body,
    "</body></html>",
  ].join("");
}
