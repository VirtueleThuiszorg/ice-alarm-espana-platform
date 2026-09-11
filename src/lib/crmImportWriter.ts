/**
 * What the CRM import would write, decided BEFORE anything is written.
 *
 * `planRowWrites` is pure: it takes a MappedRow and returns the exact rows destined for each
 * table, or the reasons a row cannot become a member. `applyRowPlan` does the IO and makes no
 * decisions. That split exists for two reasons:
 *
 *   1. The preview and the writer read the SAME plan, so they cannot disagree. A preview that
 *      is computed separately from the write is a preview of something else.
 *   2. Every judgement about a life-safety record — is this person a member, is this phone
 *      dialable, is this device real — is testable without a database.
 *
 * WHAT THIS REPLACES, AND WHY IT IS NOT A REFACTOR
 *
 * CRMImportPage's own writer invented data to satisfy NOT NULL columns:
 *
 *   email:             `imported-${Date.now()}@placeholder.local`
 *   phone:             'N/A'
 *   address_line_1:    'N/A'      city / province / postal_code: 'N/A'
 *   status:            'active'   — hardcoded, for every row
 *   devices.sim:       'TBD'      devices.status: 'active'
 *   emergency phone:   'N/A'      when the CRM had a name but no number
 *
 * Each of those is a lie the platform would then act on. The last one is the worst: an operator
 * running the escalation ladder during an SOS would be handed 'N/A' to dial. The second-worst is
 * `status: 'active'`, which breaks golden rule 4 — activation happens on the payment webhook and
 * nowhere else — and would have marked all 431 rows active, including the 199 cancelled and 54
 * deceased people the ICE mapper exists to keep out.
 *
 * The rule here is the opposite: a row that cannot be represented honestly does not become a
 * member. It becomes a CRM contact with the reason attached, which is a thing a human can fix.
 */
import type { EmailOwner, MappedRow } from "./iceCrmImport";

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export type RowOutcome = "member" | "crm_contact" | "skip";

export interface MemberInsert {
  first_name: string;
  last_name: string;
  /** Nullable since 20260910170000. Most legacy clients have no address at all. */
  email: string | null;
  /** Whose address it is. Only `member` is unique-constrained, and only `member` can log in. */
  email_owner: EmailOwner;
  phone: string;
  date_of_birth: string;
  address_line_1: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  address_line_2: string | null;
  status: "pending_review";
  billing_source: "legacy";
  special_instructions: string | null;
  nie_dni: string | null;
  gender: string | null;
  nationality: string | null;
  passport_number: string | null;
  crm_source: string;
  crm_source_id: string;
  /**
   * The Santander schedule, derived by `deriveLegacySchedule` in the mapper.
   *
   * NOT in NEVER_PATCH, and deliberately so: `computeEmptyOnlyPatch` filling these on a member
   * already imported is the ONLY backfill there is. The migration carries no SQL backfill,
   * because parsing Karma's free-text `Monthly Payment Date` in SQL would be a second
   * implementation of the date rule and the two would disagree on exactly the rows nobody
   * checks. Empty-only means a staff correction is never overwritten by a re-run.
   */
  legacy_billing_day: number | null;
  legacy_next_renewal: string | null;
  /**
   * The home pin, when the CRM row held one that parses to a point in Spain.
   *
   * ALL FOUR TRAVEL TOGETHER or none does: `members_home_location_complete` refuses coordinates
   * with no source, and the SOS card cannot label an unattributed pin honestly. `source` is
   * always `imported` — nobody asked the member — and `set_at` is always NULL, because the
   * import knows when IT ran and that is not when anybody stood at the door.
   */
  home_lat: number | null;
  home_lng: number | null;
  home_location_source: "imported" | null;
  home_location_set_at: null;
}

export interface ContactInsert {
  contact_name: string;
  relationship: string;
  phone: string;
  priority_order: number;
  is_primary: boolean;
  contact_type: "emergency" | "key_holder";
}

/**
 * A second number or address for the member themselves — not an emergency contact.
 *
 * 338 rows hold several numbers in one cell. Only the first dialable one can be `members.phone`,
 * and the rest are the ones an operator tries when it does not answer, so dropping them is
 * dropping exactly the numbers that get used when the first fails.
 */
export interface ContactMethodInsert {
  type: "phone" | "email";
  value: string;
  label: string;
}

