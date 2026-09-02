/**
 * ICE import mapping (WP-C).
 *
 * The fixture is SYNTHETIC. It uses the real 147 column headers, because the
 * header layout is the thing under test — the duplicate names, the double
 * space in "Contact  1 - Tel", the trailing spaces on "Allergies " and
 * "Nationality " — but every value is fabricated. Committing 20 real rows
 * would put live members' NIE numbers, medical conditions and addresses in git,
 * which breaks CLAUDE.md's no-PII rule and would be a GDPR problem in its own
 * right. The real 431-row export is validated separately, outside the repo.
 *
 * Each assertion here corresponds to a way the previous importer lost or
 * corrupted data. See ICE_FIELD_MAPPING_SPEC_2026-09-02.md §3.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapIceCsv,
  parseCsv,
  parseIceDate,
  splitPhones,
  splitEmails,
  parseDeviceIds,
  mapStatus,
  mapProvince,
  mapGender,
  normaliseHeader,
  summarise,
  type MappedRow,
} from "@/lib/iceCrmImport";

const fixture = readFileSync(
  join(process.cwd(), "src/test/fixtures/ice-export-fixture.csv"),
  "utf8"
);

const mapped = mapIceCsv(fixture);
const byId = (id: string): MappedRow => {
  const row = mapped.find((r) => r.sourceId === id);
  expect(row, `fixture row ${id} must exist`).toBeDefined();
  return row!;
};

describe("CSV parsing survives the real file's shape", () => {
  it("keeps a record whole when a cell contains newlines", () => {
    // The old line-based parser turned one contact with a multiline
    // "Important Medical Info" into three rows.
    expect(mapped).toHaveLength(7);
    expect(byId("900001").member.special_instructions).toContain("Line one, with a comma");
    expect(byId("900001").member.special_instructions).toContain("Line three");
  });

  it("keeps quoted commas and escaped quotes inside one field", () => {
    expect(byId("900001").member.special_instructions).toContain('call the son first');
  });

  it("normalises stray whitespace in header names", () => {
    expect(normaliseHeader("Contact  1 - Tel")).toBe("Contact 1 - Tel");
    expect(normaliseHeader("Allergies ")).toBe("Allergies");
    expect(normaliseHeader("Nationality ")).toBe("Nationality");
  });

  it("reads all 147 columns", () => {
    expect(parseCsv(fixture).headers).toHaveLength(147);
  });
});

describe("duplicate headers do not destroy data", () => {
  it("takes the meaningful Membership Type, not the last column", () => {
    // Columns 64/66/115 are all "Membership Type". A name-keyed row keeps the
    // last, which is empty here; col 64 is a junk numeric id.
    expect(byId("900001").subscription?.legacy_membership_label).toBe("Couple Annual");
    expect(byId("900001").subscription?.plan_type).toBe("couple");
    expect(byId("900001").subscription?.billing_frequency).toBe("annual");
  });

  it("keeps the two Policy Number columns apart", () => {
    const row = byId("900001");
    expect(row.medical?.private_policy_number).toBe("PRIV-1");
    expect(row.endOfLife?.policy_number).toBe("FUN-1");
  });
});

describe("the member address is the HOME address", () => {
  it("never uses the 'Postal Address (If Different)' block for the member", () => {
    const row = byId("900001");
    expect(row.member.address_line_1).toBe("Calle Ficticia 1");
    expect(row.member.city).toBe("Almeria");
    expect(row.member.postal_code).toBe("04001");
    // Albox is the postal address. Sending an ambulance there is the bug.
    expect(row.member.city).not.toBe("Albox");
  });

  it("keeps the postal address as a separate record", () => {
    expect(byId("900001").postalAddress).toEqual({
      address_type: "postal",
      address_line_1: "Apartado de Correos 9",
      city: "Albox",
      province: "Almería",
      postal_code: "04800",
    });
  });

  it("puts the house number ahead of the second street line", () => {
    expect(byId("900001").member.address_line_2).toBe("Apt 3 - 2nd Floor, Bloque B");
  });
});

describe("dates are parsed, never guessed", () => {
  it("reads DD/MM/YYYY where new Date() fails outright", () => {
    expect(parseIceDate("25/11/1944")).toBe("1944-11-25");
    expect(parseIceDate("15/07/2009")).toBe("2009-07-15");
    expect(byId("900001").member.date_of_birth).toBe("1944-11-25");
  });

  it("reads DD/MM/YYYY where new Date() would silently misread it as MM/DD", () => {
    // 06/30 is not a month, so this one is unambiguous proof of order.
    expect(parseIceDate("30/06/1941")).toBe("1941-06-30");
    expect(parseIceDate("01/09/2025")).toBe("2025-09-01");
  });

  it("reads the legacy D-Mon-YY shape", () => {
    expect(parseIceDate("3-Jun-13")).toBe("2013-06-03");
    expect(parseIceDate("27-Feb-13")).toBe("2013-02-27");
  });

  it("returns null rather than a wrong date", () => {
    expect(parseIceDate("31/02/2020")).toBeNull();
    expect(parseIceDate("not known")).toBeNull();
    expect(parseIceDate("")).toBeNull();
  });

  it("flags an unparseable birthday for review instead of dropping the row", () => {
    const row = byId("900007");
    expect(row.member.date_of_birth).toBeNull();
    expect(row.reviewReasons.join(" ")).toMatch(/Unparseable birthday/);
  });
});

describe("status decides everything (the old importer hardcoded 'active')", () => {
  it.each([
    ["Active Member", "member", "active", false],
    ["Emergency Response Member", "member", "active", false],
    ["Holiday Lifeline", "member", "active", false],
    ["On Hold", "member", "suspended", false],
    ["Cancelled", "crm_contact", null, false],
    ["R.I.P", "crm_contact", null, true],
    ["R.I.P.", "crm_contact", null, true],
    ["Potential Members", "crm_contact", null, false],
    ["ICE Staff", "exclude", null, false],
  ])("%s -> %s / %s", (input, target, memberStatus, deceased) => {
    const m = mapStatus(input as string);
    expect(m.target).toBe(target);
    expect(m.memberStatus).toBe(memberStatus);
    expect(m.deceased).toBe(deceased);
  });

  it("a deceased record never becomes a member", () => {
    const row = byId("900003");
    expect(row.target).toBe("crm_contact");
    expect(row.memberReady).toBe(false);
    expect(row.member.deceased_at).toBe("2026-05-12");
  });

  it("staff are excluded from both members and contacts", () => {
    expect(byId("900005").target).toBe("exclude");
  });

  it("an unknown status is reviewed, not assumed", () => {
    const row = byId("900006");
    expect(row.target).toBe("crm_contact");
    expect(row.reviewReasons.join(" ")).toMatch(/Unrecognised status/);
  });
});

describe("multi-value cells", () => {
  it("splits phones and separates the pendant SIM from people", () => {
    expect(splitPhones("711018685;600066331;+46 719 1031711782")).toEqual({
      human: ["+34711018685", "+34600066331"],
      deviceSim: ["+467191031711782"],
    });
  });

  it("converts 00-prefixed international numbers", () => {
    expect(splitPhones("00 34 677 310 421;00 44 7973 288948").human).toEqual([
      "+34677310421",
      "+447973288948",
    ]);
  });

  it("does not store the pendant SIM as the member's phone", () => {
    const row = byId("900001");
    expect(row.member.phone).toBe("+34600111222");
    expect(row.device?.sim_phone_number).toBe("+467191030000001");
  });

  it("splits emails and rejects the placeholders", () => {
    expect(splitEmails("a@example.test;none").valid).toEqual(["a@example.test"]);
    expect(splitEmails("no").valid).toEqual([]);
    expect(splitEmails("tba").rejected).toEqual(["tba"]);
  });

  it("warns when a non-email value is discarded", () => {
    expect(byId("900002").warnings.join(" ")).toMatch(/Discarded non-email/);
  });
});

describe("household emails satisfy the UNIQUE constraint", () => {
  it("plus-tags the second claimant rather than failing the insert", () => {
    expect(byId("900001").member.email).toBe("alba.testcase@example.test");
    expect(byId("900002").member.email).toBe("alba.testcase+bruno@example.test");
    expect(byId("900002").warnings.join(" ")).toMatch(/Shared household email/);
  });

  it("produces no duplicate member emails in a batch", () => {
    const emails = mapped
      .filter((r) => r.target === "member" && r.member.email)
      .map((r) => r.member.email);
    expect(new Set(emails).size).toBe(emails.length);
  });
});

describe("device identifiers are separated", () => {
  it("pulls the IMEI and the docking station MAC out of one field", () => {
    expect(parseDeviceIds("DOCKING STATION: D3:2E:41:C6:79:71 - IMIE: 865513074081908")).toEqual({
      imei: "865513074081908",
      dockingStationMac: "D3:2E:41:C6:79:71",
      remainder: null,
    });
  });

  it("keeps prose as a note and flags the row", () => {
    const row = byId("900007");
    expect(row.device).toBeNull();
    expect(row.reviewReasons.join(" ")).toMatch(/no 15-digit IMEI/);
  });

  it("leaves no stray punctuation in device notes", () => {
    expect(byId("900001").device?.notes).toBeNull();
  });
});

describe("medical data is collected, not truncated", () => {
  const row = () => byId("900001");

  it("gathers all five conditions and all six medications", () => {
    expect(row().medical?.medical_conditions).toHaveLength(5);
    expect(row().medical?.medications).toHaveLength(6);
  });

  it("reads the trailing-space Allergies header and splits the list", () => {
    expect(row().medical?.allergies).toEqual(["Penicillin", "Shellfish"]);
  });

  it("maps the fields the old importer looked for under different names", () => {
    const m = row().medical!;
    expect(m.blood_type).toBe("O+");
    expect(m.doctor_name).toBe("Dr Fictional");
    expect(m.doctor_phone).toBe("+34950000000");
    expect(m.hospital_preference).toBe("Hospital Ficticio");
  });

  it("keeps the operator-facing extras", () => {
    const m = row().medical!;
    expect(m.mobility).toBe("Walks with a frame");
    expect(m.hearing_notes).toMatch(/speak slowly/);
    expect(m.meds_location).toBe("Kitchen cupboard");
  });
});

describe("contacts and access", () => {
  it("reads 'Contact N - Name' / '- Tel' including the double-spaced header", () => {
    const contacts = byId("900001").contacts;
    expect(contacts[0]).toMatchObject({
      contactName: "Contact One",
      phone: "+34600222333",
      priorityOrder: 1,
      contactType: "emergency",
    });
    expect(contacts[1].contactName).toBe("Contact Two");
  });

  it("stores a key holder as a contact type, not an emergency contact", () => {
    const keyHolder = byId("900001").contacts.find((c) => c.contactType === "key_holder");
    expect(keyHolder?.contactName).toBe("Neighbour Nine");
  });

  it("never invents a relationship the CRM does not have", () => {
    expect(byId("900001").contacts[0].relationship).toBe("Unknown");
  });

  it("flags a contact number with no name instead of discarding it", () => {
    const row = byId("900002");
    expect(row.contacts[0].phone).toBe("+34600777888");
    expect(row.reviewReasons.join(" ")).toMatch(/no name/);
  });

  it("captures the key safe code", () => {
    expect(byId("900001").access?.key_safe_code).toMatch(/1234/);
  });
});

describe("billing: FOC survives, card data does not", () => {
  it("derives is_free_of_charge from the payment columns", () => {
    expect(byId("900001").subscription?.is_free_of_charge).toBe(true);
  });

  it("never maps card or bank values into a structured field", () => {
    const row = byId("900002");
    const serialised = JSON.stringify({ ...row, raw: undefined });
    expect(serialised).not.toContain("4111");
    expect(row.warnings.join(" ")).toMatch(/card\/bank data/);
  });

  it("keeps the raw row available for admin review", () => {
    // crm_import_rows.raw is the audited home for anything we refuse to map.
    expect(JSON.stringify(byId("900002").raw)).toContain("4111");
  });

  it("reads the join date and billing metadata", () => {
    expect(byId("900001").subscription?.start_date).toBe("2021-08-14");
    expect(byId("900002").subscription?.amount).toBe(29.5);
    expect(byId("900002").subscription?.payment_arrangement).toBe("DD");
    expect(byId("900002").subscription?.arrears_note).toMatch(/2 months/);
  });
});

describe("normalisers flag rather than silently correct", () => {
  it("canonicalises real provinces", () => {
    expect(mapProvince("Almeria")).toEqual({ province: "Almería", review: false });
    expect(mapProvince("MALAGA")).toEqual({ province: "Málaga", review: false });
  });

  it("flags a town sitting in the province field", () => {
    expect(mapProvince("Arboleas")).toEqual({ province: "Arboleas", review: true });
    expect(byId("900002").reviewReasons.join(" ")).toMatch(/not a Spanish province/);
  });

  it("corrects an obvious gender typo but flags anything ambiguous", () => {
    expect(mapGender("Felmale").gender).toBe("female");
    expect(mapGender("Female 85 years old")).toEqual({ gender: "female", review: true });
    expect(mapGender("").review).toBe(false);
  });
});

describe("fields the old importer never mapped at all", () => {
  it("captures NIE, nickname, nationality, passport, consent and identity", () => {
    const m = byId("900001").member;
    expect(m.nie_dni).toBe("X-0000001-A");
    expect(m.nickname).toBe("Albi");
    expect(m.nationality).toBe("British");
    expect(m.passport_number).toBe("000000001");
    expect(m.an_ss_number).toBe("000000000001");
    expect(m.consent_state).toBe("Opted in");
    expect(m.title).toBe("Mrs");
    expect(m.county).toBe("Almeria");
  });

  it("captures GPS and the map link", () => {
    const m = byId("900001").member;
    expect(m.gps_lat).toBeCloseTo(36.8341, 4);
    expect(m.gps_lng).toBeCloseTo(-2.4638, 4);
    expect(m.map_link).toMatch(/^https:/);
  });

  it("records CRM provenance so a re-import can reconcile", () => {
    const m = byId("900001").member;
    expect(m.crm_source).toBe("karmacrm");
    expect(m.crm_source_id).toBe("900001");
    expect(m.crm_created_at).toBe("2019-03-04");
  });
});

describe("a live member missing a NOT NULL column is not written", () => {
  it("reports it as not-ready with the missing fields named", () => {
    const row = byId("900007");
    expect(row.target).toBe("member");
    expect(row.memberReady).toBe(false);
    expect(row.reviewReasons.join(" ")).toMatch(
      /missing required field\(s\).*email.*date_of_birth.*address_line_1/
    );
  });
});

describe("batch summary", () => {
  it("counts the fixture the way the dry-run report will", () => {
    expect(summarise(mapped)).toEqual({
      total: 7,
      members: 2,
      membersNotReady: 1,
      crmContacts: 3,
      excluded: 1,
      deceased: 1,
      needingReview: 4,
    });
  });
});
