/**
 * WHAT A MEMBER'S UPDATE LINK MAY WRITE — a whitelist, because the endpoint runs as service_role.
 *
 * THE HOLE THIS CLOSES. `submit-member-update` spread the request body straight into the
 * update:
 *
 *     .from("members").update({ ...member, updated_at: … }).eq("id", memberId)
 *
 * The TypeScript interface named three fields; the runtime accepted every column on the table.
 * The caller is anonymous — whoever holds the token — and the client is service_role, so RLS
 * is not standing behind it. Anything on `members` was writable by anyone with a link: the
 * status column, the CRM attribution, the linked-member pointer, the away dates.
 *
 * A type is not a guard. This list is, and it is applied to the object before it reaches
 * Postgres.
 *
 * WHAT IS ON IT is exactly what a member can be ASKED for — `memberRequiredFields.ts`'s
 * requestable set, plus the two extra profile fields the older links already offered
 * (`address_line_2` was in the endpoint's own interface). Nothing that decides money, role,
 * status or provenance is on it, and the parity test in `memberUpdateForm.test.ts` fails the
 * build if the form ever tries to submit something this list does not allow.
 */

export const MEMBER_WRITABLE_COLUMNS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "nie_dni",
  "address_line_1",
  "address_line_2",
  "city",
  "province",
  "postal_code",
  "phone",
  "email",
  "preferred_contact_method",
  "preferred_contact_time",
] as const;

/**
 * Medical is the whole record by design: everything in `medical_information` is the member's
 * own information about themselves, and the page only ever shows them the fields their token
 * asked for. Provenance is NOT here — `recorded_via` and `recorded_by_staff` are stamped by
 * the endpoint from the derived route, and a submission that could set them could claim an
 * operator keyed it.
 */
export const MEDICAL_WRITABLE_COLUMNS = [
  "blood_type",
  "allergies",
  "medications",
  "medical_conditions",
  "meds_location",
  "meds_notes",
  "mobility",
  "hearing_notes",
  "vision_notes",
  "doctor_name",
  "doctor_phone",
  "doctor_location",
  "hospital_preference",
  "private_insurer",
  "private_policy_number",
  "additional_notes",
] as const;

export const MEMBER_PROVENANCE_COLUMNS = [
  "id",
  "user_id",
  "status",
  "created_at",
  "updated_at",
  "crm_source",
  "crm_source_id",
  "ref_partner_id",
  "linked_member_id",
  "deceased_at",
] as const;

/**
 * Keep only the allowed keys, and only the ones that carry a value.
 *
 * `undefined` is dropped rather than written: a form that renders eight fields and is sent with
 * two filled in must not blank the other six. An empty STRING is dropped for the same reason —
 * the link exists to add what is missing, never to erase what is there.
 */
export function pickWritable<T extends string>(
  input: Record<string, unknown> | null | undefined,
  allowed: readonly T[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input) return out;
  const permitted = new Set<string>(allowed);
  for (const [key, value] of Object.entries(input)) {
    if (!permitted.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/** What was refused, so a rejected key is visible in the audit rather than silently vanishing. */
export function rejectedKeys<T extends string>(
  input: Record<string, unknown> | null | undefined,
  allowed: readonly T[],
): string[] {
  if (!input) return [];
  const permitted = new Set<string>(allowed);
  return Object.keys(input).filter((k) => !permitted.has(k));
}