export interface DeviceInsert {
  imei: string;
  sim_phone_number: string;
  status: "in_stock";
  notes: string | null;
}

export interface RowPlan {
  sourceId: string;
  outcome: RowOutcome;
  /** Why this row is not becoming a member. Empty when it is. */
  blockers: string[];
  /** Things a human should look at, that do not block the import. */
  warnings: string[];
  /**
   * The validated insert — non-null only when every required column is really present.
   */
  member: MemberInsert | null;
  /**
   * What was PARSED out of the row, whether or not it can be written.
   *
   * The preview needs this and `member` cannot supply it: a row with no email has no
   * MemberInsert, and showing the admin nothing for it makes "no email" look like "no data".
   * The whole point of the preview is to see the parsed date of birth, phone and address for
   * exactly the rows that are not going to become members.
   */
  parsedMember: {
    first_name: string;
    last_name: string;
    email: string | null;
    /** Whose address it is — the dedupe reads this, not just the address. */
    email_owner: EmailOwner;
    phone: string | null;
    date_of_birth: string | null;
    address_line_1: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    /* Carried here as well as on MemberInsert so that `memberPatchFor` can fill them on a
       member the platform already holds from a row that cannot itself create one — which is
       most of the imported file's re-runs. */
    legacy_billing_day: number | null;
    legacy_next_renewal: string | null;
  };
  medical: Record<string, unknown> | null;
  contacts: ContactInsert[];
  /** Contact names the CRM had without a dialable number — kept as a note, not as a contact. */
  contactsWithoutPhone: string[];
  device: DeviceInsert | null;
  extraPhones: string[];
  extraEmails: string[];
  notes: string[];
  /** Verbatim CRM strings, for the CRM profile. Never a subscription or an active status. */
  crmProfile: Record<string, unknown>;
  /**
   * Write an email notification opt-in for this member.
   *
   * Only set when the CRM said yes unambiguously. It is on the plan rather than done inside the
   * apply step so the PREVIEW can show it: consent is the one thing an admin should see before
   * pressing Import, not discover afterwards.
   */
  emailContactConsent: boolean;
}

/**
 * The columns `members` will not accept as null.
 *
 * EMAIL LEFT THIS LIST ON 2026-09-10, and it is the single biggest change to what the import
 * produces. `members.email` was `UNIQUE NOT NULL`, so "no email" was the commonest reason one of
 * Lee's clients became a CRM contact instead of a member — and most of them have no email. Since
 * 20260910170000 the column is nullable, so the absence of an address is no longer the absence
 * of a member.
 *
 * It is still REQUIRED in `memberRequiredFields.ts`, deliberately. That list is what the
 * Missing-info badge and the member-update link read, and an email is still something the
 * platform wants — a member without one has no login. The difference is that wanting it no
 * longer means refusing to hold the person's record until it arrives.
 */
const REQUIRED_MEMBER_FIELDS: { key: string; label: string }[] = [
  { key: "first_name", label: "first name" },
  { key: "last_name", label: "last name" },
  { key: "phone", label: "phone" },
  { key: "date_of_birth", label: "date of birth" },
  { key: "address_line_1", label: "address" },
  { key: "city", label: "city" },
  { key: "province", label: "province" },
  { key: "postal_code", label: "postal code" },
];

/**
 * AN IMPORTED MEMBER IS `pending_review` + `billing_source = 'legacy'`.
 *
 * They were `inactive` until Lee's ruling of 2026-09-10 (PENDING_FOR_LEE D-19 item 2), because
 * `member_status` had nothing better and golden rule 4 forbids `active`. `inactive` was honest
 * about the payment and wrong about the person: an inactive member is one nobody is watching,
 * and these 431 people are wearing the pendant tonight.
 *
 * `pending_review` says what is true — a real client, whose billing this platform has never
 * seen — and `billing_source = 'legacy'` is what lets them become active later without
 * weakening golden rule 4. An active legacy member is monitored; only `stripe` means there is a
 * subscription here to renew, dun or cancel, so renewal logic reads the SOURCE and never fires
 * at somebody who pays Mary in cash.
 *
 * WHAT THIS DOES NOT DO, AND MUST NOT: it does not set anybody active. `active` is reachable
 * only through the payment webhook, a staff reinstatement of a member who already has a paid
 * subscription, or `confirm_legacy_member()` — a supervisor's decision, recorded with their
 * name against it. `guard_member_status_self_write` refuses everything else, including this
 * import, and `scripts/rls/isolation.sql` asserts the refusal.
 */
