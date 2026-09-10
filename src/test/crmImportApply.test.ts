// @vitest-environment node
//
// Writing the plan, and writing it twice.
//
// `applyRowPlan` is the only place in the import that touches the database, and the property it
// has to hold is the one Lee will exercise on day one: he imports David Evans alone to see what
// happens, then imports all 431 rows. The second run must find him, must not create a second
// record, and must not write the CRM's older values over anything a human has since corrected.
//
// A second David Evans is not a tidiness problem. `members.email` is UNIQUE so the duplicate
// would arrive under a different key — no email, or a different one — and an SOS from his
// pendant then resolves to whichever record the query finds first, carrying whichever set of
// emergency contacts that record happens to hold. One of the two would have none.
//
// The database here is a fake, and what it proves is bounded: it proves the DECISIONS in
// applyRowPlan (match or insert, patch or leave, skip a contact we already hold). It does not
// prove the real supabase queries in the page's adapter, which RLS and the isolation harness
// cover. The seam exists so those decisions can be asserted at all — mocking the real chained
// builder proves the chain was called, not that the right rows were written.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv } from "../lib/iceCrmImport";
import {
  planRowWrites,
  applyRowPlan,
  dedupeKeysFor,
  type RowPlan,
  type MemberInsert,
  type ContactInsert,
  type DedupeKeys,
  type ImportDb,
} from "../lib/crmImportWriter";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const plans = mapIceCsv(readFileSync(FIXTURE, "utf8")).map(planRowWrites);
const byId = (id: string): RowPlan => {
  const p = plans.find((x) => x.sourceId === id);
  if (!p) throw new Error(`no plan for ${id}`);
  return p;
};

/* ------------------------------------------------------------------ *
 * A fake database that records what it was asked to do
 * ------------------------------------------------------------------ */

interface FakeMember {
  id: string;
  row: Record<string, unknown>;
  contacts: ContactInsert[];
  medical: Record<string, unknown> | null;
  emailOptIn: boolean;
  contactMethods: { type: string; value: string }[];
  devices: { imei: string }[];
  notes: string[];
  crmProfile: Record<string, unknown> | null;
}

class FakeDb implements ImportDb {
  members: FakeMember[] = [];
  crmContacts: { keys: DedupeKeys; sourceId: string }[] = [];
  /** Every mutating call, in order. The re-run assertions are made against this. */
  writes: string[] = [];
  private seq = 0;

  /** Seed a member the platform already holds, as a human would have left it. */
  seedMember(row: Record<string, unknown>): FakeMember {
    const m: FakeMember = {
      id: `existing-${++this.seq}`,
      row: { ...row },
      contacts: [],
      medical: null,
      emailOptIn: false,
      contactMethods: [],
      devices: [],
      notes: [],
      crmProfile: null,
    };
    this.members.push(m);
    return m;
  }

  private find(keys: DedupeKeys): FakeMember | null {
    // NIE, then email, then phone — the order applyRowPlan documents. The fake mirrors it so a
    // test can tell which key matched.
    const norm = (v: unknown) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    if (keys.nie) {
      const hit = this.members.find((m) => m.row.nie_dni && norm(m.row.nie_dni) === keys.nie);
      if (hit) return hit;
    }
    if (keys.email) {
      const hit = this.members.find(
        (m) => String(m.row.email ?? "").toLowerCase() === keys.email
      );
      if (hit) return hit;
    }
    if (keys.phone) {
      const hit = this.members.find((m) => m.row.phone === keys.phone);
      if (hit) return hit;
    }
    return null;
  }

  private mustFind(id: string): FakeMember {
    const m = this.members.find((x) => x.id === id);
    if (!m) throw new Error(`fake db asked about unknown member ${id}`);
    return m;
  }

  async findMemberByKeys(keys: DedupeKeys) {
    const hit = this.find(keys);
    return hit ? { id: hit.id, row: { ...hit.row } } : null;
  }

