/**
 * ICE Alarm (KarmaCRM) CSV import — parsing and mapping.
 *
 * Replaces src/lib/crmImport.ts, which was written against KarmaCRM's *default*
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

export const SENSITIVE_PAYMENT_HEADERS = [
  "Credit Card Details",
  "20 Digit Bank No",
] as const;

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

  /** Value at a named column. `occurrence` disambiguates duplicate headers. */
  get(header: string, occurrence = 0): string {
    const positions = this.index.get(normaliseHeader(header));
    if (!positions || positions[occurrence] === undefined) return "";
    return clean(this.values[positions[occurrence]] ?? "");
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

  raw(): Record<string, string> {
    const out: Record<string, string> = {};
    this.headers.forEach((h, i) => {
      // Duplicate headers get a suffix so the archived raw row is lossless.
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
 * members.email is UNIQUE NOT NULL, and 48 addresses are shared across 106
 * rows (households). Plus-tagging keeps the address reachable by the family
 * while satisfying the constraint.
 */
export function householdEmail(email: string, tag: string): string {
  const [local, domain] = email.split("@");
  const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${local}+${slug}@${domain}`;
}

/* ------------------------------------------------------------------ *
 * Device identifiers
 * ------------------------------------------------------------------ */

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
  const l = label.toLowerCase();

  const planType: PlanType | null = /couple/.test(l)
    ? "couple"
    : /single/.test(l)
      ? "single"
      : null;

  const pay = clean(paymentType).toLowerCase();
  const billingFrequency: BillingFrequency | null = /annual|yearly/.test(l + " " + pay)
    ? "annual"
    : /month/.test(l + " " + pay)
      ? "monthly"
      : null;

  return { planType, billingFrequency, legacyLabel: label || null };
}

/* ------------------------------------------------------------------ *
 * Small normalisers
 * ------------------------------------------------------------------ */

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
  return SENSITIVE_PAYMENT_HEADERS.some((h) => /^foc\b/i.test(row.get(h)));
}

export function hasSensitivePaymentData(row: IceRow): boolean {
  return SENSITIVE_PAYMENT_HEADERS.some((h) => {
    const v = row.get(h);
    return Boolean(v) && !/^foc\b/i.test(v);
  });
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
  crmProfile: { stage: string | null; status: string | null; referral_source: string | null; assigned_label: string | null; tags: string[]; groups: string[] };
  notes: string | null;
  raw: Record<string, string>;
}

const nz = (v: string): string | null => (v ? v : null);

function parseGps(raw: string): { lat: number | null; lng: number | null } {
  const m = clean(raw).match(/(-?\d{1,3}\.\d+)[,;\s]+(-?\d{1,3}\.\d+)/);
  if (!m) return { lat: null, lng: null };
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { lat: null, lng: null };
  return { lat, lng };
}

export function mapIceRow(row: IceRow): MappedRow {
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

  const dob = parseIceDate(row.get("Birthday"));
  if (row.get("Birthday") && !dob) reviewReasons.push(`Unparseable birthday "${row.get("Birthday")}"`);

  const province = mapProvince(row.get("Home State"));
  if (province.review && province.province) reviewReasons.push(`Province "${province.province}" is not a Spanish province`);

  const gender = mapGender(row.get("Gender"));
  if (gender.review) reviewReasons.push(`Gender value needs review: "${row.get("Gender")}"`);

  const gps = parseGps(row.get("GPS Co-ordinates"));

  // House Number precedes the secondary street line: "Apt 12 - 3rd Floor".
  const line2 = [row.get("House Number"), row.get("Home Street 2")].filter(Boolean).join(", ");

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
    const name = row.get(`Contact ${n} - Name`);
    const tel = row.get(`Contact ${n} - Tel`);
    if (!name && !tel) continue;
    const phones = splitPhones(tel);
    contacts.push({
      contactName: name || "(name not recorded)",
      phone: phones.human[0] ?? null,
      // The CRM has no relationship column; the label often hides in the
      // member's phone field ("dad - lee"). Never invent one.
      relationship: "Unknown",
      priorityOrder: contacts.length + 1,
      contactType: "emergency",
    });
    if (!name) reviewReasons.push(`Emergency contact ${n} has a number but no name`);
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
    warnings.push("Row carries card/bank data — retained only in crm_import_rows.raw");
  }

  const keySafe = row.get("Key Safe");
  const funeralPlan = row.get("Funeral Plan");
  const funeralPolicy = row.get("Policy Number", 1);
  const wishes = row.get("Death Funeral Wishes");

  const postalStreet = row.get("Street");
  const hasPostal = Boolean(postalStreet || row.get("City/Town") || row.get("Postal Code"));

  const member: MappedRow["member"] = {
    first_name: firstName,
    last_name: lastName,
    email: allEmails[0] ?? null,
    phone: humanPhones[0] ?? null,
    date_of_birth: dob,
    status: status.memberStatus,
    address_line_1: nz(row.get("Home Street")),
    address_line_2: nz(line2),
    city: nz(row.get("Home City")),
    province: province.province,
    county: nz(row.get("Home County")),
    postal_code: nz(row.get("Home Postal Code")),
    country: "Spain",
    gps_lat: gps.lat,
    gps_lng: gps.lng,
    map_link: nz(row.get("Google Map Link")),
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
    raw: row.raw(),
  };
}

export function mapIceCsv(text: string): MappedRow[] {
  const { headers, rows } = parseCsv(text);
  return resolveHouseholdEmails(rows.map((values) => mapIceRow(new IceRow(headers, values))));
}

/**
 * members.email is UNIQUE NOT NULL and households share addresses — 48
 * addresses across 106 rows in the real export. Resolved here rather than in
 * the writer because it needs the whole batch: the first row to claim an
 * address keeps it, later rows get a plus-tag derived from their own name so
 * the mail still reaches the household.
 *
 * Deterministic on input order, so a re-run produces the same addresses and
 * the crm_source_id unique index does the rest.
 */
export function resolveHouseholdEmails(mapped: MappedRow[]): MappedRow[] {
  const claimed = new Set<string>();
  for (const row of mapped) {
    const email = row.member.email;
    if (!email || row.target !== "member") continue;
    if (!claimed.has(email)) {
      claimed.add(email);
      continue;
    }
    const tag = row.member.first_name || row.sourceId;
    let candidate = householdEmail(email, tag);
    if (claimed.has(candidate)) candidate = householdEmail(email, `${tag}${row.sourceId}`);
    row.member.email = candidate;
    claimed.add(candidate);
    row.warnings.push(
      `Shared household email ${email} — this record uses ${candidate} to satisfy the unique constraint`
    );
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
  };
}
