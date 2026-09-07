/**
 * WHO THE PEOPLE AROUND A MEMBER ACTUALLY ARE — WP5, the circle of care.
 *
 * `emergency_contacts.contact_type` was widened from two values to eight by
 * `20260907100300_circle_of_care.sql`. Before that, as its own header says, *"a care agency, a
 * district nurse, a social worker and the neighbour with the spare key were all `emergency` with
 * a sentence of free text beside them."*
 *
 * THE MEMBER'S PAGE COLLECTED SIX FIELDS OF THIRTEEN. It offered name, relationship, phone,
 * email, notes and "speaks Spanish" — and neither `contact_type`, nor `can_attend_in_person`, nor
 * `country`, nor `availability_notes`. So the widened column had no way to be filled in by the
 * person who knows the answers, and the schema change was, from the member's side, invisible.
 *
 * ── `can_attend_in_person` IS TRI-STATE AND THAT IS THE POINT ──────────────────────────────
 *
 * The migration says it in as many words: *"NULL means unknown, which is honest — it is not the
 * same as false."* A checkbox cannot express unknown. An unchecked box would tell an operator at
 * three in the morning that a daughter **cannot** get there, when the truth is that nobody ever
 * asked her. That is worse than the blank it replaces, because it looks like an answer.
 *
 * So the control has three options and no default. `CAN_ATTEND_OPTIONS` is the mapping, and
 * "not sure" is a real choice a member can make rather than the absence of one.
 *
 * ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────────────────────
 *
 * It does not reorder the escalation ladder. The migration is explicit — *"the escalation ladder
 * does not yet order by it (SOS path, human gate)"* — and CLAUDE.md makes the SOS/alert path a
 * mandatory human gate before merge. This increment records the facts; using them to decide who
 * gets phoned first is Lee's to review.
 *
 * And a contact type is NOT a permission. `care_access_grants` is what somebody may SEE, and
 * nothing here touches it: a neighbour with a key may be phoned at 3am, and that does not
 * entitle them to a medical record.
 */

export interface ContactTypeSpec {
  /** The `contact_type` value. Must be one of the CHECK constraint's eight. */
  type: string;
  label: { key: string; fallback: string };
  /**
   * What choosing it means, in the member's words. REQUIRED: a list of eight bare nouns asks
   * somebody to guess whether their daughter is a "carer", and the guess ends up in front of an
   * operator.
   */
  description: { key: string; fallback: string };
}

export const CONTACT_TYPES = [
  {
    type: "emergency",
    label: { key: "contacts.type.emergency", fallback: "Family or friend" },
    description: {
      key: "contacts.type.emergencyDesc",
      fallback: "Somebody we phone if you need help. Most people start here.",
    },
  },
  {
    type: "key_holder",
    label: { key: "contacts.type.keyHolder", fallback: "Has a key" },
    description: {
      key: "contacts.type.keyHolderDesc",
      fallback: "They can let somebody into your home.",
    },
  },
  {
    type: "carer",
    label: { key: "contacts.type.carer", fallback: "Carer" },
    description: {
      key: "contacts.type.carerDesc",
      fallback: "Somebody who helps you day to day, paid or unpaid.",
    },
  },
  {
    type: "care_agency",
    label: { key: "contacts.type.careAgency", fallback: "Care agency" },
    description: {
      key: "contacts.type.careAgencyDesc",
      fallback: "A company that sends carers to you.",
    },
  },
  {
    type: "nurse",
    label: { key: "contacts.type.nurse", fallback: "Nurse" },
    description: {
      key: "contacts.type.nurseDesc",
      fallback: "A district nurse or a nurse who visits you.",
    },
  },
  {
    type: "social_worker",
    label: { key: "contacts.type.socialWorker", fallback: "Social worker" },
    description: {
      key: "contacts.type.socialWorkerDesc",
      fallback: "Your case worker at the ayuntamiento or the health service.",
    },
  },
  {
    type: "neighbour",
    label: { key: "contacts.type.neighbour", fallback: "Neighbour" },
    description: {
      key: "contacts.type.neighbourDesc",
      fallback: "Somebody nearby who could come round quickly.",
    },
  },
  {
    type: "legal_representative",
    label: { key: "contacts.type.legalRepresentative", fallback: "Legal representative" },
    description: {
      key: "contacts.type.legalRepresentativeDesc",
      fallback: "Somebody who acts for you formally — a power of attorney, for example.",
    },
  },
] as const satisfies readonly ContactTypeSpec[];

/**
 * `as const satisfies`, never an annotation — `: readonly ContactTypeSpec[]` widens `type` back
 * to `string` and this union stops meaning anything. The same trap `medicalFields.ts` fell into.
 */
export type ContactType = (typeof CONTACT_TYPES)[number]["type"];

/** The column's own default, and the one a member most often means. */
export const DEFAULT_CONTACT_TYPE: ContactType = "emergency";

export function contactTypeSpec(type: string): ContactTypeSpec | null {
  return CONTACT_TYPES.find((c) => c.type === type) ?? null;
}

/**
 * A `contact_type` read from the database, reduced to something renderable.
 *
 * A value the CHECK constraint allows but this list does not know about would otherwise render
 * as a raw enum string in front of a member. Falling back to the default would be worse — it
 * would silently relabel a nurse as "family or friend" — so the caller gets `null` and shows
 * nothing rather than something wrong.
 */
export function contactTypeLabel(type: string | null | undefined): ContactTypeSpec | null {
  return type ? contactTypeSpec(type) : null;
}

// ── can_attend_in_person, which has three answers ──────────────────────────

export type CanAttendChoice = "yes" | "no" | "unknown";

export interface CanAttendOption {
  choice: CanAttendChoice;
  /** What goes in the column. `null` for `unknown` — see the module comment. */
  value: boolean | null;
  label: { key: string; fallback: string };
}

export const CAN_ATTEND_OPTIONS = [
  {
    choice: "yes",
    value: true,
    label: { key: "contacts.canAttend.yes", fallback: "Yes, they can come round" },
  },
  {
    choice: "no",
    value: false,
    label: { key: "contacts.canAttend.no", fallback: "No, they are too far away" },
  },
  {
    choice: "unknown",
    value: null,
    label: { key: "contacts.canAttend.unknown", fallback: "I am not sure" },
  },
] as const satisfies readonly CanAttendOption[];

/** Compile-time: all three choices have an option, and nothing else does. */
type CoveredChoice = (typeof CAN_ATTEND_OPTIONS)[number]["choice"];
const _everyChoiceHasAnOption: Exclude<CanAttendChoice, CoveredChoice> extends never
  ? true
  : never = true;
void _everyChoiceHasAnOption;

/** The stored column value, as a choice. `null` and `undefined` are both `unknown`. */
export function canAttendChoice(value: boolean | null | undefined): CanAttendChoice {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

/** The choice, as a column value. */
export function canAttendValue(choice: CanAttendChoice): boolean | null {
  const option = CAN_ATTEND_OPTIONS.find((o) => o.choice === choice);
  // Unreachable while the ratchet above compiles. Thrown rather than defaulted to `false`,
  // which would be the one wrong answer: it asserts a contact cannot attend.
  if (!option) throw new Error(`unknown can-attend choice: ${choice}`);
  return option.value;
}
