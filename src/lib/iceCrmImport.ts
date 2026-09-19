/**
 * ICE Alarm (KarmaCRM) CSV import — parsing and mapping.
 *
 * Replaced src/lib/crmImport.ts (deleted once the import page was wired to this
 * module), which was written against KarmaCRM's *default*
 * contact export and silently mangled the real ICE export (431 rows, 147
 * columns). See ICE_FIELD_MAPPING_SPEC_2026-09-02.md for the full field map;
 * the failures this module exists to fix, in the order they bite:
 *
 *  1. Duplicate header names. "Membership Type" appears three times and
 *     "Policy Number" twice. A row keyed by header name keeps the LAST
 *     occurrence, which throws away the good membership data (128 rows) in
 *     favour of an emptier column. Rows here are index-keyed.
 *  2. Embedded newlines. "Important Medical Info" contains real line breaks;
 *     the old line-based parser split one contact into three rows.
 *  3. Dates are DD/MM/YYYY. `new Date()` rejects 160 of 267 birthdays and
 *     silently misreads the other 107 as MM/DD. Parsed explicitly here.
 *  4. The old mapping read Street/City/Town/Postal Code/Region — the
 *     "Postal Address (If Different)" block — as the member's address. For a
 *     life-safety product that is the ambulance going to the wrong door.
 *  5. members.status was hardcoded 'active', so 199 Cancelled and 54 R.I.P.
 *     records would have become active members.
 *  6. Multi-value cells. 295 of 388 phone cells hold several numbers joined by
 *     ';', mixed with the pendant's own SIM number.
 *
 * Card and bank columns are never mapped. They stay in crm_import_rows.raw for
 * admin review, exactly as before — that behaviour was correct.
 */

/* ------------------------------------------------------------------ *
 * Payment columns: never mapped to a structured field
 * ------------------------------------------------------------------ */

import {
  deriveLegacySchedule,
  nextRenewalFrom,
  parseBillingDay,
} from "../../supabase/functions/_shared/legacy-billing-schedule";
import {
  billingFrequencyFromLabel,
  planTypeFromLabel,
} from "../../supabase/functions/_shared/legacy-plan";

export const SENSITIVE_PAYMENT_HEADERS = [
  "Credit Card Details",
  "20 Digit Bank No",
] as const;

/**
 * Columns whose VALUES must never leave this module — not into a mapped field, not into
 * `crm_import_rows.raw`, not into a preview, not into a log line.
 *
 * ONE COLUMN, and it is the card. 94 rows carry a real 16-digit PAN with an expiry date beside
 * it. Holding those would put this business under PCI-DSS and make every one of them
 * disclosable in a breach, and there is no need: Stripe and Mollie hold cards so this database
 * does not. Asked directly on 18 September 2026, Lee agreed they stay out.
 *
 * This list used to have four entries, and two of them were a mistake of mine that stood for a
 * week. When Lee said to strip the card column I swept up its neighbours with it:
 *   `Private Medical Details`  is not a medical record. It is about private health INSURANCE —
 *                              "he does not hold any private medical insurance due to his age".
 *                              28 rows, and `medical_information.private_insurer` was built for
 *                              them. Restored.
 *   `Death Funeral Wishes`     is the funeral director's name, telephone and address. 17 rows,
 *                              and `member_end_of_life.wishes` was built for them — that
 *                              migration's own comment counts them. When a member dies this is
 *                              who the office rings. Restored.
 * Both are sensitive, and both now go to admin-only tables rather than to a discard pile. See
 * ARCHIVE_EXCLUDED_HEADERS for what stops them landing somewhere less careful on the way.
 *
 * ENFORCEMENT IS AT THE ACCESSOR, not at each call site. `IceRow.get()` returns "" for these
 * headers, so a future mapping cannot pick one up by adding a line — the same reasoning as
 * golden rule 6, where Isabella's forbidden tools are unreachable in code rather than discouraged
 * in a prompt. Only PRESENCE is observable, via `redactedPresent()`.
 */
export const REDACTED_HEADERS = ["Credit Card Details"] as const;

/**
 * Readable, but only on purpose.
 *
 * `20 Digit Bank No` is an instruction to move somebody's money, and 85 rows have one. It is
 * also the only record of which account Santander debits for a legacy member, so discarding it
 * loses something the business actually needs — the opposite of the card column, where the
 * payment processor already holds the real copy.
 *
 * So it sits between the two: `get()` still refuses it, exactly as before, and the ONE mapping
 * that needs it asks for it by name through `restricted()`. The property that matters is
 * unchanged — no new mapping can pick this up by accident — while a deliberate, named, tested
 * call can. It never reaches `crm_import_rows.raw` either way.
 */
export const RESTRICTED_HEADERS = ["20 Digit Bank No"] as const;

/**
 * Readable by `get()`, never archived into `crm_import_rows.raw`.
 *
 * `raw` is a jsonb column on a table every staff role can read. These four have admin-only
 * homes — `member_access`, `member_end_of_life`, `member_bank_details`, `medical_information` —
 * and copying them into `raw` on the way past would hand to the whole call centre exactly what
 * those tables' policies were written to withhold. `Key Safe` is the sharpest of them: 96 rows,
 * each the code to the front door of an occupied home, and it has been going into `raw`
 * untouched since the first import.
 */
export const ARCHIVE_EXCLUDED_HEADERS = [
  "Key Safe",
  "Private Medical Details",
  "Death Funeral Wishes",
] as const;

const REDACTED_SET: ReadonlySet<string> = new Set(REDACTED_HEADERS.map(normaliseHeader));
const RESTRICTED_SET: ReadonlySet<string> = new Set(RESTRICTED_HEADERS.map(normaliseHeader));
/** Everything `raw()` leaves out: unreadable, restricted, and admin-only-homed alike. */
const NOT_ARCHIVED: ReadonlySet<string> = new Set([
  ...REDACTED_HEADERS,
  ...RESTRICTED_HEADERS,
  ...ARCHIVE_EXCLUDED_HEADERS,
].map(normaliseHeader));

/* ------------------------------------------------------------------ *
 * RFC 4180 CSV parser
 * ------------------------------------------------------------------ */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * A real CSV parser: quotes may contain commas, CRLF and bare newlines, and ""
 * is an escaped quote. The previous implementation split the file on newlines
 * before considering quoting, which is what shattered multiline records.
 */
export function parseCsv(text: string): ParsedCsv {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    // A trailing newline yields one empty field; that is not a record.
    if (!(record.length === 1 && record[0].trim() === "")) records.push(record);
    record = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRecord();
      i++;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || record.length > 0) endRecord();

  const [headerRow = [], ...rest] = records;
  return { headers: headerRow.map(normaliseHeader), rows: rest };
}

/**
 * Header names in the export carry stray whitespace: 'Allergies ',
 * 'Nationality ', 'Alarm Manufacturer ', and 'Contact  1 - Tel' with a double
 * space. Normalising once here means the field map can be written the way a
 * human reads the column.
 */
export function normaliseHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ *
 * Index-keyed row access
 * ------------------------------------------------------------------ */