const IMPORTED_MEMBER_STATUS = "pending_review" as const;

/** Paid outside Stripe. Never `stripe`: this platform has no record of any of them paying it. */
const IMPORTED_BILLING_SOURCE = "legacy" as const;

export function planRowWrites(row: MappedRow): RowPlan {
  const warnings = [...row.warnings];
  const blockers: string[] = [];
  const notes: string[] = [];

  if (row.target === "exclude") {
    return {
      sourceId: row.sourceId,
      outcome: "skip",
      blockers: ["excluded by CRM status (staff or building record, not a client)"],
      warnings,
      member: null,
      parsedMember: {
        first_name: row.member.first_name,
        last_name: row.member.last_name,
        email: row.member.email,
        email_owner: row.member.email_owner,
        phone: row.member.phone,
        date_of_birth: row.member.date_of_birth,
        address_line_1: row.member.address_line_1,
        city: row.member.city,
        province: row.member.province,
        postal_code: row.member.postal_code,
        legacy_billing_day: row.member.legacy_billing_day,
        legacy_next_renewal: row.member.legacy_next_renewal,
      },
      medical: null,
      contacts: [],
      contactsWithoutPhone: [],
      device: null,
      extraPhones: [],
      extraEmails: [],
      notes: [],
      crmProfile: {},
      emailContactConsent: false,
    };
  }

  const m = row.member;

  const candidate: Record<string, unknown> = {
    first_name: m.first_name,
    last_name: m.last_name,
    phone: m.phone,
    date_of_birth: m.date_of_birth,
    address_line_1: m.address_line_1,
    city: m.city,
    province: m.province,
    postal_code: m.postal_code,
  };

  for (const f of REQUIRED_MEMBER_FIELDS) {
    const v = candidate[f.key];
    if (v === null || v === undefined || v === "") blockers.push(`no ${f.label}`);
  }

  // The CRM status decides whether this person is a client at all; the required fields decide
  // whether we can represent them. Both have to hold.
  if (row.target !== "member") {
    blockers.push(`CRM status maps to a contact, not a member`);
  }

  /* Emergency contacts. A contact with no dialable number is NOT written as a contact — the
     column is NOT NULL and the old importer filled it with 'N/A', which an operator would then
     be handed mid-SOS. The name is kept as a note so the information is not lost, and the gap
     is a warning a human can act on. */
  const contacts: ContactInsert[] = [];
  const contactsWithoutPhone: string[] = [];
  for (const c of row.contacts) {
    if (!c.phone) {
      contactsWithoutPhone.push(`${c.contactName} (${c.relationship})`);
      continue;
    }
    contacts.push({
      contact_name: c.contactName,
      relationship: c.relationship,
      phone: c.phone,
      priority_order: c.priorityOrder,
      is_primary: c.contactType === "emergency" && contacts.length === 0,
      contact_type: c.contactType,
    });
  }
  if (contactsWithoutPhone.length > 0) {
    warnings.push(
      `${contactsWithoutPhone.length} contact(s) had a name but no usable number — kept as a note, not as an emergency contact`
    );
    notes.push(`CRM contacts with no phone number: ${contactsWithoutPhone.join("; ")}`);
  }

  /* The device. `devices.sim_phone_number` is NOT NULL and the old importer wrote 'TBD'. A
     pendant with a made-up SIM number is a pendant nobody can reach. No SIM, no device row —
     the IMEI goes into a note so the hardware is still traceable. */
  let device: DeviceInsert | null = null;
  if (row.device?.imei) {
    if (row.device.sim_phone_number) {
      const deviceNotes = [row.device.notes, row.device.docking_station_mac
        ? `docking station MAC ${row.device.docking_station_mac}`
        : null].filter(Boolean).join(" · ");
      device = {
        imei: row.device.imei,
        sim_phone_number: row.device.sim_phone_number,
        // NOT 'active'. A device is active once somebody has pressed it and an operator
        // answered (FULFILMENT_MODEL.md §2 `tested`); an import has witnessed neither.
        status: "in_stock",
        notes: deviceNotes || null,
      };
    } else {
      warnings.push(
        `pendant IMEI ${row.device.imei} has no SIM number in the CRM — recorded as a note, no device row created`
      );
      notes.push(
        [`Pendant IMEI ${row.device.imei} (no SIM number in CRM)`, row.device.docking_station_mac
          ? `docking station MAC ${row.device.docking_station_mac}`
          : null].filter(Boolean).join(" · ")
      );
    }
  }

  /* Membership type, payment type and date joined USED TO BE A NOTE, because `crm_profiles` had
     no column for any of them. They have columns now (Lee's ruling, D-19 item 1), so the note is
     no longer written.
     THE NOTE IS NOT DELETED for rows already imported: the migration's backfill lifts the values
     out of it into the new columns and leaves the note where it is. It is the only copy if a
     backfill pattern turned out to be wrong, and it is what a human reads on the record. So the
     import stops ADDING notes rather than starting to remove them — an import that deletes is an
     import nobody can run twice with confidence. */

  /* Spouse: a note, and only a note. Same stable prefix as the membership note so a re-run
     recognises it rather than adding a second copy. */
  if (row.spouse) notes.push(`Spouse: ${row.spouse}`);

  if (row.notes) notes.push(row.notes);

  const outcome: RowOutcome = blockers.length === 0 ? "member" : "crm_contact";

  return {
    sourceId: row.sourceId,
    outcome,
    blockers,
    warnings,
    member:
      outcome === "member"
        ? {
            first_name: m.first_name,
            last_name: m.last_name,
            email: m.email,
            email_owner: m.email_owner,
            phone: m.phone as string,
            date_of_birth: m.date_of_birth as string,
            address_line_1: m.address_line_1 as string,
            city: m.city as string,
            province: m.province as string,
            postal_code: m.postal_code as string,
            country: m.country || "Spain",
            address_line_2: m.address_line_2,
            status: IMPORTED_MEMBER_STATUS,
            billing_source: IMPORTED_BILLING_SOURCE,
            special_instructions: m.special_instructions,
            nie_dni: m.nie_dni,
            gender: m.gender,
            nationality: m.nationality,
            passport_number: m.passport_number,
            crm_source: m.crm_source,
            crm_source_id: m.crm_source_id,
            legacy_billing_day: m.legacy_billing_day,
            legacy_next_renewal: m.legacy_next_renewal,
            home_lat: m.home_lat,
            home_lng: m.home_lng,
            // Never a source without a coordinate: the CHECK constraint refuses it, and a
            // "location" that is only a provenance is a claim about nothing.
            home_location_source: m.home_lat !== null && m.home_lng !== null ? "imported" : null,
            home_location_set_at: null,
          }
        : null,
    parsedMember: {
      first_name: m.first_name,
      last_name: m.last_name,
      email: m.email,
      email_owner: m.email_owner,
      phone: m.phone,
      date_of_birth: m.date_of_birth,
      address_line_1: m.address_line_1,
      city: m.city,
      province: m.province,
      postal_code: m.postal_code,
      legacy_billing_day: m.legacy_billing_day,
      legacy_next_renewal: m.legacy_next_renewal,
    },
    /* Parsed regardless of outcome, and that is deliberate.
       These were conditioned on `outcome === "member"` in the first draft, which zeroed the
       contacts and the device for every row that could not become a member — the majority of
       the file. The preview then showed an admin nothing for exactly the rows they most need to
       look at, and the reason ("no email") looked like the row held no data at all.
       The plan describes what was FOUND; `applyRowPlan` decides what can be WRITTEN. */
    medical: row.medical as Record<string, unknown> | null,
    contacts,
    contactsWithoutPhone,
    device,
    extraPhones: row.extraPhones,
    extraEmails: row.extraEmails,
    notes,
    /* Exactly the columns `crm_profiles` has. A key with no column fails the whole insert,
       and PostgREST reports it as the row failing rather than as the key being wrong. */
    crmProfile: {
      stage: row.crmProfile.stage,
      // The verbatim Karma status. This is the ONLY place it lands: it never becomes
      // members.status and never becomes a subscription.
      status: row.crmProfile.status,
      referral_source: row.crmProfile.referral_source,
      tags: row.crmProfile.tags,
      groups: row.crmProfile.groups,
      /* The three legacy membership facts, in their own columns since
         20260910150000_crm_profile_legacy_membership. Verbatim on purpose: this is what KARMA
         said, not what this platform has ever charged. They are on `crm_profiles` and not on
         `subscriptions` because a subscriptions row means a billing relationship this system
         owns, and golden rule 4 exists because that distinction decides whether somebody is
         treated as paying. */
      legacy_membership_type: row.subscription?.legacy_membership_label ?? null,
      legacy_payment_type: row.subscription?.payment_arrangement ?? null,
      legacy_date_joined: row.subscription?.start_date ?? null,
    },
    emailContactConsent: row.emailContactConsent,
  };
}

