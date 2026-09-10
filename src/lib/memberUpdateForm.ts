import {
  MEMBER_REQUIRED_FIELDS,
  REQUIRED_GROUPS,
  requiredFieldByKey,
  type RequiredField,
  type RequiredGroup,
} from "@/lib/memberRequiredFields";

/**
 * THE MEMBER'S SIDE OF THE MISSING-INFO LINK — every field we can ask for, rendered.
 *
 * WHAT WAS WRONG. `MemberUpdatePage` understood NINE tokens: `nie_dni`, six medical fields and
 * two contact ones. `memberRequiredFields.ts` names twenty-one required items, eighteen of
 * which a member can supply. So a staff member could tick "date of birth" or "postal code",
 * the token would faithfully record the request — and the member would open the link to a page
 * that did not mention it. The request looked sent, the field stayed empty, and nobody found
 * out until the next time somebody looked at the record.
 *
 * THE PAGE IS NOW DRIVEN FROM THE LIST. Every requestable field has an entry here saying which
 * table it lands in and what control it needs, and the ratchet at the bottom stops the build if
 * a new required field is added without one. That is the whole point: a form hand-written
 * against nine hard-coded keys can sit nine-of-eighteen for months, and it did.
 */

export type UpdateControl =
  /** One line. */
  | "text"
  | "date"
  | "tel"
  | "email"
  /** The eight blood groups. */
  | "bloodType"
  /** A string[] column, typed as a comma-separated line. */
  | "list"
  /** The contact editor — not a field at all, but a repeated block. */
  | "contacts";

/** Where a value lands. `contacts` is written from the contact editor, not from a column. */
export type UpdateTarget = "member" | "medical" | "contacts";

export interface UpdateFormField {
  key: string;
  target: UpdateTarget;
  control: UpdateControl;
  /** The column written, for `member` and `medical`. Null for the contact editor. */
  column: string | null;
  field: RequiredField;
}

const SPEC: Record<string, { target: UpdateTarget; control: UpdateControl; column: string | null }> =
  {
    first_name: { target: "member", control: "text", column: "first_name" },
    last_name: { target: "member", control: "text", column: "last_name" },
    date_of_birth: { target: "member", control: "date", column: "date_of_birth" },
    nie_dni: { target: "member", control: "text", column: "nie_dni" },
    address_line_1: { target: "member", control: "text", column: "address_line_1" },
    city: { target: "member", control: "text", column: "city" },
    province: { target: "member", control: "text", column: "province" },
    postal_code: { target: "member", control: "text", column: "postal_code" },
    phone: { target: "member", control: "tel", column: "phone" },
    email: { target: "member", control: "email", column: "email" },
    blood_type: { target: "medical", control: "bloodType", column: "blood_type" },
    allergies: { target: "medical", control: "list", column: "allergies" },
    medications: { target: "medical", control: "list", column: "medications" },
    doctor_name: { target: "medical", control: "text", column: "doctor_name" },
    doctor_phone: { target: "medical", control: "tel", column: "doctor_phone" },
    hospital_preference: { target: "medical", control: "text", column: "hospital_preference" },
    emergency_contact: { target: "contacts", control: "contacts", column: null },
    emergency_contact_phone: { target: "contacts", control: "contacts", column: null },
  };

/**
 * TOKENS ALREADY IN FLIGHT.
 *
 * `MemberUpdateRequestModal` sent `contacts_count` and `contacts_email` for years, and a token
 * lives seven days. Renaming the keys without this map would hand a member who received a link
 * on Monday a page with nothing on it — the exact failure this change exists to fix, caused by
 * the fix.
 */
export const LEGACY_TOKEN_ALIASES: Record<string, string> = {
  contacts_count: "emergency_contact",
  contacts_email: "emergency_contact",
};

