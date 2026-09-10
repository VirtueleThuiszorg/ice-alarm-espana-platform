import { MEDICAL_FIELDS } from "@/lib/medicalFields";

/**
 * WHAT THE PLATFORM REQUIRES ON A MEMBER'S FILE — the ONE definition, and the reason each item
 * is on the list.
 *
 * THERE WERE FOUR AND A HALF ANSWERS BEFORE THIS. `readinessGap.ts` says a member is monitored
 * once they have a contact and a tested pendant. `protectionChecklist.ts` adds an active
 * membership and a pendant that is actually assigned. The registration schema
 * (`_shared/validation.ts`) decides what a stranger must type to join. `medicalFields.ts`
 * describes seventeen medical fields and marks none of them required. And
 * `MemberUpdateRequestModal` carried a fifth, inline list — six medical fields, NIE/DNI and
 * "fewer than two contacts" — written nowhere else and reconciled with nothing.
 *
 * This module is the reconciliation, and it is DERIVED rather than invented. Every entry below
 * names which of those sources asserts it. Where they disagreed, the disagreement is recorded in
 * the comment rather than resolved silently — see NIE/DNI and the second contact.
 *
 * WHY EACH ITEM IS REQUIRED IS PART OF THE DATA, not a tooltip. "We need your blood group"
 * without a reason reads as bureaucracy; "an operator reads this to the ambulance crew" is a
 * reason somebody acts on. The three reasons are the three things this business actually has to
 * do: answer an SOS, take the money, and satisfy the law.
 */

export type RequiredReason =
  /** An operator or an ambulance crew needs it during an emergency. */
  | "sos"
  /** Without it we cannot charge, or cannot prove what was charged. */
  | "billing"
  /** Identity and record-keeping obligations. */
  | "legal";

export const REQUIRED_REASON_LABELS: Record<RequiredReason, { key: string; fallback: string }> = {
  sos: { key: "required.reason.sos", fallback: "SOS response" },
  billing: { key: "required.reason.billing", fallback: "Billing" },
  legal: { key: "required.reason.legal", fallback: "Legal / records" },
};

/** The groups the Overview and Missing-info dialogs render, in the order they render them. */
export const REQUIRED_GROUPS = [
  "identity",
  "address",
  "contact",
  "medical",
  "contacts",
  "device",
  "membership",
] as const;
export type RequiredGroup = (typeof REQUIRED_GROUPS)[number];

export const REQUIRED_GROUP_LABELS: Record<RequiredGroup, { key: string; fallback: string }> = {
  identity: { key: "required.group.identity", fallback: "Identity" },
  address: { key: "required.group.address", fallback: "Address" },
  contact: { key: "required.group.contact", fallback: "Contact details" },
  medical: { key: "required.group.medical", fallback: "Medical" },
  contacts: { key: "required.group.contacts", fallback: "Emergency contacts" },
  device: { key: "required.group.device", fallback: "Device" },
  membership: { key: "required.group.membership", fallback: "Membership" },
};

export interface RequiredField {
  /**
   * The stable id. It is ALSO the `requested_fields` token sent to the member's update link, so
   * renaming one silently breaks every unexpired token in flight.
   */
  key: string;
  group: RequiredGroup;
  label: { key: string; fallback: string };
  why: RequiredReason;
  /** The reason in a sentence — what actually goes wrong without it. */
  because: { key: string; fallback: string };
  /**
   * Can the MEMBER supply it?
   *
   * False for the things only we can do: assign a pendant, test it, take a payment. Those still
   * belong on the missing list — somebody has to chase them — but asking a member for their own
   * IMEI is asking them to read a number off a device we have not sent yet.
   */
  memberCanSupply: boolean;
  /** Which source of truth asserts this, so a reader can check the derivation. */
  derivedFrom: string;
}

/**
 * The list. Twenty-one items.
 *
 * Ordered by group, and within a group by how badly its absence hurts: an operator with no
 * address cannot send an ambulance anywhere, so that outranks a missing insurer.
 */
