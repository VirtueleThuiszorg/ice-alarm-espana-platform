import type { Tables } from "@/integrations/supabase/types";

/**
 * EVERY FIELD AN OPERATOR SEES, IN THE SECTIONS THE MEMBER READS THEM IN.
 *
 * `MedicalInfoPage` showed EIGHT of the sixteen columns `medical_information` holds. The other
 * eight — where the medicines are kept, mobility, hearing, sight, the medical centre, and both
 * private-insurance fields — were collected somewhere (by staff, on the phone, at sign-up) and
 * then invisible to the person they are about.
 *
 * THAT WAS NEVER ONLY A PRESENTATION GAP. `src/integrations/supabase/types.ts` was missing ten
 * of those columns outright until #188, so half of them could not have been rendered without a
 * type error. Fixing the page without fixing the types would have been fixing the symptom.
 *
 * SO THE PAGE IS DRIVEN FROM THIS LIST, and this list is checked against the generated Row type
 * at COMPILE TIME. A column added to `medical_information` by a future migration stops the build
 * until somebody decides which section it belongs in and what to call it. That is the whole
 * point: eight-of-sixteen is a state a hand-written page can be in for months without anybody
 * noticing, and it was.
 *
 * The subtitle the brief gives this page is the reason the completeness matters:
 * *"This is exactly what an operator sees the moment you press your pendant."* If that sentence
 * is on the screen, it has to be true.
 */

type MedicalRow = Tables<"medical_information">;

/**
 * Columns that are NOT the member's information about themselves:
 *   id, member_id      identity
 *   updated_at         when
 *   recorded_via       HOW it was collected (phone, form, import) — provenance, staff-facing
 *   recorded_by_staff  WHO recorded it — provenance, staff-facing
 *
 * Excluded by NAME rather than by a pattern, so that a future column called something like
 * `reviewed_by` is not silently swept into the exclusion by a regex on `_by`.
 */
export const MEDICAL_PROVENANCE_COLUMNS = [
  "id",
  "member_id",
  "updated_at",
  "recorded_via",
  "recorded_by_staff",
] as const;

export type MedicalFieldKind =
  /** One line. */
  | "text"
  /** Several lines — anything a member would write a sentence in. */
  | "textarea"
  /** A string[] column, edited as chips. */
  | "list"
  /** The eight blood groups, from a fixed list. */
  | "bloodType"
  /** A phone number: rendered as a `tel:` link when read-only. */
  | "phone";

export interface MedicalField {
  column: Exclude<keyof MedicalRow, (typeof MEDICAL_PROVENANCE_COLUMNS)[number]>;
  kind: MedicalFieldKind;
  label: { key: string; fallback: string };
  /** Shown under the label when the field's name alone does not say what to write. */
  hint?: { key: string; fallback: string };
}

export interface MedicalSection {
  key: string;
  title: { key: string; fallback: string };
  fields: readonly MedicalField[];
}

/**
 * The seven sections the brief names, in its order. Grouping is not decoration: an operator
 * mid-alert reads down a card, and "where the tablets are kept" belongs beside the tablets
 * rather than in a general notes field at the bottom.
 */
export const MEDICAL_SECTIONS = [
  {
    key: "conditions",
    title: { key: "medical.section.conditions", fallback: "Conditions & medication" },
    fields: [
      {
        column: "medical_conditions",
        kind: "list",
        label: { key: "medical.field.conditions", fallback: "Conditions" },
      },
      {
        column: "medications",
        kind: "list",
        label: { key: "medical.field.medications", fallback: "Medication" },
      },
      {
        column: "meds_location",
        kind: "text",
        label: { key: "medical.field.medsLocation", fallback: "Where your medication is kept" },
        hint: {
          key: "medical.field.medsLocationHint",
          fallback: "So an ambulance crew can find it without searching your home.",
        },
      },
      {
        column: "meds_notes",
        kind: "textarea",
        label: { key: "medical.field.medsNotes", fallback: "Anything else about your medication" },
      },
    ],
  },
  {
    key: "allergies",
    title: { key: "medical.section.allergies", fallback: "Allergies" },
    fields: [
      {
        column: "allergies",
        kind: "list",
        label: { key: "medical.field.allergies", fallback: "Allergies" },
      },
    ],
  },
  {
    key: "senses",
    title: { key: "medical.section.senses", fallback: "Mobility, hearing and sight" },
    fields: [
      {
        column: "mobility",
        kind: "text",
        label: { key: "medical.field.mobility", fallback: "Getting about" },
        hint: {
          key: "medical.field.mobilityHint",
          fallback: "For example: walking frame indoors, cannot manage stairs.",
        },
      },
      {
        column: "hearing_notes",
        kind: "text",
        label: { key: "medical.field.hearing", fallback: "Hearing" },
        hint: {
          key: "medical.field.hearingHint",
          fallback: "So an operator knows to speak up, or that you may not hear them at first.",
        },
      },
      {
        column: "vision_notes",
        kind: "text",
        label: { key: "medical.field.vision", fallback: "Sight" },
      },
    ],
  },
  {
    key: "doctor",
    title: { key: "medical.section.doctor", fallback: "Your doctor" },
    fields: [
      {
        column: "doctor_name",
        kind: "text",
        label: { key: "medical.field.doctorName", fallback: "Doctor" },
      },
      {
        column: "doctor_phone",
        kind: "phone",
        label: { key: "medical.field.doctorPhone", fallback: "Doctor's phone" },
      },
      {
        column: "doctor_location",
        kind: "text",
        label: { key: "medical.field.doctorLocation", fallback: "Medical centre" },
      },
      {
        column: "hospital_preference",
        kind: "text",
        label: { key: "medical.field.hospital", fallback: "Preferred hospital" },
      },
      {
        column: "blood_type",
        kind: "bloodType",
        label: { key: "medical.field.bloodType", fallback: "Blood group" },
      },
    ],
  },
  {
    key: "insurance",
    title: { key: "medical.section.insurance", fallback: "Private insurance" },
    fields: [
      {
        column: "private_insurer",
        kind: "text",
        label: { key: "medical.field.insurer", fallback: "Insurer" },
      },
      {
        column: "private_policy_number",
        kind: "text",
        label: { key: "medical.field.policyNumber", fallback: "Policy number" },
      },
    ],
  },
  {
    key: "other",
    title: { key: "medical.section.other", fallback: "Anything else" },
    fields: [
      {
        column: "additional_notes",
        kind: "textarea",
        label: { key: "medical.field.additionalNotes", fallback: "Anything else we should know" },
      },
    ],
  },
] as const satisfies readonly MedicalSection[];

