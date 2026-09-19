/**
 * A LEAD A STAFF MEMBER TYPED IN, and what has to be true before it is written.
 *
 * The public forms exist for somebody who found the website. Most of the people this product is
 * for did not: they met somebody at a market stall in Mojácar, rang the office because a
 * neighbour mentioned us, or were introduced by their daughter. Until now there was nowhere to
 * put them, so they were put in a notebook.
 *
 * ── WHAT IS DIFFERENT FROM A PUBLIC SUBMISSION, AND WHAT IS NOT ─────────────
 *
 * NOT different: the field rules. `validateFields` from `public-submit.ts` is the same code, so
 * a phone number typed by an operator normalises exactly as one typed by a visitor. That is not
 * tidiness — every duplicate check between a lead and a member is a string comparison on that
 * column, and two normalisers that agree today are two normalisers that disagree next year.
 *
 * Different, and each for a reason:
 *
 *   NO HONEYPOT, NO TURNSTILE, NO RATE LIMIT. All three exist to tell a person from a script.
 *   The caller here is a signed-in staff member whose identity the function has already
 *   established; a rate limit on top of that would mean an operator working a busy morning at an
 *   event gets refused at the sixth person they spoke to.
 *
 *   EMAIL IS OPTIONAL. Insisting on one would exclude a large share of the people this product
 *   is for, and a phone number is the thing this business actually works with.
 *
 *   CONSENT IS REQUIRED, and it is the only field here with no counterpart on the public form —
 *   because there it is implied by the act of filling the form in. Somebody whose details were
 *   written on a card at a stall has not submitted anything, so the operator has to say, on the
 *   record, that they agreed. It is stored as a TIMESTAMP and a SOURCE rather than a tick: the
 *   question asked a year later is "when, and how did we come to be talking to them", which
 *   `true` cannot answer.
 *
 *   NO SPAM HEURISTICS. They read a message body written by a stranger. There is no message
 *   here, and guessing that an operator's own note is spam would be absurd.
 *
 * Pure and dependency-free, so it is unit-testable under vitest — the same reason
 * `public-submit.ts` is.
 */

import { toE164 } from "./phone.ts";
import { validateFields, type FormSpec } from "./public-submit.ts";

/**
 * HOW WE CAME TO BE TALKING TO THEM. Not decoration: it is half of the consent record, and it
 * is the only way to find out next year which of the things this business does actually brings
 * people in. An unknown value is refused rather than stored, so a typo cannot quietly become a
 * sixth category nobody can see in a report.
 */
export const HEARD_ABOUT = [
  "walk_in",
  "phone_call",
  "event",
  "member_referral",
  "partner_code",
  "other",
] as const;

export type HeardAbout = (typeof HEARD_ABOUT)[number];

/**
 * The form's rules. Deliberately NOT the contact form's: `message` is a staff note, not an
 * enquiry, so it has no ten-character floor and is not required — an operator who has nothing
 * to add should not be made to invent something.
 */
export const STAFF_LEAD_SPEC: FormSpec = {
  first_name: { kind: "name", required: true, max: 100 },
  last_name: { kind: "name", required: false, max: 100 },
  // REQUIRED, unlike the public form's optional surname — and email is the one that gives way
  // instead. A lead this business can act on is a lead somebody can ring.
  phone: { kind: "phone", required: true, max: 32 },
  email: { kind: "email", required: false, max: 255 },
  preferred_language: { kind: "language", required: false, max: 5 },
  enquiry_type: {
    kind: "choice",
    required: false,
    max: 40,
    options: ["general", "pricing", "demo", "partnership", "support"],
  },
  heard_about: { kind: "choice", required: true, max: 40, options: HEARD_ABOUT },
  notes: { kind: "text", required: false, max: 4000 },
};

export interface StaffLeadInput {
  fields: Record<string, unknown>;
  /** The tick. False or absent refuses the whole submission. */
  consent?: boolean;
  /** A partner's referral code, if the lead came in through one. */
  partnerCode?: string | null;
}

export type StaffLeadDecision =
  | {
      ok: true;
      values: Record<string, string>;
      /** Upper-cased and trimmed, or null. The caller looks it up; this only tidies it. */
      partnerCode: string | null;
    }
  | { ok: false; status: number; fields: string[]; reason: string };

/**
 * Everything decidable without touching the database.
 *
 * The duplicate check and the partner-code lookup are NOT here, because both are questions about
 * what is in the table. They are the function's job, and they have their own tests.
 */
export function decideStaffLead(input: StaffLeadInput): StaffLeadDecision {
  /*
    CONSENT FIRST, before the fields. Somebody who has not ticked it is not going to be helped by
    also being told their email is malformed — and refusing on consent while listing field errors
    would invite the reading that fixing the fields is what is being asked for.
  */
  if (input.consent !== true) {
    return { ok: false, status: 400, fields: ["consent"], reason: "consent_required" };
  }

  const { values, bad } = validateFields(STAFF_LEAD_SPEC, input.fields);
  if (bad.length > 0) {
    return { ok: false, status: 400, fields: bad, reason: "invalid_fields" };
  }

  const partnerCode = normalisePartnerCode(input.partnerCode);

  /*
    A PARTNER CODE IS NOT OPTIONAL WHEN THE OPERATOR SAID IT WAS A PARTNER REFERRAL. Without
    this, "how did you hear of us: partner code" with the code box left blank writes a lead that
    claims a provenance it cannot prove, and the partner never gets their €50 because nothing
    links the two.
  */
  if (values.heard_about === "partner_code" && !partnerCode) {
    return { ok: false, status: 400, fields: ["partner_code"], reason: "partner_code_required" };
  }

  return { ok: true, values, partnerCode };
}

/**
 * Referral codes are printed on cards and read down the telephone, so they arrive lower-cased,
 * with spaces, or with the letter O where a zero belongs. The first two are ours to fix; the
 * third is not, and is left to fail the lookup rather than be guessed at.
 */
export function normalisePartnerCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return v.length > 0 ? v : null;
}

/**
 * The two columns a duplicate check compares, normalised the same way on both sides.
 *
 * WHY THIS IS A FUNCTION AND NOT A `.eq()` IN THE QUERY. The number typed into the dialog goes
 * through `toE164`; the number already in `members` went through the CRM import, which used the
 * same rule — but only since they became one function. Comparing a raw input against a stored
 * value is how a duplicate check answers "no match" for somebody who is already a customer.
 */
export function duplicateKeys(values: Record<string, string>): {
  phone: string | null;
  email: string | null;
} {
  const phone = toE164(values.phone ?? "");
  const email = (values.email ?? "").trim().toLowerCase();
  return { phone: phone || null, email: email || null };
}
