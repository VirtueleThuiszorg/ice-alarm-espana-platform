/**
 * `ImportDb`, over Supabase.
 *
 * Every decision the import makes lives in `crmImportWriter.ts` and is tested against a fake.
 * This file is the other half: the queries, and nothing else. It contains no judgement about
 * whether a row is a member, whether to patch or insert, or what a device's status should be —
 * if a decision appears here it is in the wrong place, because here it cannot be tested without
 * a database.
 *
 * The payload builders are exported separately from the client wiring for the same reason. What
 * goes into `crm_import_rows.raw` is the one thing in this file that MUST be asserted — the
 * redacted columns must not reach it — and a pure function is the only way to assert it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MappedRow } from "./iceCrmImport";
import {
  dedupeKeysFor,
  normaliseNie,
  type ContactInsert,
  type ContactMethodInsert,
  type DedupeKeys,
  type DeviceInsert,
  type ImportDb,
  type MemberInsert,
  type RowPlan,
} from "./crmImportWriter";
import {
  HISTORY_SOURCE,
  type HistoryDb,
  type HistoryOwner,
  type NoteRow,
  type TaskRow,
} from "./karmaHistoryWriter";

type Client = SupabaseClient<Database>;

/* ------------------------------------------------------------------ *
 * Payloads
 * ------------------------------------------------------------------ */

/**
 * One row of the import audit trail.
 *
 * `raw` is `MappedRow.raw`, which OMITS the redacted headers rather than blanking them — see
 * `IceRow.raw()`. That is the requirement stated as a table: card details, bank numbers, private
 * medical details and funeral wishes never reach `crm_import_rows.raw`. Passed through here
 * untouched precisely so there is one place it comes from; a second construction of the raw
 * object is a second chance to include everything.
 */
export function importRowPayload(
  batchId: string,
  rowIndex: number,
  row: MappedRow,
  plan: RowPlan
) {
  return {
    batch_id: batchId,
    row_index: rowIndex,
    raw: row.raw,
    dedupe_key: `karmacrm:${row.sourceId}`,
    parsed_first_name: row.member.first_name || null,
    parsed_last_name: row.member.last_name || null,
    parsed_full_name:
      [row.member.first_name, row.member.last_name].filter(Boolean).join(" ") || null,
    parsed_email_primary: row.member.email,
    parsed_phone_primary: row.member.phone,
    parsed_status: row.crmProfile.status,
    parsed_stage: row.crmProfile.stage,
    parsed_referral_source: row.crmProfile.referral_source,
    parsed_city: row.member.city,
    parsed_postal_code: row.member.postal_code,
    parsed_country: row.member.country || null,
    parsed_membership_type: row.subscription?.legacy_membership_label ?? null,
    parsed_device_imei: row.device?.imei ?? null,
    parsed_notes: row.notes,
    // The plan's outcome, not the mapper's target: 'skip' here means this import will not write
    // the row, whatever Karma called it.
    import_target:
      plan.outcome === "member"
        ? ("member" as const)
        : plan.outcome === "crm_contact"
          ? ("crm_contact" as const)
          : ("skip" as const),
    import_status: "pending" as const,
  };
}

/**
 * A CRM contact: the row we could not represent as a member, with the reason attached.
 *
 * The reason is the payload's whole purpose. A CRM contact with no `notes` is a name in a list;
 * one that says "no email, no date of birth" is a job somebody can finish.
 */