/**
 * Flat, in section order — what the page renders and what the save sends.
 *
 * ANNOTATED, unlike MEDICAL_SECTIONS: widening is harmless here because the ratchet below reads
 * the SECTIONS, and `flatMap` over a tuple-typed const produces a type TypeScript cannot
 * usefully narrow anyway. `[...s.fields]` because `flatMap` will not flatten a `readonly` array.
 */
export const MEDICAL_FIELDS: readonly MedicalField[] = MEDICAL_SECTIONS.flatMap((s) => [
  ...s.fields,
]);

/**
 * THE RATCHET — and it was DECORATIVE until a mutation test caught it.
 *
 * `MEDICAL_SECTIONS` was declared `: readonly MedicalSection[] = […] as const`. The annotation
 * WIDENS the type: `typeof MEDICAL_SECTIONS` became `readonly MedicalSection[]`, so
 * `[number]["fields"][number]["column"]` resolved to `MedicalField["column"]` — every
 * non-provenance column — regardless of what the array actually contained. `Covered` was
 * therefore always complete and `Uncovered` always `never`. Deleting an entire field from a
 * section produced ZERO type errors.
 *
 * `as const satisfies readonly MedicalSection[]` keeps the literal types AND still checks the
 * shape. Verified the way the first version should have been: by deleting a field and watching
 * the build fail.
 *
 * A column added to `medical_information` stops the build until it is placed in a
 * section above or named as provenance. Eight-of-sixteen is a state a hand-written page can sit
 * in for months without anybody noticing — and it did.
 *
 * A runtime test cannot catch this: a column nobody renders simply never appears in a fixture.
 */
type Covered = (typeof MEDICAL_SECTIONS)[number]["fields"][number]["column"];
type Uncovered = Exclude<
  keyof MedicalRow,
  Covered | (typeof MEDICAL_PROVENANCE_COLUMNS)[number]
>;
const _everyColumnIsPlaced: Uncovered extends never ? true : never = true;
void _everyColumnIsPlaced;

/** The list columns, derived — the save path validates these differently from the text ones. */
export const MEDICAL_LIST_COLUMNS = MEDICAL_FIELDS.filter((f) => f.kind === "list").map(
  (f) => f.column,
);

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/**
 * "Getting into your home" — a DIFFERENT TABLE, and read-only on purpose.
 *
 * `member_access` holds the key-safe location and code, the gate code and access notes. Its RLS
 * gives a member SELECT on their own row and no write at all: an admin records it. That is not
 * an oversight to route around — a key-safe code that the account holder can change is a
 * key-safe code that anyone who gets into the account can change, and the operator would then
 * be reading a number a stranger typed.
 *
 * So it is shown, locked, WITH A REASON — the pattern R7 already sanctions for DOB and NIE
 * ("Call us to change this — we need to verify who you are"). R6's ban on "contact support to
 * change" is about fields the member could perfectly well edit themselves; this is not one.
 *
 * The code itself is MASKED with a Show control, per the brief. Not because the member should
 * not see their own code, but because this page gets read over a shoulder, held up to a carer,
 * and screenshotted for support.
 */
type AccessRow = Tables<"member_access">;

export interface MemberAccessField {
  column: Exclude<keyof AccessRow, "member_id" | "updated_at">;
  label: { key: string; fallback: string };
  /**
   * Masked until the member presses Show. REQUIRED rather than optional, so `secret: false` is
   * a decision somebody made about a field rather than a property nobody thought about — and so
   * a new field cannot default to visible by omission.
   */
  secret: boolean;
}

export const MEMBER_ACCESS_FIELDS = [
  {
    column: "key_safe_location",
    label: { key: "medical.access.keySafeLocation", fallback: "Where the key safe is" },
    // Where the safe is, not what opens it. Useful to a member reading their own record and
    // not, on its own, a way in.
    secret: false,
  },
  {
    column: "key_safe_code",
    label: { key: "medical.access.keySafeCode", fallback: "Key safe code" },
    secret: true,
  },
  {
    column: "gate_code",
    label: { key: "medical.access.gateCode", fallback: "Gate or entry code" },
    secret: true,
  },
  {
    column: "access_notes",
    label: { key: "medical.access.notes", fallback: "How to get in" },
    secret: false,
  },
] as const satisfies readonly MemberAccessField[];

/** The same ratchet for `member_access`. */
type AccessCovered = (typeof MEMBER_ACCESS_FIELDS)[number]["column"];
type AccessUncovered = Exclude<keyof AccessRow, AccessCovered | "member_id" | "updated_at">;
const _everyAccessColumnIsPlaced: AccessUncovered extends never ? true : never = true;
void _everyAccessColumnIsPlaced;
