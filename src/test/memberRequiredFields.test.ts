// @vitest-environment node
//
// ONE DEFINITION OF "REQUIRED FOR OUR FILES", and the four-and-a-half it replaces.
//
// `readinessGap.ts` says a member is monitored once they have a contact and a tested pendant.
// `protectionChecklist.ts` adds an active membership and a pendant that is actually assigned.
// The registration schema decides what a stranger must type to join. `medicalFields.ts`
// describes seventeen medical fields and marks none required. And `MemberUpdateRequestModal`
// carried a FIFTH, inline list — six medical fields, NIE/DNI and "fewer than two contacts" —
// written nowhere else.
//
// The reconciliation has to hold in both directions: it must not quietly drop something staff
// chase today, and it must not disagree with the readiness model that three other screens read.
// Both are asserted below.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MEMBER_REQUIRED_FIELDS,
  REQUIRED_GROUPS,
  REQUIRED_GROUP_LABELS,
  REQUIRED_REASON_LABELS,
  groupRequiredFields,
  missingRequiredCount,
  missingRequiredFields,
  requestableFields,
  requiredFieldByKey,
  type MemberRecordForRequiredCheck,
} from "@/lib/memberRequiredFields";
import { MEDICAL_FIELDS } from "@/lib/medicalFields";
import { readinessGap } from "@/lib/readinessGap";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** A member with absolutely everything. The baseline every other case is a hole in. */
const COMPLETE: MemberRecordForRequiredCheck = {
  member: {
    first_name: "Mary",
    last_name: "Smith",
    date_of_birth: "1948-03-02",
    nie_dni: "X1234567L",
    address_line_1: "Calle Mayor 1",
    city: "Albox",
    province: "Almería",
    postal_code: "04800",
    phone: "+34600000000",
    email: "mary@example.com",
  },
  medical: {
    blood_type: "O+",
    allergies: ["penicillin"],
    medications: ["ramipril"],
    doctor_name: "Dr García",
    doctor_phone: "+34950000000",
    hospital_preference: "Hospital La Inmaculada",
  },
  contacts: [{ phone: "+34600000001" }],
  device: { imei: "123456789012345" },
  deviceTestedAt: "2026-09-01T10:00:00Z",
  subscriptionStatus: "active",
  hasPendant: true,
};

describe("the list itself", () => {
  it("has a stable key, a group, a reason and a sentence for every item", () => {
    for (const field of MEMBER_REQUIRED_FIELDS) {
      expect(field.key, JSON.stringify(field)).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(REQUIRED_GROUPS, field.key).toContain(field.group);
      expect(REQUIRED_REASON_LABELS[field.why], field.key).toBeTruthy();
      // The reason is a SENTENCE, not a tag: "we need your blood group" reads as bureaucracy,
      // "an operator reads this to the ambulance crew" is a reason somebody acts on.
      expect(field.because.fallback.length, field.key).toBeGreaterThan(30);
      expect(field.because.fallback, field.key).not.toBe(field.label.fallback);
      // And it records which source asserts it, so the derivation can be checked by a reader.
      expect(field.derivedFrom.length, field.key).toBeGreaterThan(10);
    }
  });

  it("has no duplicate keys — the key is also the token sent to the member", () => {
    const keys = MEMBER_REQUIRED_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("labels every group it uses", () => {
    for (const group of REQUIRED_GROUPS) expect(REQUIRED_GROUP_LABELS[group], group).toBeTruthy();
  });

  it("every medical requirement names a real column in medicalFields.ts", () => {
    /*
      A typo here is silent and permanent: the count would never reach zero, and the member's
      link would ask for a field that writes nowhere. There is a compile-time ratchet on this
      too; this is the runtime half.
    */
    const columns = MEDICAL_FIELDS.map((f) => f.column as string);
    for (const field of MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "medical")) {
      expect(columns, field.key).toContain(field.key);
    }
  });

  it("marks only the things we do ourselves as not member-supplied", () => {
    // Asking a member for their pendant's IMEI, to test their own pendant, or to activate their
    // own subscription is asking for something they cannot give.
    const ours = MEMBER_REQUIRED_FIELDS.filter((f) => !f.memberCanSupply).map((f) => f.key);
    expect(ours.sort()).toEqual(["active_subscription", "device_imei", "device_tested"]);
  });
});

describe("the reconciliation, in both directions", () => {
  it("agrees with the readiness model that ONE contact is enough", () => {
    /*
      `MemberUpdateRequestModal` chased a SECOND contact. Requiring two here would make the
      missing-info badge disagree with the readiness queue, the member header notice and the
      operator card — all of which read `readinessGap`, and all of which say one is enough.
      Three screens with three answers is the thing this module exists to end.
    */
    expect(readinessGap({ emergency_contact_count: 1, device_tested_at: "2026-01-01" })).toBe("none");

    const oneContact = missingRequiredFields({ ...COMPLETE, contacts: [{ phone: "+34600000001" }] });
    expect(oneContact).toEqual([]);

    // ...and the old two-contact rule is not smuggled in under another name.
    expect(MEMBER_REQUIRED_FIELDS.map((f) => f.key)).not.toContain("contacts_count");
    expect(MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "contacts")).toHaveLength(2);
  });

  it("carries forward all six medical fields the old modal chased, and adds no seventh", () => {
    /*
      Of the four sources the brief names, none asserts a required medical field. The only
      existing assertion is the modal's inline list. Carrying exactly those six forward is
      reconciliation; a seventh would be a requirement no part of this codebase has ever made.
    */
    const medical = MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "medical").map((f) => f.key);
    expect(medical.sort()).toEqual(
      ["allergies", "blood_type", "doctor_name", "doctor_phone", "hospital_preference", "medications"],
    );
    // Seventeen exist; six are required. The other eleven are collected, not chased.
    expect(MEDICAL_FIELDS.length).toBeGreaterThan(medical.length);
  });

  it("keeps NIE/DNI required on file even though the join schema makes it optional", () => {
    // Both are right about their own moment: not required TO JOIN (F1 — requiring too much at
    // the wizard is what killed it), required ON FILE.
    const nie = requiredFieldByKey("nie_dni")!;
    expect(nie.why).toBe("legal");
    expect(nie.derivedFrom).toMatch(/optional/i);

    const schema = read("supabase/functions/_shared/validation.ts");
    expect(schema).toMatch(/nieDni:[\s\S]{0,120}?\.optional\(\)/);
  });

  it("requires every address part, because that is where the ambulance goes", () => {
    const address = MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "address").map((f) => f.key);
    expect(address.sort()).toEqual(["address_line_1", "city", "postal_code", "province"]);
    for (const field of MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "address")) {
      expect(field.why, field.key).toBe("sos");
    }
  });
});