export interface PlanSummary {
  total: number;
  members: number;
  crmContacts: number;
  skipped: number;
  contactsCreated: number;
  contactsDroppedNoPhone: number;
  devicesCreated: number;
  /** Reason -> how many rows it blocked. The answer to "why is this not a member?" at scale. */
  blockerCounts: Record<string, number>;
}

export function summarisePlans(plans: RowPlan[]): PlanSummary {
  const blockerCounts: Record<string, number> = {};
  for (const p of plans) {
    for (const b of p.blockers) blockerCounts[b] = (blockerCounts[b] ?? 0) + 1;
  }
  return {
    total: plans.length,
    members: plans.filter((p) => p.outcome === "member").length,
    crmContacts: plans.filter((p) => p.outcome === "crm_contact").length,
    skipped: plans.filter((p) => p.outcome === "skip").length,
    contactsCreated: plans.reduce((n, p) => n + p.contacts.length, 0),
    contactsDroppedNoPhone: plans.reduce((n, p) => n + p.contactsWithoutPhone.length, 0),
    devicesCreated: plans.filter((p) => p.device !== null).length,
    blockerCounts,
  };
}

/**
 * The preview, as CSV. Same plan the writer applies, so what the admin approved is what happens.
 */
export function plansToCsv(plans: RowPlan[]): string {
  const header = [
    "source_id", "outcome", "why_not_member", "warnings",
    "first_name", "last_name", "email", "phone", "date_of_birth",
    "address_line_1", "city", "province", "postal_code",
    "extra_phones", "emergency_contacts", "contacts_without_phone", "imei",
  ];
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = plans.map((p) =>
    [
      p.sourceId,
      p.outcome,
      p.blockers.join("; "),
      p.warnings.join("; "),
      p.parsedMember.first_name,
      p.parsedMember.last_name,
      p.parsedMember.email ?? "",
      p.parsedMember.phone ?? "",
      p.parsedMember.date_of_birth ?? "",
      p.parsedMember.address_line_1 ?? "",
      p.parsedMember.city ?? "",
      p.parsedMember.province ?? "",
      p.parsedMember.postal_code ?? "",
      p.extraPhones.join("; "),
      p.contacts.map((c) => `${c.contact_name} (${c.relationship}) ${c.phone}`).join("; "),
      p.contactsWithoutPhone.join("; "),
      p.device?.imei ?? "",
    ].map((v) => cell(String(v)))
  );
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ *
 * The admin's one choice
 * ------------------------------------------------------------------ */

/**
 * Whether rows that cannot become members are kept as CRM contacts.
 *
 * The default is to keep them, and the reason is the 317 rows that hold an address but no email:
 * dropping them loses the record of WHY they are not members, which is the only thing that makes
 * the gap fixable. `members_only` exists for the admin who wants a first pass of the complete
 * records and nothing else.
 */
export type ImportMode = "members_only" | "members_and_contacts";

/**
 * Applied to the plan rather than to the writer, so THE PREVIEW SHOWS THE MODE. A mode read
 * only at write time means the preview says "CRM contact" for a row the import then skips, and
 * the whole point of item 4 is that the screen and the write cannot disagree.
 */
export function applyMode(plan: RowPlan, mode: ImportMode): RowPlan {
  if (mode !== "members_only" || plan.outcome !== "crm_contact") return plan;
  return {
    ...plan,
    outcome: "skip",
    blockers: [...plan.blockers, "import mode is members only"],
  };
}

/* ------------------------------------------------------------------ *
 * Dedupe and re-run
 * ------------------------------------------------------------------ */

/**
 * The three ways a row can turn out to be somebody the platform already has.
 *
 * Email alone is not enough. Most of Lee's clients have no email at all (members.email is
 * UNIQUE NOT NULL, which is its own problem), and the ones who do sometimes share a household
 * address. Phone alone is not enough either: a couple on one landline are two members. So all
 * three are tried, and the FIRST match wins in this order — NIE is a government identifier and
 * the strongest claim, email next, phone last because it is the most shared.
 */
export interface DedupeKeys {
  nie: string | null;
  email: string | null;
  phone: string | null;
}

export function dedupeKeysFor(plan: RowPlan): DedupeKeys {
  return {
    nie: normaliseNie(plan.member?.nie_dni ?? null),
    /*
     * A CARER'S ADDRESS IS NOT A DEDUPE KEY, and this is the one line that stops the worst
     * outcome of item 3.
     *
     * One daughter looking after both her parents gives the same address on both rows. Keyed on
     * email, the second row would MATCH THE FIRST and the import would patch her father's
     * details onto her mother's record — one member where there are two, with one set of
     * emergency contacts and one pendant between them. An SOS from the other pendant then
     * resolves to a person it is not.
     *
     * `resolveSharedEmails` has already marked every address that appears more than once in the
     * file, so by the time a plan exists the question is answered. Only an address the MEMBER
     * owns is a key.
     */
    email:
      plan.parsedMember.email && plan.parsedMember.email_owner === "member"
        ? plan.parsedMember.email.trim().toLowerCase()
        : null,
    phone: plan.parsedMember.phone ?? null,
  };
}

/**
 * NIE/DNI compared without punctuation or case: "X-1234567-L", "x1234567l" and "X1234567L" are
 * one person. Matching them as raw strings would let the same client in three times.
 */
export function normaliseNie(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return v || null;
}

/**
 * The patch to apply to a member the import has matched: FILL EMPTY FIELDS ONLY.
 *
 * Never overwrite. The platform's own record is the one a human has been maintaining — a staff
 * member who corrected a misspelled street or a wrong date of birth must not have the CRM's
 * older value written back over it the next time somebody runs the import. The CRM is a source
 * of things we are MISSING, not a source of truth about things we already have.
 *
 * "Empty" means null, undefined or a blank string. It deliberately does NOT mean the
 * placeholders the old importer left behind ('N/A', 'TBD', `imported-…@placeholder.local`): if
 * those exist in production they are real values in the column, and deciding to overwrite them
 * is a data-cleanup job with a human looking at it, not something an import should do quietly.
 */
export function computeEmptyOnlyPatch(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (value === null || value === undefined || value === "") continue;
    const current = existing[key];
    const isEmpty = current === null || current === undefined || current === "";
    if (isEmpty) patch[key] = value;
  }
  return patch;
}