export function normaliseRequestedFields(requested: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of requested) {
    const key = LEGACY_TOKEN_ALIASES[raw] ?? raw;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** The fields to render, in `MEMBER_REQUIRED_FIELDS` order, unknown tokens ignored. */
export function updateFormFields(requested: readonly string[]): UpdateFormField[] {
  const wanted = new Set(normaliseRequestedFields(requested));
  const out: UpdateFormField[] = [];
  for (const field of MEMBER_REQUIRED_FIELDS) {
    if (!wanted.has(field.key)) continue;
    const spec = SPEC[field.key];
    // A field only WE can supply (an IMEI, a tested pendant, a paid subscription) has no spec
    // and no business on a page whose promise is "fill this in and you are done".
    if (!spec) continue;
    if (out.some((f) => f.target === "contacts" && spec.target === "contacts")) continue;
    out.push({ key: field.key, target: spec.target, control: spec.control, column: spec.column, field });
  }
  return out;
}

/** Grouped for the page, in `REQUIRED_GROUPS` order, empty groups omitted. */
export function groupUpdateFormFields(
  fields: readonly UpdateFormField[],
): Array<{ group: RequiredGroup; fields: UpdateFormField[] }> {
  return REQUIRED_GROUPS.map((group) => ({
    group,
    fields: fields.filter((f) => f.field.group === group),
  })).filter((entry) => entry.fields.length > 0);
}

/**
 * What the page submits, split by table.
 *
 * A BLANK IS NOT AN ANSWER AND IS NOT SENT. The link exists to add what is missing; a member
 * who fills in two of six fields must not blank the other four, and a member who opens the
 * link and submits an empty form must not be recorded as having completed anything (the
 * endpoint's `nothing_submitted` outcome depends on this).
 */
export function buildUpdateSubmission(
  fields: readonly UpdateFormField[],
  values: Record<string, string>,
): { member: Record<string, unknown>; medical: Record<string, unknown> } {
  const member: Record<string, unknown> = {};
  const medical: Record<string, unknown> = {};

  for (const field of fields) {
    if (!field.column) continue;
    const raw = (values[field.key] ?? "").trim();
    if (!raw) continue;
    const value =
      field.control === "list"
        ? raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : raw;
    if (Array.isArray(value) && value.length === 0) continue;
    if (field.target === "member") member[field.column] = value;
    else if (field.target === "medical") medical[field.column] = value;
  }

  return { member, medical };
}

export function requestedIncludesContacts(requested: readonly string[]): boolean {
  return normaliseRequestedFields(requested).some((k) => SPEC[k]?.target === "contacts");
}

/**
 * THE RATCHET, and it is a runtime one on purpose.
 *
 * A required field added to `memberRequiredFields.ts` with `memberCanSupply: true` and no entry
 * in SPEC would be tickable in the Missing-info dialog and invisible on the member's page — the
 * exact nine-of-eighteen state this module replaces, recreated silently.
 *
 * It cannot be a type-level check: `MEMBER_REQUIRED_FIELDS` is ANNOTATED `readonly
 * RequiredField[]`, which widens `key` to `string` and `memberCanSupply` to `boolean`, so
 * `Extract<…, { memberCanSupply: true }>` resolves to every field and proves nothing — the trap
 * `medicalFields.ts` documents having fallen into. This is derived from the real array at
 * runtime instead, and `memberUpdateForm.test.ts` asserts it is empty. Unlike a fixture-based
 * check, it sees a field nobody has written a test for, which is the case that matters.
 */
export const UNSPECIFIED_REQUESTABLE_FIELDS = MEMBER_REQUIRED_FIELDS.filter(
  (f) => f.memberCanSupply && !SPEC[f.key],
).map((f) => f.key);

/** For the tests and the dialog: what this page can actually render. */
export const RENDERABLE_UPDATE_KEYS = Object.keys(SPEC);

export function updateFieldLabel(key: string): string {
  return requiredFieldByKey(key)?.label.fallback ?? key;
}