describe("what counts as missing", () => {
  it("a member with everything is missing NOTHING", () => {
    expect(missingRequiredFields(COMPLETE)).toEqual([]);
    expect(missingRequiredCount(COMPLETE)).toBe(0);
  });

  it("remove the IMEI → exactly one missing, and it is named", () => {
    const missing = missingRequiredFields({ ...COMPLETE, device: { imei: null } });
    expect(missing).toHaveLength(1);
    expect(missing[0].key).toBe("device_imei");
    expect(missing[0].label.fallback).toContain("IMEI");
    // And it is ours to fix, not the member's.
    expect(missing[0].memberCanSupply).toBe(false);
  });

  it("finds each single hole, one at a time, across every group", () => {
    const cases: Array<[string, MemberRecordForRequiredCheck]> = [
      ["first_name", { ...COMPLETE, member: { ...COMPLETE.member, first_name: "" } }],
      ["nie_dni", { ...COMPLETE, member: { ...COMPLETE.member, nie_dni: null } }],
      ["postal_code", { ...COMPLETE, member: { ...COMPLETE.member, postal_code: "   " } }],
      ["email", { ...COMPLETE, member: { ...COMPLETE.member, email: "" } }],
      ["blood_type", { ...COMPLETE, medical: { ...COMPLETE.medical, blood_type: "" } }],
      ["allergies", { ...COMPLETE, medical: { ...COMPLETE.medical, allergies: [] } }],
      ["emergency_contact", { ...COMPLETE, contacts: [] }],
      ["device_tested", { ...COMPLETE, deviceTestedAt: null }],
      ["active_subscription", { ...COMPLETE, subscriptionStatus: "past_due" }],
    ];
    for (const [key, input] of cases) {
      const missing = missingRequiredFields(input);
      expect(missing.map((f) => f.key), key).toEqual([key]);
    }
  });

  it("treats a blank string in a NOT NULL column as missing", () => {
    // Imported records carry `""` in columns the schema says cannot be null, so "not null" is
    // not the same question as "we have it".
    expect(missingRequiredCount({ ...COMPLETE, member: { ...COMPLETE.member, city: "" } })).toBe(1);
    expect(missingRequiredCount({ ...COMPLETE, member: { ...COMPLETE.member, city: "  \n " } })).toBe(1);
  });

  it("an empty array is missing, and a non-empty one is not", () => {
    expect(missingRequiredCount({ ...COMPLETE, medical: { ...COMPLETE.medical, medications: [] } })).toBe(1);
    expect(missingRequiredCount({ ...COMPLETE, medical: { ...COMPLETE.medical, medications: ["x"] } })).toBe(0);
  });

  it("a contact with no phone is a gap; no contacts at all is ONE gap, not two", () => {
    // Reporting "every contact needs a number" beside "there are no contacts" is one problem
    // printed twice, and the second line is vacuously true.
    expect(missingRequiredFields({ ...COMPLETE, contacts: [] }).map((f) => f.key)).toEqual([
      "emergency_contact",
    ]);
    expect(
      missingRequiredFields({ ...COMPLETE, contacts: [{ phone: "" }] }).map((f) => f.key),
    ).toEqual(["emergency_contact_phone"]);
  });
});