/**
 * Columns the import must never touch on an existing member, even when they are empty.
 *
 * `status` is golden rule 4: only the payment webhook moves it, so an import that filled an
 * empty status would be activating somebody. `id` and the timestamps are not the import's
 * business either.
 */
const NEVER_PATCH = new Set([
  "id",
  "status",
  /*
    `billing_source` belongs here for the same reason as `status`, and the omission was caught by
    a test rather than by reading it: filling it on a member the platform ALREADY HOLDS would
    flip a Stripe-paying member to `legacy` — and a legacy member is exempt from renewal and
    dunning, so the platform would quietly stop chasing money it is owed. The CRM knows what
    Karma billed; it knows nothing about what this platform bills.
  */
  "billing_source",
  "created_at",
  "updated_at",
  "user_id",
  /*
    THE HOME PIN IS CREATE-ONLY, and this is not caution for its own sake — the database refuses
    the alternative.
    `guard_member_home_location()` (20260910140000, extended to INSERT by 20260911102350)
    constrains the source by ACTOR AND BY VERB: a staff UPDATE of the pin may claim `staff_pin`
    or `geocoded` and nothing else, while a staff INSERT may additionally claim `imported` —
    which is this path, and the only path, creating the row. So the CREATE below succeeds and a
    patch carrying `home_location_source = 'imported'` RAISES. Measured against the real trigger
    in the RLS harness, not guessed.
    And the rule the trigger is expressing is the right one for this path anyway. Filling an
    empty pin on a member the platform ALREADY HOLDS, from a spreadsheet, is putting an
    unconfirmed coordinate on a record an operator will be sent to — while
    `computeEmptyOnlyPatch` cannot see that the member has since confirmed a different door and
    the CRM row is three years stale. A new member's row carries the imported pin because there
    is nothing better; an existing member's is left alone. Backfilling those is a deliberate
    service-role job with somebody watching, not a side effect of a re-run.
  */
  "home_lat",
  "home_lng",
  "home_location_source",
  "home_location_set_at",
]);