  async insertMember(row: MemberInsert) {
    this.writes.push(`insertMember ${row.email}`);
    const m: FakeMember = {
      id: `new-${++this.seq}`,
      row: { ...row } as Record<string, unknown>,
      contacts: [],
      medical: null,
      emailOptIn: false,
      contactMethods: [],
      devices: [],
      notes: [],
      crmProfile: null,
    };
    this.members.push(m);
    return m.id;
  }

  async patchMember(id: string, patch: Record<string, unknown>) {
    this.writes.push(`patchMember ${id} ${Object.keys(patch).sort().join(",")}`);
    Object.assign(this.mustFind(id).row, patch);
  }

  async existingContactPhones(memberId: string) {
    return this.mustFind(memberId).contacts.map((c) => c.phone);
  }

  async insertContact(memberId: string, contact: ContactInsert) {
    this.writes.push(`insertContact ${memberId} ${contact.phone}`);
    this.mustFind(memberId).contacts.push(contact);
  }

  async existingContactMethodValues(memberId: string) {
    return this.mustFind(memberId).contactMethods.map((m) => m.value);
  }

  async insertContactMethod(memberId: string, method: { type: "phone" | "email"; value: string }) {
    this.writes.push(`insertContactMethod ${memberId} ${method.type} ${method.value}`);
    this.mustFind(memberId).contactMethods.push({ type: method.type, value: method.value });
  }

  async hasEmailOptIn(memberId: string) {
    return this.mustFind(memberId).emailOptIn;
  }

  async insertEmailOptIn(memberId: string) {
    this.writes.push(`insertEmailOptIn ${memberId}`);
    this.mustFind(memberId).emailOptIn = true;
  }

  async hasMedical(memberId: string) {
    return this.mustFind(memberId).medical !== null;
  }

  async insertMedical(memberId: string, medical: Record<string, unknown>) {
    this.writes.push(`insertMedical ${memberId}`);
    this.mustFind(memberId).medical = medical;
  }

  async deviceExists(imei: string) {
    return this.members.some((m) => m.devices.some((d) => d.imei === imei));
  }

  async insertDevice(memberId: string, device: { imei: string }) {
    this.writes.push(`insertDevice ${memberId} ${device.imei}`);
    this.mustFind(memberId).devices.push({ imei: device.imei });
  }

  async noteExists(memberId: string, content: string) {
    return this.mustFind(memberId).notes.includes(content);
  }

  async insertNote(memberId: string, content: string) {
    this.writes.push(`insertNote ${memberId}`);
    this.mustFind(memberId).notes.push(content);
  }

  async upsertCrmProfile(memberId: string, profile: Record<string, unknown>) {
    // An upsert by definition writes the same thing twice, so it is not counted as a change.
    this.mustFind(memberId).crmProfile = profile;
  }

  async insertCrmContact(plan: RowPlan) {
    this.writes.push(`insertCrmContact ${plan.sourceId}`);
    this.crmContacts.push({ keys: dedupeKeysFor(plan), sourceId: plan.sourceId });
    return `crm-${++this.seq}`;
  }

  async crmContactExists(plan: RowPlan) {
    const keys = dedupeKeysFor(plan);
    return this.crmContacts.some(
      (c) =>
        c.sourceId === plan.sourceId ||
        (keys.nie !== null && c.keys.nie === keys.nie) ||
        (keys.email !== null && c.keys.email === keys.email) ||
        (keys.phone !== null && c.keys.phone === keys.phone)
    );
  }

  /** The whole database as one comparable value, for "the second run changed nothing". */
  snapshot() {
    return JSON.stringify({
      members: this.members.map((m) => ({ ...m, id: m.id })),
      crmContacts: this.crmContacts,
    });
  }
}

/** The fake is only worth trusting if it can fail. */
describe("the fake database", () => {
  it("finds a seeded member by each of the three keys in turn", async () => {
    const db = new FakeDb();
    db.seedMember({ email: "a@example.com", phone: "+34600000001", nie_dni: "X-1234567-L" });
    expect(await db.findMemberByKeys({ nie: "X1234567L", email: null, phone: null })).not.toBeNull();
    expect(await db.findMemberByKeys({ nie: null, email: "a@example.com", phone: null })).not.toBeNull();
    expect(await db.findMemberByKeys({ nie: null, email: null, phone: "+34600000001" })).not.toBeNull();
    expect(await db.findMemberByKeys({ nie: null, email: null, phone: "+34699999999" })).toBeNull();
  });

  it("records every mutating call", async () => {
    const db = new FakeDb();
    await db.insertMember({ email: "b@example.com" } as MemberInsert);
    expect(db.writes).toEqual(["insertMember b@example.com"]);
  });
});