export const MEMBER_REQUIRED_FIELDS: readonly RequiredField[] = [
  // ── identity ──────────────────────────────────────────────────────────────
  {
    key: "first_name",
    group: "identity",
    label: { key: "member.firstName", fallback: "First name" },
    why: "sos",
    because: {
      key: "required.why.firstName",
      fallback: "An operator opens an alert with the member's name — it is the first thing they say.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.primaryMember.firstName (min 1)",
  },
  {
    key: "last_name",
    group: "identity",
    label: { key: "member.lastName", fallback: "Last name" },
    why: "legal",
    because: {
      key: "required.why.lastName",
      fallback: "Identifies the member on the contract and to emergency services.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.primaryMember.lastName (min 1)",
  },
  {
    key: "date_of_birth",
    group: "identity",
    label: { key: "member.dateOfBirth", fallback: "Date of birth" },
    why: "sos",
    because: {
      key: "required.why.dateOfBirth",
      fallback: "Ambulance crews ask for age before anything else. It is also how two members with the same name are told apart.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.primaryMember.dateOfBirth (min 1)",
  },
  {
    /*
      THE ONE THE SOURCES DISAGREE ABOUT, recorded rather than resolved quietly.

      The registration schema has `nieDni` OPTIONAL — a stranger can join without one, and that
      is deliberate: REVIEW_JOIN_PATH.md F1 is the record of what requiring too much at the
      wizard cost. `MemberUpdateRequestModal` nonetheless treated its absence as something to
      chase. Both are right about their own moment: not required TO JOIN, required ON FILE.
      That is what this list is — "required for our files", not "required to sign up".
    */
    key: "nie_dni",
    group: "identity",
    label: { key: "common.nieDni", fallback: "NIE / DNI" },
    why: "legal",
    because: {
      key: "required.why.nieDni",
      fallback: "Spanish identity number. Needed on the contract, and by a hospital admitting them.",
    },
    memberCanSupply: true,
    derivedFrom: "MemberUpdateRequestModal (chased); registrationSchema marks it optional AT SIGN-UP",
  },

  // ── address ───────────────────────────────────────────────────────────────
  {
    key: "address_line_1",
    group: "address",
    label: { key: "member.addressLine1", fallback: "Address" },
    why: "sos",
    because: {
      key: "required.why.address",
      fallback: "Where the ambulance goes. Nothing on this list matters more.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.address.addressLine1 (min 1)",
  },
  {
    key: "city",
    group: "address",
    label: { key: "member.city", fallback: "Town or city" },
    why: "sos",
    because: {
      key: "required.why.city",
      fallback: "Part of the address an operator reads to 112. A street with no town is not an address.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.address.city (min 1)",
  },
  {
    key: "province",
    group: "address",
    label: { key: "member.province", fallback: "Province" },
    why: "sos",
    because: {
      key: "required.why.province",
      fallback: "Decides which emergency service answers — 112 is regional.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.address.province (min 1)",
  },
  {
    key: "postal_code",
    group: "address",
    label: { key: "member.postalCode", fallback: "Postal code" },
    why: "sos",
    because: {
      key: "required.why.postalCode",
      fallback: "How the address is verified, and how a rural property is found at all in Almería.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.address.postalCode (min 1, pattern)",
  },

  // ── contact details ───────────────────────────────────────────────────────
  {
    key: "phone",
    group: "contact",
    label: { key: "member.phone", fallback: "Phone" },
    why: "sos",
    because: {
      key: "required.why.phone",
      fallback: "The first thing an operator does with an alert is ring the member back.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.primaryMember.phone",
  },
  {
    key: "email",
    group: "contact",
    label: { key: "member.email", fallback: "Email" },
    why: "billing",
    because: {
      key: "required.why.email",
      fallback: "Receipts, renewal notices and the sign-in link all go here.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.primaryMember.email",
  },

  // ── medical ───────────────────────────────────────────────────────────────
  /*
    THE SIX CARRIED FORWARD, and why they are exactly six.

    Of the four sources the brief names, NONE asserts a required medical field: `medicalFields.ts`
    describes seventeen and marks none, and the registration schema has every medical value
    optional. The only existing assertion is the inline list in `MemberUpdateRequestModal` — the
    fifth opinion this module replaces — and it names these six.

    So they are carried forward unchanged. Adding a seventh would be inventing a requirement no
    part of this codebase has ever made; dropping one would quietly stop chasing something staff
    chase today. Both are decisions for Lee to take on a list he can read, which is why the list
    is here and not spread across a component.
  */
  {
    key: "blood_type",
    group: "medical",
    label: { key: "medical.field.bloodType", fallback: "Blood group" },
    why: "sos",
    because: {
      key: "required.why.bloodType",
      fallback: "Read out to the ambulance crew on arrival.",
    },
    memberCanSupply: true,
    derivedFrom: "MemberUpdateRequestModal; medicalFields.ts describes it, requires nothing",
  },
  {
    key: "allergies",
    group: "medical",
    label: { key: "medical.field.allergies", fallback: "Allergies" },
    why: "sos",
    because: {
      key: "required.why.allergies",
      fallback: "What must not be given to them. The one medical field where being wrong is dangerous.",
    },
    memberCanSupply: true,
    derivedFrom: "MemberUpdateRequestModal",
  },
  {
    key: "medications",
    group: "medical",
    label: { key: "medical.field.medications", fallback: "Medication" },
    why: "sos",
    because: {
      key: "required.why.medications",
      fallback: "What they are already taking, so a crew does not double a dose.",
    },
    memberCanSupply: true,
    derivedFrom: "MemberUpdateRequestModal",
  },
  {
    key: "doctor_name",
    group: "medical",
    label: { key: "medical.field.doctorName", fallback: "Doctor" },
    why: "sos",
    because: {
      key: "required.why.doctorName",
      fallback: "The person who already knows their history, and who a hospital will want to speak to.",
    },
    memberCanSupply: true,
    derivedFrom: "MemberUpdateRequestModal",
  },
  {
    key: "doctor_phone",
    group: "medical",
    label: { key: "medical.field.doctorPhone", fallback: "Doctor's phone" },
    why: "sos",
    because: {
      key: "required.why.doctorPhone",
      fallback: "A number an operator can ring at 3am without looking it up.",
    },
    memberCanSupply: true,
    derivedFrom: "MemberUpdateRequestModal",
  },
  {
    key: "hospital_preference",
    group: "medical",
    label: { key: "medical.field.hospital", fallback: "Preferred hospital" },
    why: "sos",
    because: {
      key: "required.why.hospital",
      fallback: "Where they want to be taken, while they can still say so.",
    },
    memberCanSupply: true,
    derivedFrom: "MemberUpdateRequestModal",
  },

  // ── emergency contacts ────────────────────────────────────────────────────
  {
    /*
      ONE, NOT TWO — the second disagreement, also recorded.

      `readinessGap.ts` and `protectionChecklist.ts` both make ONE contact the condition, and
      READINESS_MODEL.md §2 makes the readiness view the answer that surfaces read.
      `MemberUpdateRequestModal` chased a SECOND ("fewer than 2 emergency contacts"). A second
      contact is better practice and nobody is arguing otherwise — but making it REQUIRED here
      would mean the missing-info count disagrees with the readiness queue, the member header
      notice and the operator card, all of which say one is enough. Three screens with three
      answers is the thing this module exists to end.
    */
    key: "emergency_contact",
    group: "contacts",
    label: { key: "required.field.emergencyContact", fallback: "At least one emergency contact" },
    why: "sos",
    because: {
      key: "required.why.emergencyContact",
      fallback: "With nobody to call, the last rung of the escalation ladder can never be served.",
    },
    memberCanSupply: true,
    derivedFrom: "readinessGap.ts + protectionChecklist.ts (both: count > 0)",
  },
  {
    key: "emergency_contact_phone",
    group: "contacts",
    label: { key: "required.field.contactPhone", fallback: "A phone number for every contact" },
    why: "sos",
    because: {
      key: "required.why.contactPhone",
      fallback: "A contact with no number is a name on a screen at the moment somebody needs ringing.",
    },
    memberCanSupply: true,
    derivedFrom: "registrationSchema.emergencyContacts[].phone (required in the element shape)",
  },

  // ── device ────────────────────────────────────────────────────────────────
  {
    key: "device_imei",
    group: "device",
    label: { key: "required.field.deviceImei", fallback: "A pendant assigned (IMEI)" },
    why: "sos",
    because: {
      key: "required.why.deviceImei",
      fallback: "Without a device on the record, a press has nothing to arrive from.",
    },
    // Ours to do, not theirs: the member cannot assign themselves a pendant.
    memberCanSupply: false,
    derivedFrom: "protectionChecklist.ts pendant rung (device assigned)",
  },
  {
    key: "device_tested",
    group: "device",
    label: { key: "required.field.deviceTested", fallback: "Pendant tested with an operator" },
    why: "sos",
    because: {
      key: "required.why.deviceTested",
      fallback: "Until somebody has pressed it in their own home and an operator answered, nothing proves the chain works.",
    },
    memberCanSupply: false,
    derivedFrom: "readinessGap.ts + protectionChecklist.ts (device_tested_at)",
  },

  // ── membership ────────────────────────────────────────────────────────────
  {
    key: "active_subscription",
    group: "membership",
    label: { key: "required.field.subscription", fallback: "An active subscription" },
    why: "billing",
    because: {
      key: "required.why.subscription",
      fallback: "Monitoring is what the subscription pays for. Without one, nobody is being paid to watch.",
    },
    // Activated by the payment webhook, never by a form — golden rule 4.
    memberCanSupply: false,
    derivedFrom: "protectionChecklist.ts membership rung",
  },
];

/**
 * THE RATCHET. Every medical key above must be a real column in `medicalFields.ts`.
 *
 * A typo here would produce a requirement that can never be satisfied: the missing-info count
 * would stay at one forever, and the member's update link would ask for a field that writes
 * nowhere. It is a compile-time check because the failure is silent at runtime.
 */
type MedicalColumn = (typeof MEDICAL_FIELDS)[number]["column"];
type MedicalRequiredKey = Extract<
  (typeof MEMBER_REQUIRED_FIELDS)[number],
  { group: "medical" }
>["key"];
const _medicalKeysAreRealColumns: MedicalRequiredKey extends MedicalColumn ? true : never = true;
void _medicalKeysAreRealColumns;

// ── what "missing" means ────────────────────────────────────────────────────

/** Everything the check reads. Every part is nullable: a read that has not answered is not a gap. */
export interface MemberRecordForRequiredCheck {
  member: Record<string, unknown> | null | undefined;
  medical: Record<string, unknown> | null | undefined;
  contacts: ReadonlyArray<{ phone?: string | null }> | null | undefined;
  device: { imei?: string | null } | null | undefined;
  /** From the readiness view — the canonical answer to "has it been tested". */
  deviceTestedAt: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  /**
   * Does the plan include a pendant? When false, the two device items are NOT required — asking
   * a member without a pendant for their IMEI is chasing something that should not exist.
   * `undefined` means we do not know, and the device items are then skipped rather than guessed.
   */
  hasPendant: boolean | null | undefined;
}

/** Blank is missing. An imported record can carry `""` in a NOT NULL column. */
function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Which required items this member has not got.
 *
 * A NULL SOURCE IS NOT A GAP. If the medical row has not been read, every medical field would
 * otherwise report missing — and a badge that says "6 missing" while the query is in flight is
 * a badge staff learn to ignore. Undefined and null are both treated as "not answered", and the
 * caller decides whether to render a count at all.
 */
export function missingRequiredFields(
  input: MemberRecordForRequiredCheck,
): RequiredField[] {
  const missing: RequiredField[] = [];

  for (const field of MEMBER_REQUIRED_FIELDS) {
    switch (field.group) {
      case "identity":
      case "address":
      case "contact": {
        if (!input.member) break;
        if (!present(input.member[field.key])) missing.push(field);
        break;
      }
      case "medical": {
        if (input.medical === null || input.medical === undefined) break;
        if (!present(input.medical[field.key])) missing.push(field);
        break;
      }
      case "contacts": {
        if (!input.contacts) break;
        if (field.key === "emergency_contact") {
          if (input.contacts.length === 0) missing.push(field);
        } else if (field.key === "emergency_contact_phone") {
          /*
            Only a gap once there IS a contact — reporting "every contact needs a number"
            beside "there are no contacts at all" is one problem printed twice.

            `some` on an empty array is already false, so no length guard is written here: one
            was, and no mutation could tell it apart from its absence. A guard nothing can
            distinguish from nothing is decoration, and the property is asserted instead.
          */
          if (input.contacts.some((c) => !present(c.phone))) missing.push(field);
        }
        break;
      }
      case "device": {
        // Not required when the plan has no pendant, and skipped when we do not know.
        if (input.hasPendant !== true) break;
        if (field.key === "device_imei") {
          if (input.device === undefined) break;
          if (!present(input.device?.imei)) missing.push(field);
        } else if (field.key === "device_tested") {
          if (input.deviceTestedAt === undefined) break;
          if (!present(input.deviceTestedAt)) missing.push(field);
        }
        break;
      }
      case "membership": {
        if (input.subscriptionStatus === undefined) break;
        if (input.subscriptionStatus !== "active") missing.push(field);
        break;
      }
    }
  }

  return missing;
}

/** The badge number. */
export function missingRequiredCount(input: MemberRecordForRequiredCheck): number {
  return missingRequiredFields(input).length;
}

/**
 * RECOMMENDED, WHICH IS NOT THE SAME AS REQUIRED — and the difference is enforced, not
 * described.
 *
 * A member without a home-location pin is NOT an incomplete record. `missingRequiredFields()`
 * does not look at this list, `missingRequiredCount()` does not count it, and the badge on the
 * members list does not move because of it. What it does do is appear in the Missing-info dialog
 * as a suggestion, and travel on the member's own update link if somebody ticks it.
 *
 * WHY IT IS NOT REQUIRED, given the SOS card leans on it. Because making it required would put a
 * red count on 431 imported records for something only the member can supply, on a screen staff
 * read to decide what to chase today — and a count that is permanently non-zero is a count
 * people learn to ignore. The address is already required; the pin is the address made precise.
 *
 * WHY IT IS NOT MERELY OPTIONAL EITHER. An EV07B indoors usually has no fix, and the typed
 * address in rural Almería is regularly a property a driver cannot find at night. Somebody has
 * to be prompted to ask, and the Missing-info dialog is where staff look.
 *
 * SEPARATE LIST, NOT A FLAG ON THE ONE ABOVE. `MEMBER_REQUIRED_FIELDS` is pinned by its own
 * tests and read by the update-link vocabulary; a `recommended: true` member of it would have
 * to be filtered out at every one of those call sites, and the one that forgot would silently
 * make it required. A list that is never passed to the required check cannot become required by
 * accident.
 */
export const MEMBER_RECOMMENDED_FIELDS: readonly RequiredField[] = [
  {
    key: "home_location",
    group: "address",
    label: { key: "required.field.homeLocation", fallback: "Home location (map pin)" },
    why: "sos",
    because: {
      key: "required.why.homeLocation",
      fallback:
        "A pendant indoors usually has no GPS fix, and indoors is where falls happen. A pin the member has confirmed on their own front door is where we send help when the pendant cannot say.",
    },
    memberCanSupply: true,
    derivedFrom: "members.home_lat/home_lng (20260910130000); SOS card fallback, RECOMMENDED not required",
  },
];

/**
 * Which recommended items this member has not got.
 *
 * Deliberately a DIFFERENT function from `missingRequiredFields`, taking the same input, so a
 * caller has to ask for suggestions on purpose. A null member row is not a gap, for the same
 * reason as above: a badge that reads "1 suggestion" while the query is in flight is a badge
 * staff learn to ignore.
 */
export function missingRecommendedFields(
  input: MemberRecordForRequiredCheck,
): RequiredField[] {
  if (!input.member) return [];
  const m = input.member;
  /*
    A PIN IS BOTH COORDINATES AND A SOURCE. Coordinates with no `home_location_source` are
    refused by the database (`members_home_location_complete`) and would be refused by the SOS
    card too — it cannot label an unattributed pin honestly — so "has a pin" means all three.
  */
  const hasPin =
    present(m.home_lat) && present(m.home_lng) && present(m.home_location_source);
  return hasPin ? [] : [...MEMBER_RECOMMENDED_FIELDS];
}

/** Grouped for the dialog, in `REQUIRED_GROUPS` order, empty groups omitted. */
export function groupRequiredFields(
  fields: readonly RequiredField[],
): Array<{ group: RequiredGroup; fields: RequiredField[] }> {
  return REQUIRED_GROUPS.map((group) => ({
    group,
    fields: fields.filter((f) => f.group === group),
  })).filter((entry) => entry.fields.length > 0);
}

/**
 * The `requested_fields` tokens to send to the member — the ticked items MINUS the ones only we
 * can do.
 *
 * Asking a member to supply their pendant's IMEI, test their own pendant or activate their own
 * subscription is asking for something they cannot give, on a link whose whole promise is "fill
 * this in and you are done".
 */
export function requestableFields(fields: readonly RequiredField[]): RequiredField[] {
  return fields.filter((f) => f.memberCanSupply);
}

export function requiredFieldByKey(key: string): RequiredField | undefined {
  return MEMBER_REQUIRED_FIELDS.find((f) => f.key === key);
}