export function crmContactPayload(plan: RowPlan) {
  const p = plan.parsedMember;
  const reason = plan.blockers.length > 0 ? `Not imported as a member: ${plan.blockers.join(", ")}.` : null;
  /* `crm_contacts` has one phone column and one email column, and 338 rows hold several numbers.
     The rest go in the notes rather than nowhere: they are the numbers somebody rings when the
     first does not answer, and they are the whole reason this row is worth keeping. The
     emergency contacts go the same way for the same reason — the table has no column for them,
     and a name with a number is the most useful thing on a row that is not yet a member. */
  const extras = [
    plan.extraPhones.length > 0 ? `Other numbers: ${plan.extraPhones.join(", ")}` : null,
    plan.extraEmails.length > 0 ? `Other emails: ${plan.extraEmails.join(", ")}` : null,
    plan.contacts.length > 0
      ? `Contacts: ${plan.contacts.map((c) => `${c.contact_name} (${c.relationship}) ${c.phone}`).join("; ")}`
      : null,
  ].filter(Boolean);
  const notes = [reason, ...extras, ...plan.notes, ...plan.warnings.map((w) => `Warning: ${w}`)]
    .filter(Boolean)
    .join("\n");
  return {
    source: "karmacrm",
    source_id: plan.sourceId,
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    full_name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
    email_primary: p.email,
    phone_primary: p.phone,
    status: (plan.crmProfile.status as string | null) ?? null,
    stage: (plan.crmProfile.stage as string | null) ?? null,
    referral_source: (plan.crmProfile.referral_source as string | null) ?? null,
    address_line_1: p.address_line_1,
    city: p.city,
    province: p.province,
    postal_code: p.postal_code,
    notes: notes || null,
  };
}

/* ------------------------------------------------------------------ *
 * The queries
 * ------------------------------------------------------------------ */

const MEMBER_COLUMNS =
  "id, first_name, last_name, email, phone, date_of_birth, address_line_1, address_line_2, city, province, postal_code, country, nie_dni, gender, nationality, passport_number, special_instructions, status, crm_source, crm_source_id";

/** The national form of a Spanish E.164 number, for matching rows stored before normalisation. */
function phoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone]);
  const es = phone.match(/^\+34(\d{9})$/);
  if (es) {
    variants.add(es[1]);
    variants.add(`0034${es[1]}`);
    variants.add(`34${es[1]}`);
  }
  return [...variants];
}