describe("a read that has not answered is NOT a gap", () => {
  /*
    THE BADGE THAT CRIED WOLF. If a null medical row reported six missing fields, every member
    record would flash "6 missing" while the query was in flight — and a badge that is wrong on
    every page load is a badge staff stop reading. Undefined and null both mean "not answered".
  */
  it("says nothing about medical when the medical row has not been read", () => {
    expect(missingRequiredCount({ ...COMPLETE, medical: null })).toBe(0);
    expect(missingRequiredCount({ ...COMPLETE, medical: undefined })).toBe(0);
  });

  it("says nothing about identity when the member row has not been read", () => {
    expect(missingRequiredCount({ ...COMPLETE, member: null })).toBe(0);
  });

  it("says nothing about contacts, the device or the subscription when those have not answered", () => {
    expect(missingRequiredCount({ ...COMPLETE, contacts: null })).toBe(0);
    expect(missingRequiredCount({ ...COMPLETE, device: undefined, deviceTestedAt: undefined })).toBe(0);
    expect(missingRequiredCount({ ...COMPLETE, subscriptionStatus: undefined })).toBe(0);
  });

  it("an unread source does not hide a gap in a source that WAS read", () => {
    // The nulls above must narrow the answer, not blank it.
    const missing = missingRequiredFields({ ...COMPLETE, medical: null, contacts: [] });
    expect(missing.map((f) => f.key)).toEqual(["emergency_contact"]);
  });
});

describe("a member with no pendant is not chased for one", () => {
  it("skips both device items when the plan has no pendant", () => {
    const noPendant = { ...COMPLETE, hasPendant: false, device: null, deviceTestedAt: null };
    expect(missingRequiredFields(noPendant)).toEqual([]);
  });

  it("...and skips them when we do not know, rather than guessing", () => {
    const unknown = { ...COMPLETE, hasPendant: undefined, device: null, deviceTestedAt: null };
    expect(missingRequiredFields(unknown)).toEqual([]);
  });

  it("but chases both when the plan DOES include one", () => {
    const withPendant = { ...COMPLETE, hasPendant: true, device: null, deviceTestedAt: null };
    expect(missingRequiredFields(withPendant).map((f) => f.key)).toEqual([
      "device_imei",
      "device_tested",
    ]);
  });
});

describe("what gets sent to the member", () => {
  it("drops the three only we can do", () => {
    const everything = missingRequiredFields({
      member: {},
      medical: {},
      contacts: [],
      device: null,
      deviceTestedAt: null,
      subscriptionStatus: "cancelled",
      hasPendant: true,
    });
    const requestable = requestableFields(everything).map((f) => f.key);

    expect(everything.length).toBeGreaterThan(requestable.length);
    for (const ours of ["device_imei", "device_tested", "active_subscription"]) {
      expect(everything.map((f) => f.key), ours).toContain(ours);
      // A link whose promise is "fill this in and you are done" must not ask for these.
      expect(requestable, ours).not.toContain(ours);
    }
  });

  it("keeps everything a member CAN answer", () => {
    const requestable = requestableFields([...MEMBER_REQUIRED_FIELDS]).map((f) => f.key);
    expect(requestable).toContain("nie_dni");
    expect(requestable).toContain("blood_type");
    expect(requestable).toContain("emergency_contact");
    expect(requestable).toContain("address_line_1");
    expect(requestable).toHaveLength(MEMBER_REQUIRED_FIELDS.length - 3);
  });
});

describe("grouping for the dialog", () => {
  it("keeps the declared order and omits empty groups", () => {
    const grouped = groupRequiredFields(missingRequiredFields({ ...COMPLETE, member: {}, medical: {} }));
    const groups = grouped.map((g) => g.group);
    expect(groups).toEqual(["identity", "address", "contact", "medical"]);
    // Order follows REQUIRED_GROUPS, not the order things happened to be found.
    expect(groups).toEqual(REQUIRED_GROUPS.filter((g) => groups.includes(g)));
  });

  it("returns nothing at all for a complete member", () => {
    expect(groupRequiredFields(missingRequiredFields(COMPLETE))).toEqual([]);
  });
});