/**
 * The patch source is `member` when the row can be one, and `parsedMember` when it cannot.
 *
 * The `if (!plan.member) return {}` version of this function made `applyRowPlan`'s "patch the
 * matched member rather than shadowing them with a CRM contact" branch a no-op: a crm_contact
 * plan has no MemberInsert by construction, so the branch always reported `unchanged` and threw
 * away every field it had just parsed. That is the case it exists for — a client the platform
 * already holds whose Karma row has lost its email. The row cannot CREATE a member, which is a
 * different question from whether it can fill in a gap on one that already exists.
 *
 * `parsedMember` is safe to patch from for the same reason `member` is: its values have been
 * through the same parsers (E.164 phone, unambiguous ISO date, Home* address block). It is
 * merely incomplete, and empty-only patching does not care.
 */
export function memberPatchFor(
  existing: Record<string, unknown>,
  plan: RowPlan
): Record<string, unknown> {
  const desired: Record<string, unknown> = { ...(plan.member ?? plan.parsedMember) };
  for (const k of NEVER_PATCH) delete desired[k];
  return computeEmptyOnlyPatch(existing, desired);
}

/* ------------------------------------------------------------------ *
 * Applying a plan
 * ------------------------------------------------------------------ */

/**
 * The database, as narrowly as this module needs it.
 *
 * A seam rather than the supabase client itself, so every decision in `applyRowPlan` — did we
 * match, do we insert or patch, do we skip a contact we already have — is testable against a
 * fake that records what it was asked to do. Mocking the real client's chained builder proves
 * that the chain was called, which is not the same as proving the right rows were written.
 */