export function createSupabaseImportDb(client: Client): ImportDb {
  return {
    /**
     * NIE, then email, then phone — the order `dedupeKeysFor` documents, as three queries rather
     * than one `.or()`. Three round-trips is the cost of knowing WHICH key matched, and of not
     * building a PostgREST filter string out of user-supplied emails.
     *
     * The NIE query fetches a superset (`ilike` on the digit run) and `normaliseNie` decides, so
     * "X-1234567-L" in the CRM matches "x1234567l" in the platform. The comparison itself is the
     * same function the tests cover; the query only has to not miss the row.
     */
    async findMemberByKeys(keys: DedupeKeys) {
      if (keys.nie) {
        const digits = keys.nie.replace(/\D/g, "");
        if (digits.length >= 5) {
          const { data } = await client
            .from("members")
            .select(MEMBER_COLUMNS)
            .ilike("nie_dni", `%${digits}%`)
            .limit(25);
          const hit = (data ?? []).find(
            (m) => normaliseNie((m as { nie_dni: string | null }).nie_dni) === keys.nie
          );
          if (hit) return { id: (hit as { id: string }).id, row: hit as Record<string, unknown> };
        }
      }
      if (keys.email) {
        const { data } = await client
          .from("members")
          .select(MEMBER_COLUMNS)
          .ilike("email", keys.email)
          .limit(2);
        const hit = (data ?? []).find(
          (m) => String((m as { email: string }).email ?? "").toLowerCase() === keys.email
        );
        if (hit) return { id: (hit as { id: string }).id, row: hit as Record<string, unknown> };
      }
      if (keys.phone) {
        const { data } = await client
          .from("members")
          .select(MEMBER_COLUMNS)
          .in("phone", phoneVariants(keys.phone))
          .limit(2);
        const hit = (data ?? [])[0];
        if (hit) return { id: (hit as { id: string }).id, row: hit as Record<string, unknown> };
      }
      return null;
    },

    async insertMember(row: MemberInsert) {
      const { data, error } = await client
        .from("members")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async patchMember(id: string, patch: Record<string, unknown>) {
      const { error } = await client.from("members").update(patch).eq("id", id);
      if (error) throw error;
    },

    async existingContactPhones(memberId: string) {
      const { data } = await client
        .from("emergency_contacts")
        .select("phone")
        .eq("member_id", memberId);
      return (data ?? []).map((c) => c.phone);
    },

    async insertContact(memberId: string, contact: ContactInsert) {
      const { error } = await client.from("emergency_contacts").insert({
        member_id: memberId,
        contact_name: contact.contact_name,
        relationship: contact.relationship,
        phone: contact.phone,
        priority_order: contact.priority_order,
        is_primary: contact.is_primary,
        contact_type: contact.contact_type,
        recorded_via: "crm_import",
      });
      if (error) throw error;
    },

    async existingContactMethodValues(memberId: string) {
      const { data } = await client
        .from("member_contact_methods")
        .select("value")
        .eq("member_id", memberId);
      return (data ?? []).map((m) => m.value);
    },

    async insertContactMethod(memberId: string, method: ContactMethodInsert) {
      const { error } = await client.from("member_contact_methods").insert({
        member_id: memberId,
        type: method.type,
        value: method.value,
        label: method.label,
        // `is_primary` is what members.phone already says. A second number claiming to be
        // primary is a second answer to "which number do we ring first".
        is_primary: false,
      });
      if (error) throw error;
    },

    async hasEmailOptIn(memberId: string) {
      const { data } = await client
        .from("member_notification_optin")
        .select("id")
        .eq("member_id", memberId)
        .eq("channel", "email")
        .limit(1);
      return (data ?? []).length > 0;
    },

    async insertEmailOptIn(memberId: string) {
      const { error } = await client.from("member_notification_optin").insert({
        member_id: memberId,
        channel: "email",
        opted_in: true,
        // The table refuses an opted-in row with no timestamp, and rightly: consent with no
        // date is a claim nobody can defend. The date is the import's, not the CRM's — we know
        // when we read the column, not when the member was asked.
        opted_in_at: new Date().toISOString(),
        // Not `member_self`. Nobody watched this member say yes; a spreadsheet did.
        basis: "staff_recorded",
      });
      if (error) throw error;
    },

    async hasMedical(memberId: string) {
      const { data } = await client
        .from("medical_information")
        .select("member_id")
        .eq("member_id", memberId)
        .maybeSingle();
      return data !== null;
    },

    async insertMedical(memberId: string, medical: Record<string, unknown>) {
      const { error } = await client
        .from("medical_information")
        .insert({ member_id: memberId, ...medical, recorded_via: "crm_import" } as never);
      if (error) throw error;
    },

    async deviceExists(imei: string) {
      const { data } = await client.from("devices").select("id").eq("imei", imei).maybeSingle();
      return data !== null;
    },

    async insertDevice(memberId: string, device: DeviceInsert) {
      const { error } = await client.from("devices").insert({
        member_id: memberId,
        imei: device.imei,
        sim_phone_number: device.sim_phone_number,
        status: device.status,
        notes: device.notes,
      });
      if (error) throw error;
    },

    async noteExists(memberId: string, content: string) {
      const { data } = await client
        .from("member_notes")
        .select("id")
        .eq("member_id", memberId)
        .eq("content", content)
        .limit(1);
      return (data ?? []).length > 0;
    },

    async insertNote(memberId: string, content: string) {
      const { error } = await client.from("member_notes").insert({
        member_id: memberId,
        content,
        /*
         * 'general', NOT 'crm_import'.
         *
         * `member_notes.note_type` carries a CHECK constraint from the base migration —
         * ('general','medical','payment','support','followup','complaint') — and 'crm_import'
         * is not in it. So EVERY note this import tried to write was refused by Postgres, and
         * because `insertNote` throws, the whole row was then recorded as `failed` even though
         * the member had already been created. On Lee's file that is the IMEI-without-SIM notes,
         * the contacts-with-no-number notes and the Spouse hints — the notes that exist
         * precisely because the data could not be represented anywhere else.
         *
         * Caught by running the migration's backfill against a real PostgreSQL 16: the seeded
         * notes would not insert either, with the same constraint name. `crmImportNoteType`
         * now reads the allowed list out of the migration and asserts this value is in it, so
         * the next invented value fails a test rather than production.
         */
        note_type: "general",
      });
      if (error) throw error;
    },

    /**
     * `crm_profiles` is keyed on `member_id`, so this is an upsert rather than an insert — a
     * re-run writing the same values back is not a change, and it is how a profile that was
     * missing gets created on the second pass.
     */
    async upsertCrmProfile(memberId: string, profile: Record<string, unknown>) {
      const { error } = await client
        .from("crm_profiles")
        .upsert({ member_id: memberId, ...profile } as never, { onConflict: "member_id" });
      if (error) throw error;
    },

    async insertCrmContact(plan: RowPlan) {
      const { data, error } = await client
        .from("crm_contacts")
        .insert(crmContactPayload(plan))
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async crmContactExists(plan: RowPlan) {
      const bySource = await client
        .from("crm_contacts")
        .select("id")
        .eq("source", "karmacrm")
        .eq("source_id", plan.sourceId)
        .limit(1);
      if ((bySource.data ?? []).length > 0) return true;
      const keys = dedupeKeysFor(plan);
      if (keys.email) {
        const { data } = await client
          .from("crm_contacts")
          .select("id")
          .ilike("email_primary", keys.email)
          .limit(1);
        if ((data ?? []).length > 0) return true;
      }
      if (keys.phone) {
        const { data } = await client
          .from("crm_contacts")
          .select("id")
          .in("phone_primary", phoneVariants(keys.phone))
          .limit(1);
        if ((data ?? []).length > 0) return true;
      }
      return false;
    },
  };
}

/* ------------------------------------------------------------------ *
 * History (notes and courtesy calls)
 * ------------------------------------------------------------------ */

/**
 * `HistoryDb`, over Supabase. Same division as above: `karmaHistoryWriter.ts` holds every
 * decision, this holds the queries.
 *
 * The one thing worth saying here is why `resolveOwners` is two queries rather than a join.
 * A karmaCRM contact id can be on `members.crm_source_id` or on `crm_contacts.source_id` —
 * the contacts import puts the 121 live files in the first and the other 310 in the second —
 * and PostgREST has no union. Members are read second and overwrite, which is the precedence
 * `HistoryOwner` documents: once a contact has been converted the member row is the live file.
 */
export function createSupabaseHistoryDb(client: Client): HistoryDb {
  return {
    async resolveOwners(crmContactIds: string[]) {
      const owners = new Map<string, HistoryOwner>();
      if (crmContactIds.length === 0) return owners;

      const contacts = await client
        .from("crm_contacts")
        .select("id, source_id")
        .eq("source", HISTORY_SOURCE)
        .in("source_id", crmContactIds);
      if (contacts.error) throw contacts.error;
      for (const row of contacts.data ?? []) {
        if (row.source_id) owners.set(row.source_id, { kind: "crm_contact", id: row.id });
      }

      const members = await client
        .from("members")
        .select("id, crm_source_id")
        .eq("crm_source", HISTORY_SOURCE)
        .in("crm_source_id", crmContactIds);
      if (members.error) throw members.error;
      for (const row of members.data ?? []) {
        if (row.crm_source_id) owners.set(row.crm_source_id, { kind: "member", id: row.id });
      }

      return owners;
    },

    async existingNoteSourceIds(sourceIds: string[]) {
      if (sourceIds.length === 0) return new Set<string>();
      const { data, error } = await client
        .from("member_notes")
        .select("source_id")
        .eq("source", HISTORY_SOURCE)
        .in("source_id", sourceIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.source_id).filter((v): v is string => !!v));
    },

    async existingTaskSourceIds(sourceIds: string[]) {
      if (sourceIds.length === 0) return new Set<string>();
      const { data, error } = await client
        .from("tasks")
        .select("source_id")
        .eq("source", HISTORY_SOURCE)
        .in("source_id", sourceIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.source_id).filter((v): v is string => !!v));
    },

    async insertNotes(rows: NoteRow[]) {
      if (rows.length === 0) return;
      const { error } = await client.from("member_notes").insert(rows);
      if (error) throw error;
    },

    async insertTasks(rows: TaskRow[]) {
      if (rows.length === 0) return;
      const { error } = await client.from("tasks").insert(rows);
      if (error) throw error;
    },
  };
}