export class IceRow {
  private index = new Map<string, number[]>();

  constructor(
    readonly headers: string[],
    readonly values: string[]
  ) {
    headers.forEach((h, i) => {
      const list = this.index.get(h);
      if (list) list.push(i);
      else this.index.set(h, [i]);
    });
  }

  /**
   * Value at a named column. `occurrence` disambiguates duplicate headers.
   *
   * Returns "" for a REDACTED_HEADERS column, whatever the file contains. That is the whole
   * enforcement: a mapping cannot leak card data by reading it, because reading it is not
   * possible through this accessor.
   */
  get(header: string, occurrence = 0): string {
    const normalised = normaliseHeader(header);
    if (REDACTED_SET.has(normalised) || RESTRICTED_SET.has(normalised)) return "";
    const positions = this.index.get(normalised);
    if (!positions || positions[occurrence] === undefined) return "";
    return clean(this.values[positions[occurrence]] ?? "");
  }

  /**
   * Whether a redacted column held anything — PRESENCE ONLY, never the value.
   *
   * This is what lets the batch summary say "94 rows had card data — discarded" without the
   * count itself becoming a way to read the number back.
   */
  redactedPresent(header: (typeof REDACTED_HEADERS)[number]): boolean {
    const positions = this.index.get(normaliseHeader(header)) ?? [];
    return positions.some((p) => clean(this.values[p] ?? "") !== "");
  }

  /**
   * A RESTRICTED_HEADERS value, asked for by name.
   *
   * The whole point is that this is not `get()`. A mapping cannot reach a bank account by
   * adding an ordinary line; it has to call this, with a header the type system already limits
   * to the restricted list, and that call site is named in the tests. Deliberate stays possible;
   * accidental does not.
   */
  restricted(header: (typeof RESTRICTED_HEADERS)[number], occurrence = 0): string {
    const positions = this.index.get(normaliseHeader(header));
    if (!positions || positions[occurrence] === undefined) return "";
    return clean(this.values[positions[occurrence]] ?? "");
  }

  /**
   * Whether a payment column begins with the free-of-charge marker. BOOLEAN ONLY.
   *
   * Real business data hides in a column we refuse to read: where a member pays nothing, the
   * card cell says "FOC" instead of a card number. Redacting the column removed the card data
   * and the FOC signal together, which the existing suite caught — `is_free_of_charge` went
   * false for a member who pays nothing, and billing them would have been the consequence.
   *
   * So the signal is recovered WITHOUT the value: this returns a boolean, matches only at the
   * start of the cell, and cannot be asked about any other token. A yes/no derived from a
   * redacted cell is not the redacted data; the cell's contents still never leave this class.
   */
  hasFreeOfChargeMarker(): boolean {
    return SENSITIVE_PAYMENT_HEADERS.some((h) => {
      const positions = this.index.get(normaliseHeader(h)) ?? [];
      return positions.some((p) => /^foc\b/i.test(clean(this.values[p] ?? "")));
    });
  }

  /**
   * What the card column says when it is not a card. TEXT WITHOUT DIGITS, or nothing.
   *
   * 11 of the 94 filled card cells hold no card at all — "Stripe", "Paid via Stripe", "Joined
   * through website", "to pay cash to Lee for the year", "See Roger Hawksworth". That is how a
   * member pays, and it is worth having. The other 83 are real PANs.
   *
   * The rule is deliberately crude: a cell is returned ONLY if it contains no run of two or
   * more digits anywhere. Not "strip the card number and keep the rest" — a regex that gets
   * that wrong leaves half a PAN in a notes field, and a rule that can be checked by reading
   * it is worth more here than one that recovers a few more rows. Measured against the real
   * export: the stricter rule keeps 11 rows and the permissive one 47, and of the 36 it gives
   * up exactly one is a billing instruction, for which `Monthly Payment Date` is the column.
   */
  paymentMethodHint(): string {
    const positions = this.index.get(normaliseHeader("Credit Card Details")) ?? [];
    for (const p of positions) {
      const value = clean(this.values[p] ?? "");
      if (value && !/\d{2,}/.test(value)) return value;
    }
    return "";
  }

  /** Every value under a repeated header, in column order, blanks dropped. */
  getAll(header: string): string[] {
    const positions = this.index.get(normaliseHeader(header)) ?? [];
    return positions.map((p) => clean(this.values[p] ?? "")).filter(Boolean);
  }

  /** First non-empty value across a repeated header. */
  getFirst(header: string): string {
    return this.getAll(header)[0] ?? "";
  }

  /** Values from a numbered series, e.g. "Medical Condition" 1..5. */
  series(prefix: string, count: number): string[] {
    const out: string[] = [];
    for (let n = 1; n <= count; n++) {
      const v = this.get(`${prefix} ${n}`);
      if (v) out.push(v);
    }
    return out;
  }

  /**
   * The archived row for `crm_import_rows.raw`.
   *
   * Lossless EXCEPT for REDACTED_HEADERS, which are omitted entirely rather than blanked. An
   * empty string would still say "this person gave us their card number", and a key that is
   * present but empty is the kind of thing a later "restore the raw row" feature would happily
   * fill back in.
   */
  raw(): Record<string, string> {
    const out: Record<string, string> = {};
    this.headers.forEach((h, i) => {
      if (NOT_ARCHIVED.has(normaliseHeader(h))) return;
      // Duplicate headers get a suffix so the archived raw row stays lossless.
      const key = out[h] === undefined ? h : `${h} (${i})`;
      out[key] = this.values[i] ?? "";
    });
    return out;
  }
}

/**
 * Strip the invisible characters the export carries: non-breaking spaces and
 * LTR/RTL marks, both present in phone and IMEI values.
 */