/* ------------------------------------------------------------------ *
 * A first run against an empty platform
 * ------------------------------------------------------------------ */

describe("importing into an empty platform", () => {
  it("creates the member and everything hanging off them", async () => {
    const db = new FakeDb();
    const result = await applyRowPlan(db, byId("9001"));
    expect(result.action).toBe("created");
    expect(result.memberId).not.toBeNull();
    expect(db.members.length).toBe(1);
    expect(db.members[0].row.email).toBe("sensitive.carrier@example.com");
    // Row 9001 carries the medical block (Penicillin allergy).
    expect(result.medicalCreated).toBe(true);
    expect(db.members[0].medical).not.toBeNull();
  });

  it("writes status 'pending_review' + billing_source 'legacy', never 'active' — golden rule 4", async () => {
    const db = new FakeDb();
    await applyRowPlan(db, byId("9001"));
    expect(db.members[0].row.status).toBe("pending_review");
    expect(db.members[0].row.billing_source).toBe("legacy");
    expect(db.snapshot()).not.toContain('"status":"active"');
  });

  it("creates the emergency contacts in the CRM's priority order", async () => {
    const db = new FakeDb();
    // 9004 has Contact 1-3; it lacks an email so it is a crm_contact, which would write no
    // contacts. Give it the one field it is missing and it is a member with three contacts.
    const plan = withEmail(byId("9004"), "smith.household@example.com");
    const result = await applyRowPlan(db, plan);
    expect(result.action).toBe("created");
    expect(result.contactsCreated).toBe(3);
    expect(db.members[0].contacts.map((c) => c.contact_name)).toEqual([
      "Susan Smith",
      "Peter Smith",
      "Dr Alvarez",
    ]);
    // Nobody is handed 'N/A' to dial.
    for (const c of db.members[0].contacts) {
      expect(c.phone).toMatch(/^\+\d{8,}$/);
    }
  });

  it("writes the CRM's verbatim status onto the CRM profile, not onto the member", async () => {
    const db = new FakeDb();
    await applyRowPlan(db, byId("9001"));
    expect(db.members[0].crmProfile?.status).toBe("Active Member");
    expect(db.members[0].row.status).toBe("pending_review");
    expect(db.members[0].row.billing_source).toBe("legacy");
  });

  it("makes no database call at all for an excluded row", async () => {
    const db = new FakeDb();
    const skipped: RowPlan = { ...byId("9001"), outcome: "skip" };
    const result = await applyRowPlan(db, skipped);
    expect(result.action).toBe("skipped");
    expect(db.writes).toEqual([]);
    expect(db.members).toEqual([]);
    expect(db.crmContacts).toEqual([]);
  });
});

/** A plan is a value, so the missing field can be supplied without touching the fixture. */
function withEmail(plan: RowPlan, email: string): RowPlan {
  return {
    ...plan,
    outcome: "member",
    blockers: [],
    parsedMember: { ...plan.parsedMember, email },
    member: {
      first_name: plan.parsedMember.first_name,
      last_name: plan.parsedMember.last_name,
      email,
      phone: plan.parsedMember.phone ?? "+34600000000",
      date_of_birth: plan.parsedMember.date_of_birth ?? "1940-01-01",
      address_line_1: plan.parsedMember.address_line_1 ?? "1 Calle Test",
      city: plan.parsedMember.city ?? "Torremolinos",
      province: plan.parsedMember.province ?? "Málaga",
      postal_code: plan.parsedMember.postal_code ?? "29620",
      country: "Spain",
      address_line_2: null,
      status: "pending_review",
      billing_source: "legacy",
      special_instructions: null,
      // No pin on this fixture row: the CRM cell is empty, so all four stay null together.
      home_lat: null,
      home_lng: null,
      home_location_source: null,
      home_location_set_at: null,
      nie_dni: null,
      gender: null,
      nationality: null,
      passport_number: null,
      crm_source: "karmacrm",
      crm_source_id: plan.sourceId,
    },
  };
}