export interface ImportDb {
  findMemberByKeys(keys: DedupeKeys): Promise<{ id: string; row: Record<string, unknown> } | null>;
  insertMember(row: MemberInsert): Promise<string>;
  patchMember(id: string, patch: Record<string, unknown>): Promise<void>;
  /** Phones already on this member's contact list, normalised, so a re-run adds none twice. */
  existingContactPhones(memberId: string): Promise<string[]>;
  /** Every value already in `member_contact_methods` for this member, phone or email. */
  existingContactMethodValues(memberId: string): Promise<string[]>;
  insertContactMethod(memberId: string, method: ContactMethodInsert): Promise<void>;
  insertContact(memberId: string, contact: ContactInsert): Promise<void>;
  /** True when this member already has a row for the email channel, opted in or not. */
  hasEmailOptIn(memberId: string): Promise<boolean>;
  insertEmailOptIn(memberId: string): Promise<void>;
  hasMedical(memberId: string): Promise<boolean>;
  insertMedical(memberId: string, medical: Record<string, unknown>): Promise<void>;
  deviceExists(imei: string): Promise<boolean>;
  insertDevice(memberId: string, device: DeviceInsert): Promise<void>;
  noteExists(memberId: string, content: string): Promise<boolean>;
  insertNote(memberId: string, content: string): Promise<void>;
  upsertCrmProfile(memberId: string, profile: Record<string, unknown>): Promise<void>;
  insertCrmContact(plan: RowPlan): Promise<string>;
  /**
   * Takes the whole plan rather than the dedupe keys: `crm_contacts` also carries `source_id`,
   * which is the strongest re-run guard there is for a row with no email and no NIE — the
   * majority of them. Keys alone would let the same Karma row in twice.
   */
  crmContactExists(plan: RowPlan): Promise<boolean>;
}

export type AppliedAction = "created" | "updated" | "unchanged" | "crm_contact" | "skipped";

export interface AppliedResult {
  sourceId: string;
  action: AppliedAction;
  memberId: string | null;
  /** Set only when this run created the CRM contact, so the audit row can point at it. */
  crmContactId: string | null;
  contactsCreated: number;
  contactsSkippedAlreadyPresent: number;
  contactMethodsCreated: number;
  deviceCreated: boolean;
  medicalCreated: boolean;
  emailOptInCreated: boolean;
  notesCreated: number;
  /** Non-fatal problems. A row that half-wrote says so rather than reporting success. */
  problems: string[];
}

/**
 * Write one planned row.
 *
 * Everything here is guarded so a SECOND RUN OF THE SAME FILE CHANGES NOTHING — the requirement
 * that makes Lee's one-row test safe. The guards are on the data, not on a "have I run this
 * batch before" flag: a flag is wrong the moment somebody re-exports the file with one row
 * edited, which is exactly how this will actually be used.
 */