export function clean(v: string): string {
  return v
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Returns an ISO date, or null. Never guesses: an unrecognised shape is a
 * review item, not a silently wrong date of birth.
 *
 * Accepts: YYYY-MM-DD · DD/MM/YYYY (the export's format) · D-Mon-YY
 * ('Created Date', e.g. 3-Jun-13). Two-digit years resolve to 19xx when they
 * would otherwise be in the future — these are dates of birth and legacy
 * record dates, never future dates.
 */
export function parseIceDate(input: string, today = new Date()): string | null {
  const v = clean(input);
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return valid(+iso[1], +iso[2], +iso[3]);

  const dmy = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (dmy) return valid(+dmy[3], +dmy[2], +dmy[1]);

  const dMonY = v.match(/^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{2}|\d{4})$/);
  if (dMonY) {
    const month = MONTHS[dMonY[2].toLowerCase()];
    if (!month) return null;
    let year = +dMonY[3];
    if (dMonY[3].length === 2) {
      year += 2000;
      if (year > today.getFullYear()) year -= 100;
    }
    return valid(year, month, +dMonY[1]);
  }
  return null;

  function valid(y: number, m: number, d: number): string | null {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      return null;
    }
    return `${y.toString().padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

/* ------------------------------------------------------------------ *
 * Phones
 * ------------------------------------------------------------------ */

export interface SplitPhones {
  /** Numbers belonging to a person. */
  human: string[];
  /** Pendant / device SIM numbers, which are not contact numbers. */
  deviceSim: string[];
}

/**
 * The +46 719 ... range in this data is the pendant's own M2M SIM, not a person.
 * Treating it as the member's phone number means an operator rings a pendant.
 */
const DEVICE_SIM = /^\+?46\s*719/;

export function splitPhones(raw: string): SplitPhones {
  const human: string[] = [];
  const deviceSim: string[] = [];
  for (const part of clean(raw).split(/[;/\n]+/)) {
    const p = clean(part);
    if (!p) continue;
    const normalised = normalisePhone(p);
    if (!normalised) continue;
    if (DEVICE_SIM.test(p.replace(/[^\d+]/g, "")) || DEVICE_SIM.test(normalised)) {
      deviceSim.push(normalised);
    } else {
      human.push(normalised);
    }
  }
  return { human: dedupe(human), deviceSim: dedupe(deviceSim) };
}

/** E.164 where it can be determined; Spanish mobiles/landlines assumed +34. */
export function normalisePhone(raw: string): string {
  let v = clean(raw).replace(/[^\d+]/g, "");
  if (!v) return "";
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!v.startsWith("+")) {
    // 9 digits beginning 6/7/8/9 is a Spanish national number.
    if (/^[6789]\d{8}$/.test(v)) v = `+34${v}`;
    else if (/^\d{6,}$/.test(v)) v = `+${v}`;
    else return "";
  }
  return /^\+\d{6,15}$/.test(v) ? v : "";
}

/* ------------------------------------------------------------------ *
 * Emails
 * ------------------------------------------------------------------ */

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]{2,}$/;

/** Splits multi-address cells and drops the placeholders ('no', 'tba', ...). */
export function splitEmails(raw: string): { valid: string[]; rejected: string[] } {
  const validOut: string[] = [];
  const rejected: string[] = [];
  for (const part of clean(raw).split(/[;,\s]+/)) {
    const e = clean(part).toLowerCase().replace(/^["']|["']$/g, "");
    if (!e) continue;
    if (EMAIL.test(e)) validOut.push(e);
    else rejected.push(e);
  }
  return { valid: dedupe(validOut), rejected: dedupe(rejected) };
}

/**
 * Whose address is this, when more than one member has it?
 *
 * The old answer was plus-tagging: `mary+john@example.com` for the second row to claim a shared
 * address, invented purely to satisfy `members.email UNIQUE NOT NULL`. It produced addresses
 * nobody reads, on the column the platform treats as the way to reach the member.
 *
 * Since 20260910170000 the column is nullable and the unique index is partial — only an address
 * the MEMBER owns has to be unique. So a shared address is stored verbatim, once per member,
 * marked `carer`: one daughter looking after both her parents is TWO members whose contact
 * address is hers, and that is not a duplicate. It is the normal case in this business.
 */
export type EmailOwner = "member" | "carer" | "payer" | "family";

/**
 * Words in the row's free text that say the address belongs to somebody else.
 *
 * Deliberately narrow. The cost of a false positive is small — a member's own address marked
 * `carer`, which loses them nothing but a login they can be given later — and the cost of a
 * false NEGATIVE is a carer's address treated as a login credential for a member who has never
 * seen it.
 */
const CARER_EMAIL_HINT =
  /\b(carer|carers|cuidador|cuidadora|daughter|son|hija|hijo|next of kin|nok|payer|pays|paid by|niece|nephew|sister|brother|hermana|hermano|neighbour|neighbor|vecina|vecino|power of attorney|poa)\b/i;

export function emailOwnerFromText(text: string): EmailOwner | null {
  return CARER_EMAIL_HINT.test(clean(text)) ? "carer" : null;
}

/* ------------------------------------------------------------------ *
 * Device identifiers
 * ------------------------------------------------------------------ */

/**
 * The CRM has no relationship column. It is written into the name, in brackets:
 * "Susan Smith (Sister in UK)", "Peter Smith (Son)".
 *
 * This used to hardcode "Unknown" for every contact, with the note "never invent one" — right
 * instinct, wrong conclusion. The relationship is not missing, it is just in the same cell as
 * the name, and an operator reading "Susan Smith — Unknown" beside a phone number is worse off
 * than one reading "Susan Smith — Sister in UK". Nothing is invented: the bracket contents are
 * taken verbatim, and "Other" is used only when there are no brackets at all.
 *
 * The brackets are stripped from the NAME too. Leaving them made the contact's name
 * "Susan Smith (Sister in UK)", which is what an operator would then read out loud.
 */
export function splitContactName(raw: string): { name: string; relationship: string } {
  const v = clean(raw);
  if (!v) return { name: "", relationship: "Other" };
  const m = v.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return { name: v, relationship: "Other" };
  const name = clean(m[1]);
  const relationship = clean(m[2]);
  // "(?)" or "()" tells us nothing; do not present it as a relationship.
  if (!relationship || /^[?-]+$/.test(relationship)) return { name: name || v, relationship: "Other" };
  return { name: name || v, relationship };
}

export interface DeviceIds {
  imei: string | null;
  dockingStationMac: string | null;
  /** Anything left over — prose like "SHARED WITH ..." — for devices.notes. */
  remainder: string | null;
}

/**
 * "IMEI: 865513074081908 DOCKING STATION: D3:2E:41:C6:79:71" and a dozen
 * other shapes. Only 65 of 130 values are a bare 15-digit IMEI.
 */
export function parseDeviceIds(raw: string): DeviceIds {
  const v = clean(raw);
  if (!v) return { imei: null, dockingStationMac: null, remainder: null };

  const mac = v.match(/([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/);
  const imei = v.replace(/([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/g, " ").match(/\b\d{15}\b/);

  let remainder = v;
  if (mac) remainder = remainder.replace(mac[0], " ");
  if (imei) remainder = remainder.replace(imei[0], " ");
  remainder = remainder
    .replace(/\b(imei|imie|docking\s*station|no?)\b/gi, " ")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Left-over punctuation ("N°", ":-") is noise, not a note. Only keep a
  // remainder that actually says something, e.g. "SHARED WITH JANICE LANNING".
  if (remainder.replace(/[^A-Za-z0-9]/g, "").length < 3) remainder = "";

  return {
    imei: imei ? imei[0] : null,
    dockingStationMac: mac ? mac[0].toUpperCase() : null,
    remainder: remainder || null,
  };
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export type MemberStatus = "active" | "inactive" | "suspended";
export type ImportTarget = "member" | "crm_contact" | "exclude";

export interface StatusMapping {
  target: ImportTarget;
  memberStatus: MemberStatus | null;
  deceased: boolean;
  /** True when the row needs a person to decide. */
  review: boolean;
}

/**
 * The single most dangerous field in the file. The previous importer wrote
 * status: 'active' for every row, which would have made 199 cancelled and 54
 * deceased people into active members with courtesy calls enabled.
 */
export function mapStatus(raw: string): StatusMapping {
  const s = clean(raw).toLowerCase().replace(/\.$/, "");

  switch (s) {
    case "active member":
    case "emergency response member":
    case "holiday lifeline":
      return { target: "member", memberStatus: "active", deceased: false, review: false };
    case "on hold":
      return { target: "member", memberStatus: "suspended", deceased: false, review: false };
    case "cancelled":
      return { target: "crm_contact", memberStatus: null, deceased: false, review: false };
    case "r.i.p":
    case "rip":
      return { target: "crm_contact", memberStatus: null, deceased: true, review: false };
    case "potential members":
    case "cold client":
    case "3rd party contact":
      return { target: "crm_contact", memberStatus: null, deceased: false, review: false };
    case "ice staff":
    case "maintenance for building":
      return { target: "exclude", memberStatus: null, deceased: false, review: false };
    default:
      // Includes blank. Never guess a status for a life-safety record.
      return { target: "crm_contact", memberStatus: null, deceased: false, review: true };
  }
}

/* ------------------------------------------------------------------ *
 * Membership
 * ------------------------------------------------------------------ */

export type PlanType = "single" | "couple";
export type BillingFrequency = "monthly" | "annual";

export interface MembershipMapping {
  planType: PlanType | null;
  billingFrequency: BillingFrequency | null;
  legacyLabel: string | null;
}

/**
 * "Membership Type" appears in three columns; the authoritative one is the
 * middle occurrence (128 populated rows). The first is junk numeric IDs, the
 * third holds Emergency Response tiers. We take the first non-empty value
 * across all three but ignore anything that is only digits.
 */
export function mapMembership(row: IceRow, paymentType: string): MembershipMapping {
  const candidates = row.getAll("Membership Type").filter((v) => !/^\d+$/.test(v));
  const label = candidates[0] ?? row.get("Purchased Package") ?? "";

  /*
    THE READERS LIVE IN `_shared/legacy-plan.ts`, not here, and that is not tidiness.

    The switch link reads this same Karma label years later to decide what to charge somebody
    (`send-payment-link`, legacy_switch mode). Two parsers for one label is how the import and
    the switch link end up disagreeing about whether a member is a couple, and the disagreement
    is about money.
  */
  const planType: PlanType | null = planTypeFromLabel(label);
  const billingFrequency: BillingFrequency | null = billingFrequencyFromLabel(label, paymentType);

  return { planType, billingFrequency, legacyLabel: label || null };
}

/* ------------------------------------------------------------------ *
 * Small normalisers
 * ------------------------------------------------------------------ */

/**
 * Yes, and nothing that merely resembles yes.
 *
 * Used for consent, so the bar is that the whole cell is one of these tokens. "yes if she is in"
 * is not a yes; nor is "no"; nor is a name. Spanish included because the file is Spanish —
 * `sí` with the accent and `si` without, since both are typed.
 */
const UNAMBIGUOUS_YES = new Set(["yes", "y", "si", "sí", "true", "1"]);

export function parseUnambiguousYes(raw: string): boolean {
  return UNAMBIGUOUS_YES.has(clean(raw).toLowerCase());
}

export function mapGender(raw: string): { gender: string | null; review: boolean } {
  const v = clean(raw).toLowerCase();
  if (!v) return { gender: null, review: false };
  if (/^fe?l?male$/.test(v) || v === "femaie") return { gender: "female", review: false };
  if (v === "male") return { gender: "male", review: false };
  if (v.startsWith("female")) return { gender: "female", review: true };
  if (v.startsWith("male")) return { gender: "male", review: true };
  return { gender: null, review: true };
}

const PROVINCES = [
  "Almería", "Málaga", "Granada", "Cádiz", "Sevilla", "Huelva", "Jaén", "Córdoba",
  "Alicante", "Valencia", "Castellón", "Murcia", "Barcelona", "Madrid",
  "Islas Baleares", "Las Palmas", "Santa Cruz de Tenerife",
];

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Canonicalises accents and casing; a town name is flagged, never silently kept. */
export function mapProvince(raw: string): { province: string | null; review: boolean } {
  const v = clean(raw);
  if (!v) return { province: null, review: false };
  const hit = PROVINCES.find((p) => strip(p) === strip(v));
  if (hit) return { province: hit, review: false };
  return { province: v, review: true };
}

/** 'FOC' hides inside the two payment columns we otherwise discard. */
export function detectFreeOfCharge(row: IceRow): boolean {
  // Was `row.get(h)`, which now returns "" because those columns are redacted. See
  // IceRow.hasFreeOfChargeMarker for why a boolean is safe where the value is not.
  return row.hasFreeOfChargeMarker();
}

export function hasSensitivePaymentData(row: IceRow): boolean {
  // Also had to move off `row.get()` when those columns became redacted — it silently returned
  // "" and the warning stopped firing, so a row carrying a card number reported nothing. The
  // existing suite caught it. Presence and the FOC marker are both booleans, which is all this
  // needs; "FOC" is a payment arrangement, not card data, so it does not count as sensitive.
  return (
    SENSITIVE_PAYMENT_HEADERS.some((h) =>
      row.redactedPresent(h as (typeof REDACTED_HEADERS)[number])
    ) && !row.hasFreeOfChargeMarker()
  );
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

export interface MappedContact {
  contactName: string;
  phone: string | null;
  relationship: string;
  priorityOrder: number;
  contactType: "emergency" | "key_holder";
}

export interface MappedRow {
  sourceId: string;
  target: ImportTarget;
  /** Set when target is 'member' and every NOT NULL column is satisfied. */
  memberReady: boolean;
  warnings: string[];
  reviewReasons: string[];

  member: {
    first_name: string;
    last_name: string;
    email: string | null;
    /** Whose address that is. Only `member` may become a login. */
    email_owner: EmailOwner;
    phone: string | null;
    date_of_birth: string | null;
    status: MemberStatus | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    province: string | null;
    county: string | null;
    postal_code: string | null;
    country: string;
    gps_lat: number | null;
    gps_lng: number | null;
    map_link: string | null;
    /** The home pin, from GPS or the map link. See mapIceRow. `null` when neither parses. */
    home_lat: number | null;
    home_lng: number | null;
    /**
     * When Santander takes this member's money — the day of the month, and the next date due.
     *
     * Derived by `deriveLegacySchedule` from `Monthly Payment Date` (monthly) or `Date Joined`
     * (annual), and NULL whenever the row does not clearly say. Null is a queue for a human, not
     * an error: a guessed debit date makes the switch link arrive on the wrong day, which either
     * charges a member twice in a month or misses their renewal entirely.
     */
    legacy_billing_day: number | null;
    legacy_next_renewal: string | null;
    /**
     * The monthly courtesy call, anchored to the day of the month they joined.
     *
     * Lee, 19 Sep 2026: "auto add a monthly courtesy call … against the date they joined."
     * `courtesy_calls_enabled` is true for every imported member; the DATE is null when the row
     * does not say when they joined, and that is a queue for a human in exactly the way the
     * billing day is. A call the rota promises on a day nobody chose is worse than no date.
     */
    courtesy_calls_enabled: boolean;
    next_courtesy_call_date: string | null;
    title: string | null;
    nickname: string | null;
    gender: string | null;
    nationality: string | null;
    marital_status: string | null;
    passport_number: string | null;
    an_ss_number: string | null;
    nie_dni: string | null;
    consent_state: string | null;
    deceased_at: string | null;
    language_notes: string | null;
    special_instructions: string | null;
    crm_source: string;
    crm_source_id: string;
    crm_created_at: string | null;
  };
  medical: {
    medical_conditions: string[];
    medications: string[];
    allergies: string[];
    blood_type: string | null;
    doctor_name: string | null;
    doctor_phone: string | null;
    doctor_location: string | null;
    hospital_preference: string | null;
    mobility: string | null;
    hearing_notes: string | null;
    vision_notes: string | null;
    meds_location: string | null;
    meds_notes: string | null;
    private_insurer: string | null;
    private_policy_number: string | null;
    additional_notes: string | null;
  } | null;
  contacts: MappedContact[];
  extraEmails: string[];
  extraPhones: string[];
  device: { imei: string; docking_station_mac: string | null; sim_phone_number: string | null; device_type: string | null; manufacturer: string | null; unit_type: string | null; notes: string | null } | null;
  subscription: {
    plan_type: PlanType | null;
    billing_frequency: BillingFrequency | null;
    legacy_membership_label: string | null;
    start_date: string | null;
    has_pendant: boolean;
    amount: number | null;
    payment_arrangement: string | null;
    monthly_payment_date: string | null;
    arrears_note: string | null;
    is_free_of_charge: boolean;
  } | null;
  postalAddress: { address_type: "postal"; address_line_1: string | null; city: string | null; province: string | null; postal_code: string | null } | null;
  access: { key_safe_location: string | null; key_safe_code: string | null } | null;
  endOfLife: { funeral_plan: string | null; policy_number: string | null; wishes: string | null } | null;
  /** The legacy direct-debit account. Admin-only in the platform — see member_bank_details. */
  bank: { iban: string | null; bank_name: string | null; source_text: string } | null;
  /** How this member pays, when the card column said so in words rather than in digits. */
  paymentMethod: string | null;
  crmProfile: { stage: string | null; status: string | null; referral_source: string | null; assigned_label: string | null; tags: string[]; groups: string[] };
  /**
   * Which redacted columns this row HELD — names only, never values (REDACTED_HEADERS).
   *
   * Recorded so the batch summary can tell Lee "94 rows had card data — discarded" and he can
   * believe it. A silent strip and a column that was simply empty look identical afterwards,
   * and the difference matters: one means the data was thrown away on purpose, the other means
   * it was never there.
   */
  discardedSensitive: string[];
  notes: string | null;
  /** `Spouse`, verbatim. A couple-plan hint for a human, not a second member. */
  spouse: string | null;
  /**
   * True only when `Contact Friend for Email` is an unambiguous yes.
   *
   * Deliberately a boolean rather than a tri-state: "not yes" and "empty" lead to the same
   * place — no consent row is written — and a third state would invite somebody to treat
   * "present but unreadable" as a weaker yes.
   */
  emailContactConsent: boolean;
  raw: Record<string, string>;
}

const nz = (v: string): string | null => (v ? v : null);

/**
 * THE ONE COORDINATE PARSER, exported because a second one is how two importers come to
 * disagree about the same cell.
 *
 * It takes the first pair of decimal numbers it can find, which is what makes it work on both
 * of the shapes the KarmaCRM export actually holds:
 *   "37.3886, -2.1487"                         the GPS Co-ordinates column (108 rows)
 *   "https://maps.google.com/…@37.3886,-2.1487,17z"   the Google Map Link column (90 rows)
 */
/**
 * A "20 Digit Bank No" cell, which is rarely twenty digits and rarely only a number.
 *
 * A typical one reads "<bank name> IBAN ES.. .... .... .... visa <account holder> ...". 57 of
 * the 85 filled cells contain a parseable Spanish IBAN; the rest are a bank name, a sort-code
 * fragment, or "FOC". So the IBAN is lifted where there is one and the cell is kept verbatim
 * either way — the original is what settles an argument once karmaCRM is switched off.
 *
 * The IBAN is normalised to unspaced upper case, because the same account appears in the export
 * spaced three different ways and two copies of one account is worse than none.
 */
export function parseBankCell(raw: string): { iban: string | null; bank_name: string | null; source_text: string } {
  const text = clean(raw);
  if (!text) return { iban: null, bank_name: null, source_text: "" };

  const match = text.replace(/[-.]/g, " ").match(/\bES\s?\d{2}(?:\s?\d{4}){5}\b/i);
  const iban = match ? match[0].replace(/\s+/g, "").toUpperCase() : null;

  /* Whatever precedes the word IBAN, or the first word, is the bank as often as not. It is a
     convenience for reading the list, never something to bank against — `source_text` is. */
  const before = text.split(/\bIBAN\b/i)[0];
  const bankName = clean(before).replace(/[,;:]+$/, "");

  return {
    iban,
    bank_name: bankName && bankName.length <= 60 && !/\d{4,}/.test(bankName) ? bankName : null,
    source_text: text,
  };
}

export function parseGps(raw: string): { lat: number | null; lng: number | null } {
  const m = clean(raw).match(/(-?\d{1,3}\.\d+)[,;\s]+(-?\d{1,3}\.\d+)/);
  if (!m) return { lat: null, lng: null };
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { lat: null, lng: null };
  return { lat, lng };
}

/**
 * IS THIS PAIR PLAUSIBLY IN SPAIN?
 *
 * The box is generous on purpose — the Canaries are 1,800 km from Girona, and this business
 * sells on the Costa del Sol and in Almería. Its job is not geography but ARITHMETIC SANITY: a
 * Google Maps URL is full of numbers, and "the first decimal pair" occasionally finds a zoom
 * level, a place id fragment or a timestamp. A pair from a URL that lands in the Atlantic is a
 * parse accident, and storing it as somebody's front door would put a confident pin on the SOS
 * card for a house that is not there.
 *
 * Applied ONLY to what becomes `home_lat`/`home_lng`. `gps_lat`/`gps_lng` keep the verbatim
 * value they have always had — narrowing a column somebody may already be reading is a separate
 * decision from what this feature writes.
 */
export function isPlausiblySpain(lat: number, lng: number): boolean {
  return lat >= 27 && lat <= 44.5 && lng >= -19 && lng <= 5;
}

export function mapIceRow(row: IceRow, today: Date = new Date()): MappedRow {
  const warnings: string[] = [];
  const reviewReasons: string[] = [];

  const status = mapStatus(row.get("Status"));
  if (status.review) reviewReasons.push(`Unrecognised status "${row.get("Status")}"`);

  const firstName = row.get("First Name");
  const lastName = row.get("Last Name");

  // Emails: work, then home, then other.
  const emailCells = ["Email (w)", "Email (h)", "Email (o)"].map((h) => splitEmails(row.get(h)));
  const allEmails = dedupe(emailCells.flatMap((e) => e.valid));
  const rejectedEmails = dedupe(emailCells.flatMap((e) => e.rejected));
  if (rejectedEmails.length) warnings.push(`Discarded non-email value(s): ${rejectedEmails.join(", ")}`);

  // Phones: main, work, home.
  const phoneCells = ["Phone (m)", "Phone (w)", "Phone (h)"].map((h) => splitPhones(row.get(h)));
  const humanPhones = dedupe(phoneCells.flatMap((p) => p.human));
  const simPhones = dedupe(phoneCells.flatMap((p) => p.deviceSim));

  /* `Birthday` first, `Dob` as the fallback — Lee's ruling on the second date-of-birth column.
     Both go through the same parser, so an ambiguous value is still rejected rather than guessed
     in either column. The fallback is only reached when Birthday is BLANK, never when Birthday
     holds something the parser refused: a value we could not read is a value to look at, not a
     reason to quietly prefer the other column. */
  const dob = parseIceDate(row.get("Birthday")) ?? (row.get("Birthday") ? null : parseIceDate(row.get("Dob")));
  if (row.get("Birthday") && !dob) reviewReasons.push(`Unparseable birthday "${row.get("Birthday")}"`);
  if (!row.get("Birthday") && row.get("Dob") && !dob) {
    reviewReasons.push(`Unparseable Dob "${row.get("Dob")}" (Birthday was empty)`);
  }

  const province = mapProvince(row.get("Home State"));
  if (province.review && province.province) reviewReasons.push(`Province "${province.province}" is not a Spanish province`);

  const gender = mapGender(row.get("Gender"));
  if (gender.review) reviewReasons.push(`Gender value needs review: "${row.get("Gender")}"`);

  const gps = parseGps(row.get("GPS Co-ordinates"));

  /*
    THE HOME PIN, from whichever of the two columns can produce one.
    `GPS Co-ordinates` first — it is the authored value. Then `Google Map Link`, through the SAME
    parser: 90 rows have a link and no coordinates, and a link that names a point is the same
    fact written differently.

    SOURCE IS 'imported', NEVER 'member_pin'. Nobody asked the member, so the SOS card must say
    "from our records — not confirmed by the member". `home_location_set_at` stays NULL for the
    same reason: the import knows when IT ran, which is not when anybody stood at that door.
  */
  let homeLat: number | null = null;
  let homeLng: number | null = null;
  if (gps.lat !== null && gps.lng !== null && isPlausiblySpain(gps.lat, gps.lng)) {
    homeLat = gps.lat;
    homeLng = gps.lng;
  } else {
    /*
      DECODED FIRST, because the value is a URL and not a coordinate cell. `?q=37.3886%2C-2.1487`
      is a perfectly ordinary Google Maps link and the parser looks for a real separator between
      the two numbers, so without this it reads as no coordinate at all. Decoding is applied
      HERE and not inside `parseGps`: the GPS Co-ordinates column is not a URL, and widening a
      parser two goals share is not something to do as a side effect.
    */
    const link = row.get("Google Map Link");
    let decoded = link;
    try {
      decoded = decodeURIComponent(link);
    } catch {
      // A stray % in a hand-typed cell throws. The raw value is still worth a try.
      decoded = link;
    }
    const fromLink = parseGps(decoded);
    if (fromLink.lat !== null && fromLink.lng !== null && isPlausiblySpain(fromLink.lat, fromLink.lng)) {
      homeLat = fromLink.lat;
      homeLng = fromLink.lng;
      warnings.push("Home location taken from the Google Map Link — no GPS co-ordinates on this row");
    }
  }
  if (gps.lat !== null && gps.lng !== null && homeLat === null) {
    warnings.push(
      `GPS co-ordinates ${gps.lat}, ${gps.lng} are outside Spain — kept verbatim, NOT used as a home location`,
    );
  }

  /* House Number belongs on LINE 1, in front of the street.
     It was on line 2 with the note that it holds things like "Apt 12 - 3rd Floor". Lee's
     measurement of the real file says House Number + Home Street is the first line of the
     address, and he has read the 431 rows. An ambulance is given line 1; a house number sitting
     on line 2 is a number the driver may never see. Where the value really is an apartment
     descriptor, "Apt 12 - 3rd Floor Calle X" still reads correctly as a first line. */
  const line2 = row.get("Home Street 2");

  const medicalInfo = row.get("Important Medical Info");
  const criticalInfo = row.get("Critical Info");
  const specialInstructions = [medicalInfo, criticalInfo].filter(Boolean).join("\n\n") || "";
  if (medicalInfo) {
    reviewReasons.push("Important Medical Info imported verbatim — split instruction from history");
  }

  const conditions = row.series("Medical Condition", 5);
  const medications = row.series("Meds Usage", 6);
  const allergies = clean(row.get("Allergies"))
    .split(/[;,\n]+/)
    .map(clean)
    .filter(Boolean);

  const contacts: MappedContact[] = [];
  for (const n of [1, 2, 3]) {
    const rawName = row.get(`Contact ${n} - Name`);
    const tel = row.get(`Contact ${n} - Tel`);
    if (!rawName && !tel) continue;
    const phones = splitPhones(tel);
    const { name, relationship } = splitContactName(rawName);
    contacts.push({
      contactName: name || "(name not recorded)",
      phone: phones.human[0] ?? null,
      relationship,
      priorityOrder: contacts.length + 1,
      contactType: "emergency",
    });
    if (!rawName) reviewReasons.push(`Emergency contact ${n} has a number but no name`);
  }
  const keyHolderName = row.get("Key Holder 1 - Name");
  const keyHolderTel = row.get("Key Holder 1 - Tel");
  if (keyHolderName || keyHolderTel) {
    contacts.push({
      contactName: keyHolderName || "(name not recorded)",
      phone: splitPhones(keyHolderTel).human[0] ?? null,
      relationship: "Key holder",
      priorityOrder: contacts.length + 1,
      contactType: "key_holder",
    });
  }

  const ids = parseDeviceIds(row.get("Pendant IMEI"));
  if (row.get("Pendant IMEI") && !ids.imei) {
    reviewReasons.push(`Pendant IMEI field holds no 15-digit IMEI: "${row.get("Pendant IMEI")}"`);
  }

  const membership = mapMembership(row, row.get("Payment Type"));
  const joinDate =
    parseIceDate(row.get("Date Joined")) ?? parseIceDate(row.get("Joined Date")) ?? null;
  const monthlyFee = row.get("Monthly Fee").replace(/[^0-9.]/g, "");

  if (hasSensitivePaymentData(row)) {
    // The message used to say "retained only in crm_import_rows.raw". That is no longer true and
    // a warning that misdescribes what happened is worse than none: an admin reading it would
    // go looking for the data.
    warnings.push("Row carried card/bank data — DISCARDED, not stored anywhere");
  }

  const keySafe = row.get("Key Safe");
  const funeralPlan = row.get("Funeral Plan");
  const funeralPolicy = row.get("Policy Number", 1);
  /* Restored 18 Sep 2026. This column is the funeral director's name, telephone and address —
     who the office rings when a member dies — and `member_end_of_life.wishes` was built for it;
     that migration's comment even counts the 17 rows. It was only ever blank because it got
     swept into the card redaction. It is still kept out of `crm_import_rows.raw`, because the
     table it lands in is admin-only and the archive is not. */
  const wishes = row.get("Death Funeral Wishes");

  const postalStreet = row.get("Street");
  const hasPostal = Boolean(postalStreet || row.get("City/Town") || row.get("Postal Code"));

  /*
    THE SANTANDER DATE, computed once and read by both the member row and the preview.

    `membership` already knows whether Karma billed this person monthly or annually, and the two
    read DIFFERENT columns: a monthly member's day comes from `Monthly Payment Date`, an annual
    member's from the anniversary of `Date Joined`. Reading `Monthly Payment Date` for an annual
    member — a column that sometimes holds a stray value for them — would produce a monthly
    schedule for somebody who pays once a year, and the runner would write to them eleven months
    early.
  */
  /*
    THE FIRST COURTESY CALL, ANCHORED TO THE DAY THEY JOINED — Lee's rule, 19 Sep 2026: "auto
    add a monthly courtesy call … against the date they joined".

    `courtesy_calls_enabled` and `next_courtesy_call_date` have existed since 20260126094603 and
    the import has never written either, so every migrated member arrived with no call ever due.
    `CourtesyCallsCard` reads them; the rota had nothing to show.

    ANCHORED TO THE JOIN DATE rather than to the import, so the rota is spread across the month
    the way the membership is rather than bunched on whichever afternoon somebody pressed Import
    — and so a member's call day is a fact about them, not about us. Same day of the month as
    the billing day in the ordinary case, which is also how the office has always worked.

    NULL WHEN NOTHING SAYS WHEN THEY JOINED, for the same reason the billing day is: a date
    invented here is a call the rota promises and nobody planned. The row is flagged instead.
    `courtesy_calls_enabled` is still true — they are a member, and the missing part is the
    schedule, not the intention.
  */
  const courtesyDay = joinDate ? parseBillingDay(joinDate) : null;
  /* `nextRenewalFrom` and not a second implementation: "the next occurrence of this day of the
     month, on or after today, clamped at month end" is exactly the same question the billing
     day asks, and the 31st-in-February case is exactly as easy to get wrong here. The schedule
     module's header says in as many words that a second copy of the clamp is the thing to
     avoid; a courtesy call is a different subject, not a different rule. */
  const nextCourtesyCall = courtesyDay !== null ? nextRenewalFrom(courtesyDay, today) : null;

  const legacySchedule = deriveLegacySchedule(
    {
      monthlyPaymentDate: row.get("Monthly Payment Date") || null,
      startDate: joinDate,
      billingFrequency: membership.billingFrequency,
    },
    today,
  );

  /* The one restricted read in the whole mapper. See RESTRICTED_HEADERS: `get()` still refuses
     this column, so nothing can pick it up by accident, and this line is named in the tests. */
  const bank = parseBankCell(row.restricted("20 Digit Bank No"));

  const member: MappedRow["member"] = {
    first_name: firstName,
    last_name: lastName,
    email: allEmails[0] ?? null,
    // Default; `resolveSharedEmails` downgrades it once the whole batch is known.
    email_owner: "member",
    phone: humanPhones[0] ?? null,
    date_of_birth: dob,
    status: status.memberStatus,
    address_line_1: nz([row.get("House Number"), row.get("Home Street")].filter(Boolean).join(" ")),
    address_line_2: nz(line2),
    city: nz(row.get("Home City")),
    province: province.province,
    county: nz(row.get("Home County")),
    postal_code: nz(row.get("Home Postal Code")),
    country: "Spain",
    gps_lat: gps.lat,
    gps_lng: gps.lng,
    map_link: nz(row.get("Google Map Link")),
    home_lat: homeLat,
    home_lng: homeLng,
    legacy_billing_day: legacySchedule.day,
    legacy_next_renewal: legacySchedule.nextRenewal,
    courtesy_calls_enabled: true,
    next_courtesy_call_date: nextCourtesyCall,
    title: nz(row.get("Title")),
    nickname: nz(row.get("Nickname")),
    gender: gender.gender,
    nationality: nz(row.get("Nationality")),
    marital_status: nz(row.get("Marital Status")),
    passport_number: nz(row.get("Passport")),
    an_ss_number: nz(row.get("AN/SS Number")),
    nie_dni: nz(row.get("NIE Number")),
    consent_state: nz(row.get("Permission State")),
    deceased_at: status.deceased ? (parseIceDate(row.get("Updated at")) ?? null) : null,
    language_notes: nz(row.get("Languages Spoken")),
    special_instructions: nz(specialInstructions),
    crm_source: "karmacrm",
    crm_source_id: row.get("id"),
    crm_created_at: parseIceDate(row.get("Created at")),
  };

  // members NOT NULL: first_name, last_name, email, phone, date_of_birth,
  // address_line_1, city, province, postal_code.
  const missing: string[] = [];
  if (!member.first_name) missing.push("first_name");
  if (!member.last_name) missing.push("last_name");
  if (!member.email) missing.push("email");
  if (!member.phone) missing.push("phone");
  if (!member.date_of_birth) missing.push("date_of_birth");
  if (!member.address_line_1) missing.push("address_line_1");
  if (!member.city) missing.push("city");
  if (!member.province) missing.push("province");
  if (!member.postal_code) missing.push("postal_code");

  const wantsMember = status.target === "member";
  const memberReady = wantsMember && missing.length === 0;
  if (wantsMember && missing.length) {
    reviewReasons.push(`Live member missing required field(s): ${missing.join(", ")}`);
  }

  /* Flagged rather than guessed at — Lee's ruling, 19 Sep 2026. A debit date invented here is
     real money taken on a day nobody chose, or a collection missed. The office fills these in
     from the bank statement, and this is the list they work from. */
  if (status.target === "member" && legacySchedule.day === null) {
    reviewReasons.push(
      "No collection date: neither Monthly Payment Date nor Date Joined says when money is taken"
    );
  }
  if (status.target === "member" && nextCourtesyCall === null) {
    reviewReasons.push("No courtesy call date: Date Joined is empty, so there is no day to anchor to");
  }

  const hasMedical =
    conditions.length > 0 ||
    medications.length > 0 ||
    allergies.length > 0 ||
    Boolean(
      row.get("Blood Group") || row.get("Doctors Name") || row.get("Medical Centre") ||
      row.get("Mobility") || row.get("Hearing Problems") || medicalInfo
    );

  return {
    sourceId: row.get("id"),
    target: status.target,
    memberReady,
    warnings,
    reviewReasons,
    member,
    medical: hasMedical
      ? {
          medical_conditions: conditions,
          medications,
          allergies,
          blood_type: nz(row.get("Blood Group")),
          doctor_name: nz(row.get("Doctors Name")),
          doctor_phone: splitPhones(row.get("Doctors Number")).human[0] ?? null,
          doctor_location: nz(row.get("Location")),
          hospital_preference: nz(row.get("Medical Centre")),
          mobility: nz(row.get("Mobility")),
          hearing_notes: nz(row.get("Hearing Problems")),
          vision_notes: nz(row.get("Glasses")),
          meds_location: nz(row.get("Meds Location")),
          meds_notes: nz(row.get("Meds Notes")),
          // "Private Medical Details" is redacted (see REDACTED_HEADERS), so the insurer's name
          // is no longer imported. Its policy number below still is — they were separate columns.
          /* Restored 18 Sep 2026. This column is about private health INSURANCE, not about a
             medical record — "he does not hold any private medical insurance due to his age" —
             and it was only ever null because it got swept into the card redaction. */
          private_insurer: nz(row.get("Private Medical Details")),
          private_policy_number: nz(row.get("Policy Number", 0)),
          additional_notes: nz(specialInstructions),
        }
      : null,
    contacts,
    extraEmails: allEmails.slice(1),
    extraPhones: humanPhones.slice(1),
    device: ids.imei
      ? {
          imei: ids.imei,
          docking_station_mac: ids.dockingStationMac,
          sim_phone_number: simPhones[0] ?? null,
          device_type: nz(row.get("Watch or Pendant") || row.get("Alarm Type")),
          manufacturer: nz(row.get("Alarm Manufacturer")),
          unit_type: nz(row.get("Unit Type")),
          notes: ids.remainder,
        }
      : null,
    subscription:
      membership.legacyLabel || joinDate || row.get("Personal Pendant")
        ? {
            plan_type: membership.planType,
            billing_frequency: membership.billingFrequency,
            legacy_membership_label: membership.legacyLabel,
            start_date: joinDate,
            has_pendant: /^yes$/i.test(row.get("Personal Pendant")),
            amount: monthlyFee ? Number(monthlyFee) : null,
            payment_arrangement: nz(row.get("DD or TVP")),
            monthly_payment_date: nz(row.get("Monthly Payment Date")),
            arrears_note: nz(row.get("Debt or TVP")),
            is_free_of_charge: detectFreeOfCharge(row),
          }
        : null,
    postalAddress: hasPostal
      ? {
          address_type: "postal",
          address_line_1: nz([postalStreet, row.get("Street 2")].filter(Boolean).join(", ")),
          city: nz(row.get("City/Town")),
          province: mapProvince(row.get("Region")).province,
          postal_code: nz(row.get("Postal Code")),
        }
      : null,
    access: keySafe ? { key_safe_location: null, key_safe_code: keySafe } : null,
    bank: bank.source_text ? bank : null,
    paymentMethod: nz(row.paymentMethodHint()),
    endOfLife:
      funeralPlan || funeralPolicy || wishes
        ? { funeral_plan: nz(funeralPlan), policy_number: nz(funeralPolicy), wishes: nz(wishes) }
        : null,
    crmProfile: {
      stage: nz(row.get("Stage")),
      status: nz(row.get("Status")),
      referral_source: nz(row.get("Referral Source")),
      assigned_label: nz(row.get("Assigned")),
      tags: clean(row.get("Tags")).split(/[;,]+/).map(clean).filter(Boolean),
      groups: clean(row.get("Groups")).split(/[;,]+/).map(clean).filter(Boolean),
    },
    notes: nz(row.get("Recent notes") || row.get("Notes")),
    /* Spouse is a COUPLE-PLAN HINT and nothing more (Lee's ruling): a name in a note, never a
       second member and never an emergency contact. Inventing a member from it would create a
       person nobody has spoken to, with no address of their own and no pendant. */
    spouse: nz(row.get("Spouse")),
    /* `Contact Friend for Email` set to an unambiguous yes, and only that. Anything else — a
       name, a note, "maybe", a blank — is NOT consent, and the raw value stays in
       `crm_import_rows.raw` for a human to read. Consent recorded on a guess is worse than no
       consent recorded: it is a defence nobody can stand behind later. */
    emailContactConsent: parseUnambiguousYes(row.get("Contact Friend for Email")),
    discardedSensitive: REDACTED_HEADERS.filter((h) => row.redactedPresent(h)),
    raw: row.raw(),
  };
}

export function mapIceCsv(text: string, today: Date = new Date()): MappedRow[] {
  const { headers, rows } = parseCsv(text);
  return resolveSharedEmails(
    rows.map((values) => mapIceRow(new IceRow(headers, values), today)),
  );
}

/**
 * MARK a shared address rather than MANGLE it.
 *
 * Needs the whole batch, which is why it is here and not in the mapper: "does anybody else in
 * this file have this address" is not a question one row can answer. Every row holding an
 * address that appears more than once is marked `carer` — INCLUDING THE FIRST. The first row to
 * appear is not more entitled to it; if two members share an address, it is nobody's login.
 *
 * A row whose own free text names a carer, a daughter, a payer is marked `carer` too, even when
 * the address is unique in the file. `emailOwnerFromText` is the rule.
 *
 * Nothing is ever blocked by this. An address that cannot be a login is still an address to
 * write to, and the member is still a member — which is the whole of Lee's ruling on item 3.
 */
export function resolveSharedEmails(mapped: MappedRow[]): MappedRow[] {
  const seen = new Map<string, number>();
  for (const row of mapped) {
    const email = row.member.email;
    if (!email) continue;
    const key = email.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  for (const row of mapped) {
    const email = row.member.email;
    if (!email) continue;
    const shared = (seen.get(email.toLowerCase()) ?? 0) > 1;
    /* The row's own words, checked against the notes and the raw email cells — "daughter's
       email", "pays for mum". `notes` is where Karma's free text lands. */
    const fromText = emailOwnerFromText(
      [row.notes ?? "", row.member.special_instructions ?? ""].join(" ")
    );

    if (shared) {
      row.member.email_owner = "carer";
      row.warnings.push(
        `Email ${email} appears on more than one row — stored as a carer address, not a login`
      );
    } else if (fromText) {
      row.member.email_owner = fromText;
      row.warnings.push(
        `Email ${email} is described as somebody else's in this row's notes — stored as a carer address, not a login`
      );
    }
  }
  return mapped;
}

export interface ImportSummary {
  total: number;
  members: number;
  membersNotReady: number;
  crmContacts: number;
  excluded: number;
  deceased: number;
  needingReview: number;
  /**
   * Rows that held each redacted column, by column name. Counts only — the values are
   * unreachable by the time a MappedRow exists.
   */
  discardedSensitive: Record<string, number>;
}

export function summarise(mapped: MappedRow[]): ImportSummary {
  return {
    total: mapped.length,
    members: mapped.filter((m) => m.target === "member" && m.memberReady).length,
    membersNotReady: mapped.filter((m) => m.target === "member" && !m.memberReady).length,
    crmContacts: mapped.filter((m) => m.target === "crm_contact").length,
    excluded: mapped.filter((m) => m.target === "exclude").length,
    deceased: mapped.filter((m) => m.member.deceased_at !== null).length,
    needingReview: mapped.filter((m) => m.reviewReasons.length > 0).length,
    discardedSensitive: Object.fromEntries(
      REDACTED_HEADERS.map((h) => [h, mapped.filter((m) => m.discardedSensitive.includes(h)).length])
        // A column no row carried is not news; only report what was actually discarded.
        .filter(([, n]) => (n as number) > 0)
    ),
  };
}