/* ------------------------------------------------------------------ *
 * The second run
 * ------------------------------------------------------------------ */

describe("running the same import twice", () => {
  it("changes nothing the second time", async () => {
    const db = new FakeDb();
    for (const p of plans) await applyRowPlan(db, p);
    const afterFirst = db.snapshot();
    const writesAfterFirst = db.writes.length;
    expect(writesAfterFirst).toBeGreaterThan(0); // the run did something to be idempotent about

    for (const p of plans) await applyRowPlan(db, p);
    expect(db.snapshot()).toBe(afterFirst);
    expect(db.writes.slice(writesAfterFirst)).toEqual([]);
  });

  it("reports 'unchanged', not 'created', on the second pass", async () => {
    const db = new FakeDb();
    expect((await applyRowPlan(db, byId("9006"))).action).toBe("created");
    const second = await applyRowPlan(db, byId("9006"));
    expect(second.action).toBe("unchanged");
    expect(db.members.length).toBe(1);
  });

  it("does not duplicate David Evans after Lee's one-row test", async () => {
    // The one-row file and the full file are two different imports of the same person.
    const oneRow = new FakeDb();
    await applyRowPlan(oneRow, byId("9006"));
    for (const p of plans) await applyRowPlan(oneRow, p);
    expect(oneRow.members.filter((m) => m.row.email === "david.evans@example.com").length).toBe(1);
  });

  it("matches on NIE even when the CRM export has lost the email", async () => {
    const db = new FakeDb();
    await applyRowPlan(db, byId("9006"));
    const noEmail: RowPlan = {
      ...byId("9006"),
      parsedMember: { ...byId("9006").parsedMember, email: null },
    };
    const result = await applyRowPlan(db, noEmail);
    expect(db.members.length).toBe(1);
    expect(result.memberId).toBe(db.members[0].id);
  });

  it("adds no second emergency contact for a number already on the member", async () => {
    const db = new FakeDb();
    const plan = withEmail(byId("9004"), "smith.household@example.com");
    await applyRowPlan(db, plan);
    const second = await applyRowPlan(db, plan);
    expect(second.contactsCreated).toBe(0);
    expect(second.contactsSkippedAlreadyPresent).toBe(3);
    expect(db.members[0].contacts.length).toBe(3);
  });

  it("matches a contact by phone, not by name, so a corrected spelling adds nothing", async () => {
    const db = new FakeDb();
    const plan = withEmail(byId("9004"), "smith.household@example.com");
    await applyRowPlan(db, plan);
    // Karma is edited: "Susan Smith" becomes "Suzanne Smith". Same number, same person.
    const renamed: RowPlan = {
      ...plan,
      contacts: plan.contacts.map((c) =>
        c.contact_name === "Susan Smith" ? { ...c, contact_name: "Suzanne Smith" } : c
      ),
    };
    const result = await applyRowPlan(db, renamed);
    expect(result.contactsCreated).toBe(0);
    expect(db.members[0].contacts.length).toBe(3);
  });

  it("adds the member's other numbers once, not once per run", async () => {
    const db = new FakeDb();
    // 9002 is the multi-phone cell: several numbers separated by ";" with free text after.
    const plan = withEmail(byId("9002"), "multi.phone@example.com");
    expect(plan.extraPhones.length).toBeGreaterThan(0);
    const first = await applyRowPlan(db, plan);
    expect(first.contactMethodsCreated).toBe(plan.extraPhones.length + plan.extraEmails.length);
    const second = await applyRowPlan(db, plan);
    // Three copies of one number is three lines an operator reads before reaching a new one.
    expect(second.contactMethodsCreated).toBe(0);
    expect(db.members[0].contactMethods.length).toBe(first.contactMethodsCreated);
  });

  it("writes the medical record once, not once per run", async () => {
    const db = new FakeDb();
    expect((await applyRowPlan(db, byId("9001"))).medicalCreated).toBe(true);
    expect((await applyRowPlan(db, byId("9001"))).medicalCreated).toBe(false);
    expect(db.writes.filter((w) => w.startsWith("insertMedical")).length).toBe(1);
  });

  it("writes each note once", async () => {
    const db = new FakeDb();
    // 9003 carries the IMEI-without-SIM note. It has no email, so make it a member first.
    const plan = withEmail(byId("9003"), "imei.holder@example.com");
    expect(plan.notes.length).toBeGreaterThan(0);
    expect((await applyRowPlan(db, plan)).notesCreated).toBe(plan.notes.length);
    expect((await applyRowPlan(db, plan)).notesCreated).toBe(0);
  });

  it("leaves an existing device alone and says so rather than throwing on the UNIQUE imei", async () => {
    const db = new FakeDb();
    const plan: RowPlan = {
      ...withEmail(byId("9003"), "imei.holder@example.com"),
      device: {
        imei: "865513075018479",
        sim_phone_number: "+46719103171",
        status: "in_stock",
        notes: null,
      },
    };
    const first = await applyRowPlan(db, plan);
    expect(first.deviceCreated).toBe(true);
    const second = await applyRowPlan(db, plan);
    expect(second.deviceCreated).toBe(false);
    expect(second.problems.join(" ")).toContain("865513075018479");
    expect(db.members[0].devices.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Never overwriting a human's correction
 * ------------------------------------------------------------------ */

describe("an existing member the platform already holds", () => {
  const seedRow = () => ({
    email: "david.evans@example.com",
    first_name: "David",
    last_name: "Evans",
    phone: "+34655666777",
    // A staff member has corrected the street. Karma still has the old one.
    address_line_1: "12b Calle Corrected",
    city: "",
    province: "",
    postal_code: "",
    date_of_birth: "1948-03-02",
    status: "active",
  });

  it("fills the empty columns", async () => {
    const db = new FakeDb();
    db.seedMember(seedRow());
    const result = await applyRowPlan(db, byId("9006"));
    expect(result.action).toBe("updated");
    expect(db.members[0].row.city).not.toBe("");
    expect(db.members[0].row.postal_code).not.toBe("");
  });

  it("never writes over the corrected street", async () => {
    const db = new FakeDb();
    db.seedMember(seedRow());
    await applyRowPlan(db, byId("9006"));
    expect(db.members[0].row.address_line_1).toBe("12b Calle Corrected");
  });

  it("never touches status, even on a member whose status is empty", async () => {
    const db = new FakeDb();
    db.seedMember({ ...seedRow(), status: "" });
    await applyRowPlan(db, byId("9006"));
    // Filling an empty status would be the import activating somebody. Golden rule 4.
    expect(db.members[0].row.status).toBe("");
    expect(db.writes.some((w) => w.startsWith("patchMember") && w.includes("status"))).toBe(false);
  });

  it("does not create a member, so the platform still holds one David Evans", async () => {
    const db = new FakeDb();
    db.seedMember(seedRow());
    await applyRowPlan(db, byId("9006"));
    expect(db.members.length).toBe(1);
    expect(db.writes.some((w) => w.startsWith("insertMember"))).toBe(false);
  });

  it("reports 'unchanged' when the member is already complete", async () => {
    const db = new FakeDb();
    db.seedMember({
      ...seedRow(),
      city: "Torremolinos",
      province: "Málaga",
      postal_code: "29620",
      country: "Spain",
      nie_dni: "Y7654321X",
      gender: "Male",
      nationality: "British",
      crm_source: "karmacrm",
      crm_source_id: "9006",
      address_line_2: "-",
      special_instructions: "-",
      passport_number: "-",
    });
    const result = await applyRowPlan(db, byId("9006"));
    expect(result.action).toBe("unchanged");
    expect(db.writes.some((w) => w.startsWith("patchMember"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Rows that cannot be members
 * ------------------------------------------------------------------ */

describe("a row that cannot be a member", () => {
  it("becomes a CRM contact when the platform has never heard of them", async () => {
    const db = new FakeDb();
    const result = await applyRowPlan(db, byId("9002"));
    expect(result.action).toBe("crm_contact");
    expect(result.crmContactId).toBeTruthy();
    expect(db.members).toEqual([]);
    expect(db.crmContacts.length).toBe(1);
  });

  it("is not inserted a second time on a re-run", async () => {
    const db = new FakeDb();
    await applyRowPlan(db, byId("9002"));
    const second = await applyRowPlan(db, byId("9002"));
    expect(second.action).toBe("unchanged");
    // Nothing was created this time, so there is nothing to point at.
    expect(second.crmContactId).toBeNull();
    expect(db.crmContacts.length).toBe(1);
  });

  it("patches the existing member instead of shadowing them with a CRM contact", async () => {
    // The case this guards: a client the platform holds, whose Karma row has lost its email.
    // Creating a CRM contact for them would leave two records for one person, one of which an
    // operator would never see.
    const db = new FakeDb();
    db.seedMember({
      email: "old.address@example.com",
      first_name: "Margaret",
      last_name: "Wilson",
      phone: "+34952383121", // the phone on row 9002
      address_line_1: "",
      city: "",
      status: "active",
    });
    const result = await applyRowPlan(db, byId("9002"));
    expect(result.action).toBe("updated");
    expect(db.crmContacts).toEqual([]);
    expect(db.members.length).toBe(1);
    expect(db.members[0].row.email).toBe("old.address@example.com"); // not overwritten
  });

  it("reports 'unchanged' when the matched member needs nothing", async () => {
    const db = new FakeDb();
    const p = byId("9002");
    db.seedMember({
      email: "held@example.com",
      first_name: p.parsedMember.first_name,
      last_name: p.parsedMember.last_name,
      phone: p.parsedMember.phone,
      date_of_birth: p.parsedMember.date_of_birth,
      address_line_1: p.parsedMember.address_line_1,
      city: p.parsedMember.city,
      province: p.parsedMember.province,
      postal_code: p.parsedMember.postal_code,
      status: "active",
    });
    const result = await applyRowPlan(db, p);
    // A crm_contact plan has no MemberInsert, so there is nothing to patch from.
    expect(result.action).toBe("unchanged");
    expect(db.crmContacts).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Consent, once, and never flipped back
 * ------------------------------------------------------------------ */

describe("the email consent the CRM recorded", () => {
  it("is written once for the row that said Yes", async () => {
    const db = new FakeDb();
    const plan = byId("9007");
    expect(plan.emailContactConsent).toBe(true);
    const first = await applyRowPlan(db, plan);
    expect(first.emailOptInCreated).toBe(true);
    const second = await applyRowPlan(db, plan);
    expect(second.emailOptInCreated).toBe(false);
    expect(db.writes.filter((w) => w.startsWith("insertEmailOptIn")).length).toBe(1);
  });

  it("is not written for a row whose cell was not a clear yes", async () => {
    const db = new FakeDb();
    // 9008 has no email of its own, so make it a member first — the question under test is the
    // consent flag, not whether the row can be a member.
    const plan = withEmail(byId("9008"), "brenda.colefax@example.com");
    expect(plan.emailContactConsent).toBe(false);
    const result = await applyRowPlan(db, plan);
    expect(result.emailOptInCreated).toBe(false);
    expect(db.writes.filter((w) => w.startsWith("insertEmailOptIn"))).toEqual([]);
  });

  it("never overwrites a member who has since said no", async () => {
    // The case the guard exists for: staff record a refusal, then somebody re-runs the file.
    // The guard is "has a row at all", not "has an opted-in row", precisely so a recorded NO
    // survives the next import.
    const db = new FakeDb();
    const plan = byId("9007");
    await applyRowPlan(db, plan);
    db.members[0].emailOptIn = true; // a row exists — say it now reads opted_in = false
    const before = db.writes.length;
    const again = await applyRowPlan(db, plan);
    expect(again.emailOptInCreated).toBe(false);
    expect(db.writes.length).toBe(before);
  });
});