export async function applyRowPlan(db: ImportDb, plan: RowPlan): Promise<AppliedResult> {
  const result: AppliedResult = {
    sourceId: plan.sourceId,
    action: "skipped",
    memberId: null,
    crmContactId: null,
    contactsCreated: 0,
    contactsSkippedAlreadyPresent: 0,
    contactMethodsCreated: 0,
    deviceCreated: false,
    medicalCreated: false,
    emailOptInCreated: false,
    notesCreated: 0,
    problems: [],
  };

  if (plan.outcome === "skip") return result;

  const keys = dedupeKeysFor(plan);
  const existing = await db.findMemberByKeys(keys);

  if (plan.outcome === "crm_contact") {
    // A row that cannot be a member may still be somebody we already hold as a member — a
    // client whose CRM row has lost its email, say. Patching what we can is better than
    // creating a CRM contact that shadows a real member record.
    if (existing) {
      const patch = memberPatchFor(existing.row, plan);
      if (Object.keys(patch).length > 0) {
        await db.patchMember(existing.id, patch);
        result.action = "updated";
      } else {
        result.action = "unchanged";
      }
      result.memberId = existing.id;
      return result;
    }
    if (await db.crmContactExists(plan)) {
      result.action = "unchanged";
      return result;
    }
    result.crmContactId = await db.insertCrmContact(plan);
    result.action = "crm_contact";
    return result;
  }

  /* ---- a member ---- */
  let memberId: string;
  if (existing) {
    memberId = existing.id;
    const patch = memberPatchFor(existing.row, plan);
    if (Object.keys(patch).length > 0) {
      await db.patchMember(memberId, patch);
      result.action = "updated";
    } else {
      result.action = "unchanged";
    }
  } else {
    memberId = await db.insertMember(plan.member as MemberInsert);
    result.action = "created";
  }
  result.memberId = memberId;

  /* Contacts, matched by phone. Comparing by NAME would add a second row every time somebody
     fixed a spelling in the CRM; the phone is the part an operator actually uses. */
  const already = new Set(await db.existingContactPhones(memberId));
  for (const c of plan.contacts) {
    if (already.has(c.phone)) {
      result.contactsSkippedAlreadyPresent += 1;
      continue;
    }
    await db.insertContact(memberId, c);
    already.add(c.phone);
    result.contactsCreated += 1;
  }

  /* The member's own other numbers and addresses. Deduped on the VALUE: a re-run of the same
     file must not give somebody the same second number twice, and an operator reading three
     copies of one number down the escalation list wastes the seconds this product exists to
     save. */
  const heldMethods = new Set(await db.existingContactMethodValues(memberId));
  for (const value of plan.extraPhones) {
    if (heldMethods.has(value)) continue;
    await db.insertContactMethod(memberId, { type: "phone", value, label: "CRM import" });
    heldMethods.add(value);
    result.contactMethodsCreated += 1;
  }
  for (const value of plan.extraEmails) {
    if (heldMethods.has(value)) continue;
    await db.insertContactMethod(memberId, { type: "email", value, label: "CRM import" });
    heldMethods.add(value);
    result.contactMethodsCreated += 1;
  }

  /* Consent. NEVER overwritten: a member who has since said no keeps saying no, whatever the
     CRM export still holds. That is why the guard is "has a row at all" rather than "has an
     opted-in row" — flipping a recorded refusal back to yes on a re-import is the one thing
     this must not do. */
  if (plan.emailContactConsent && !(await db.hasEmailOptIn(memberId))) {
    await db.insertEmailOptIn(memberId);
    result.emailOptInCreated = true;
  }

  if (plan.medical && !(await db.hasMedical(memberId))) {
    await db.insertMedical(memberId, plan.medical);
    result.medicalCreated = true;
  }

  if (plan.device) {
    // devices.imei is UNIQUE, so a second insert would throw rather than duplicate. Checking
    // first turns that into a skip, which is what a re-run should be.
    if (await db.deviceExists(plan.device.imei)) {
      result.problems.push(`device ${plan.device.imei} already exists — left as it is`);
    } else {
      await db.insertDevice(memberId, plan.device);
      result.deviceCreated = true;
    }
  }

  for (const note of plan.notes) {
    if (await db.noteExists(memberId, note)) continue;
    await db.insertNote(memberId, note);
    result.notesCreated += 1;
  }

  await db.upsertCrmProfile(memberId, plan.crmProfile);

  return result;
}
