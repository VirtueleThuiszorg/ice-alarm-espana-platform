/**
 * THE IMPORTED PIN, AND "RECOMMENDED" MEANING SOMETHING.
 *
 * Two claims, and both of them are about a boundary that would be easy to blur:
 *
 *   1. A coordinate that arrived in a spreadsheet is NOT a member confirmation. It is written
 *      with `source = 'imported'` and no date, so the SOS card says "from our records — not
 *      confirmed by the member" instead of "set by member on…". The database refuses the lie
 *      too (isolation.sql), but the importer must not attempt it in the first place.
 *   2. RECOMMENDED IS NOT REQUIRED. A member with no pin is not an incomplete record: the
 *      missing count does not move, the badge does not move, and the update link does not carry
 *      it. It appears as a suggestion, and nowhere else.
 */
import { describe, it, expect } from "vitest";
import {
  MEMBER_RECOMMENDED_FIELDS,
  MEMBER_REQUIRED_FIELDS,
  missingRecommendedFields,
  missingRequiredCount,
  missingRequiredFields,
  requestableFields,
  type MemberRecordForRequiredCheck,
} from "@/lib/memberRequiredFields";
import { isPlausiblySpain, mapIceCsv, parseGps } from "@/lib/iceCrmImport";
import { planRowWrites } from "@/lib/crmImportWriter";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── the parser, reused rather than reinvented ──────────────────────────────
describe("parseGps — ONE parser for both CRM columns", () => {
  it("reads the GPS Co-ordinates column", () => {
    expect(parseGps("36.8341, -2.4638")).toEqual({ lat: 36.8341, lng: -2.4638 });
  });

  it("reads a Google Maps URL, which is the SAME fact written differently", () => {
    expect(parseGps("https://www.google.com/maps/place/@37.3886,-2.1487,17z")).toEqual({
      lat: 37.3886,
      lng: -2.1487,
    });
    expect(parseGps("https://maps.google.com/?q=36.7213,-4.4214")).toEqual({
      lat: 36.7213,
      lng: -4.4214,
    });
  });

  it("returns nothing for a link that names a place rather than a point", () => {
    expect(parseGps("https://maps.google.com/?q=Calle+Mayor+1,+Albox")).toEqual({
      lat: null,
      lng: null,
    });
    expect(parseGps("")).toEqual({ lat: null, lng: null });
  });

  it("refuses an impossible coordinate", () => {
    expect(parseGps("137.5, -2.1")).toEqual({ lat: null, lng: null });
  });
});

describe("isPlausiblySpain — arithmetic sanity, not geography", () => {
  it("accepts the mainland and the Canaries", () => {
    expect(isPlausiblySpain(37.3886, -2.1487)).toBe(true); // Albox
    expect(isPlausiblySpain(36.7213, -4.4214)).toBe(true); // Málaga
    expect(isPlausiblySpain(28.1, -15.4)).toBe(true); // Gran Canaria
    expect(isPlausiblySpain(43.3, -2.9)).toBe(true); // Bilbao
  });

  it("refuses a pair a URL scrape could produce", () => {
    expect(isPlausiblySpain(0, 0)).toBe(false);
    expect(isPlausiblySpain(51.5, -0.12)).toBe(false); // London
    expect(isPlausiblySpain(17, -2)).toBe(false); // the Sahara
  });
});

// ── recommended is not required ────────────────────────────────────────────
const blank: MemberRecordForRequiredCheck = {
  member: null,
  medical: null,
  contacts: null,
  device: null,
  deviceTestedAt: null,
  subscriptionStatus: null,
  hasPendant: null,
};

/** A complete record, so the assertions about the COUNT are not swamped by other gaps. */
const complete: MemberRecordForRequiredCheck = {
  member: {
    first_name: "Ana",
    last_name: "Alpha",
    date_of_birth: "1950-01-01",
    nie_dni: "X1234567L",
    address_line_1: "Calle A 1",
    city: "Albox",
    province: "Almeria",
    postal_code: "04800",
    phone: "+34600000001",
    email: "a@example.com",
  },
  medical: {
    blood_type: "O+",
    allergies: ["none"],
    medications: ["none"],
    doctor_name: "Dr Ruiz",
    doctor_phone: "+34950000000",
    hospital_preference: "Huércal-Overa",
  },
  contacts: [{ phone: "+34600000002" }],
  device: { imei: "123456789012345" },
  deviceTestedAt: "2026-09-01T00:00:00Z",
  subscriptionStatus: "active",
  hasPendant: true,
};

describe("the home pin is RECOMMENDED, which is enforced and not just described", () => {
  it("is not on the required list at all", () => {
    expect(MEMBER_REQUIRED_FIELDS.map((f) => f.key)).not.toContain("home_location");
  });

  it("a complete record with NO pin has a missing count of ZERO", () => {
    expect(missingRequiredCount(complete)).toBe(0);
    expect(missingRequiredFields(complete)).toEqual([]);
  });

  it("and the same record DOES carry the suggestion", () => {
    expect(missingRecommendedFields(complete).map((f) => f.key)).toEqual(["home_location"]);
  });

  it("the suggestion disappears once there is a pin", () => {
    const withPin: MemberRecordForRequiredCheck = {
      ...complete,
      member: {
        ...(complete.member as Record<string, unknown>),
        home_lat: 37.388,
        home_lng: -2.148,
        home_location_source: "member_pin",
      },
    };
    expect(missingRecommendedFields(withPin)).toEqual([]);
    // and the required count is still zero — the pin does not add or remove a requirement
    expect(missingRequiredCount(withPin)).toBe(0);
  });

  it("COORDINATES WITH NO SOURCE ARE NOT A PIN — the card could not label them honestly", () => {
    const halfPin: MemberRecordForRequiredCheck = {
      ...complete,
      member: {
        ...(complete.member as Record<string, unknown>),
        home_lat: 37.388,
        home_lng: -2.148,
        home_location_source: null,
      },
    };
    expect(missingRecommendedFields(halfPin).map((f) => f.key)).toEqual(["home_location"]);
  });

  it("a member row that has not been read yet is not a suggestion — nothing to suggest about", () => {
    expect(missingRecommendedFields(blank)).toEqual([]);
  });

  it("it never travels on the member's update link", () => {
    // requestableFields only ever receives required fields, and the recommended list is not one.
    const asked = requestableFields([...MEMBER_REQUIRED_FIELDS]).map((f) => f.key);
    expect(asked).not.toContain("home_location");
    /*
      THE REASON, recorded here because it is a security decision and not an oversight: the
      update link needs no login. A map picker behind an anonymous token would let whoever holds
      that link decide where an ambulance is sent. The member sets the pin signed in, on their
      own dashboard.
    */
    expect(MEMBER_RECOMMENDED_FIELDS[0].derivedFrom).toMatch(/RECOMMENDED not required/);
  });

  it("carries the same shape as a required field, including a real reason", () => {
    for (const field of MEMBER_RECOMMENDED_FIELDS) {
      expect(field.because.fallback.length).toBeGreaterThan(30);
      expect(field.derivedFrom.length).toBeGreaterThan(10);
      expect(field.label.fallback.length).toBeGreaterThan(3);
    }
  });
});

// ── what the import would WRITE ────────────────────────────────────────────
describe("the imported pin, as the writer plans it", () => {
  const mapped = mapIceCsv(
    readFileSync(join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv"), "utf8"),
  );
  /** A row the writer is willing to make a member of, so `plan.member` is not null. */
  const eligible = mapped.find((row) => planRowWrites(row).outcome === "member");

  it("the fixture really contains a member-eligible row (else this block is vacuous)", () => {
    expect(eligible).toBeTruthy();
  });

  it("A COORDINATE FROM A SPREADSHEET IS NEVER A MEMBER CONFIRMATION", () => {
    const withPin = {
      ...(eligible as NonNullable<typeof eligible>),
      member: { ...(eligible as NonNullable<typeof eligible>).member, home_lat: 37.388, home_lng: -2.148 },
    };
    const plan = planRowWrites(withPin);
    expect(plan.member?.home_lat).toBe(37.388);
    expect(plan.member?.home_lng).toBe(-2.148);
    expect(plan.member?.home_location_source).toBe("imported");
    // NEVER a member source. An operator reading "set by member on 14 March" when nobody ever
    // asked the member is the precise failure the provenance column exists to prevent.
    expect(plan.member?.home_location_source).not.toBe("member_pin");
    expect(plan.member?.home_location_source).not.toBe("member_gps");
    expect(plan.member?.home_location_source).not.toBe("staff_pin");
  });

  it("and it carries NO date — the import knows when IT ran, not when anybody stood there", () => {
    const withPin = {
      ...(eligible as NonNullable<typeof eligible>),
      member: { ...(eligible as NonNullable<typeof eligible>).member, home_lat: 37.388, home_lng: -2.148 },
    };
    expect(planRowWrites(withPin).member?.home_location_set_at).toBeNull();
  });

  it("a row with no parseable coordinate writes NO source either — the CHECK would refuse it", () => {
    const plan = planRowWrites(eligible as NonNullable<typeof eligible>);
    expect(plan.member?.home_lat).toBeNull();
    expect(plan.member?.home_lng).toBeNull();
    // A "location" that is only a provenance is a claim about nothing.
    expect(plan.member?.home_location_source).toBeNull();
  });

  it("the verbatim gps_* columns are NOT what the SOS card reads — they are different fields", () => {
    // Belt and braces on the naming: a future edit that made home_lat an alias of gps_lat would
    // quietly let an out-of-Spain scrape become somebody's front door.
    const row = mapIceCsv(
      "id,First Name,Last Name,Status,Home Street,Home City,Home State,Home Postal Code,Email (h),Phone (m),Birthday,GPS Co-ordinates,Google Map Link\n" +
        "1,Ana,Alpha,Client,Calle A 1,Albox,Almeria,04800,a@example.com,600000001,01/01/1950,\"51.5074, -0.1278\",\n",
    )[0];
    // London: kept verbatim in gps_*, refused as a home location.
    expect(row.member.gps_lat).toBeCloseTo(51.5074, 3);
    expect(row.member.home_lat).toBeNull();
    expect(row.warnings.join(" ")).toMatch(/outside Spain/);
  });

  it("a Google Map Link is used when the GPS column is empty, and says so", () => {
    const row = mapIceCsv(
      "id,First Name,Last Name,Status,Home Street,Home City,Home State,Home Postal Code,Email (h),Phone (m),Birthday,GPS Co-ordinates,Google Map Link\n" +
        '1,Ana,Alpha,Client,Calle A 1,Albox,Almeria,04800,a@example.com,600000001,01/01/1950,,"https://www.google.com/maps/place/@37.3886,-2.1487,17z"\n',
    )[0];
    expect(row.member.home_lat).toBeCloseTo(37.3886, 4);
    expect(row.member.home_lng).toBeCloseTo(-2.1487, 4);
    expect(row.warnings.join(" ")).toMatch(/Google Map Link/);
  });

  it("and a URL-ENCODED comma is decoded first — `?q=37.3886%2C-2.1487` is an ordinary link", () => {
    const row = mapIceCsv(
      "id,First Name,Last Name,Status,Home Street,Home City,Home State,Home Postal Code,Email (h),Phone (m),Birthday,GPS Co-ordinates,Google Map Link\n" +
        "1,Ana,Alpha,Client,Calle A 1,Albox,Almeria,04800,a@example.com,600000001,01/01/1950,,https://maps.google.com/?q=37.3886%2C-2.1487\n",
    )[0];
    expect(row.member.home_lat).toBeCloseTo(37.3886, 4);
  });

  it("a hand-typed cell with a stray % does not throw the whole import", () => {
    const row = mapIceCsv(
      "id,First Name,Last Name,Status,Home Street,Home City,Home State,Home Postal Code,Email (h),Phone (m),Birthday,GPS Co-ordinates,Google Map Link\n" +
        "1,Ana,Alpha,Client,Calle A 1,Albox,Almeria,04800,a@example.com,600000001,01/01/1950,,100%25 sure it was here\n",
    )[0];
    expect(row.member.home_lat).toBeNull();
  });
});

// ── the pin is CREATE-ONLY on the import path ──────────────────────────────
describe("a re-import never writes a location onto a member we already hold", () => {
  const writer = readFileSync(join(process.cwd(), "src/lib/crmImportWriter.ts"), "utf8");

  it("all four columns are on NEVER_PATCH", () => {
    const block = writer.slice(writer.indexOf("const NEVER_PATCH"), writer.indexOf("]);", writer.indexOf("const NEVER_PATCH")));
    for (const col of ["home_lat", "home_lng", "home_location_source", "home_location_set_at"]) {
      expect(block, col).toContain(`"${col}"`);
    }
  });

  it("and the patch really omits them, driven rather than read", async () => {
    const { memberPatchFor } = await import("@/lib/crmImportWriter");
    const mapped = mapIceCsv(
      "id,First Name,Last Name,Status,Home Street,Home City,Home State,Home Postal Code,Email (h),Phone (m),Birthday,GPS Co-ordinates,Google Map Link\n" +
        "1,Ana,Alpha,Client,Calle A 1,Albox,Almeria,04800,a@example.com,600000001,01/01/1950,\"37.3886, -2.1487\",\n",
    )[0];
    // The parsed row DOES carry a pin...
    expect(mapped.member.home_lat).toBeCloseTo(37.3886, 4);

    // ...and a member we already hold, with an empty pin, is still not given it.
    const patch = memberPatchFor(
      { first_name: "Ana", last_name: "Alpha", home_lat: null, home_lng: null, home_location_source: null, city: "" },
      { ...mapped, outcome: "member", blockers: [] } as never,
    );
    expect(patch).not.toHaveProperty("home_lat");
    expect(patch).not.toHaveProperty("home_location_source");
    /*
      THE GUARD IS THE DATABASE'S, NOT THIS FUNCTION'S OPINION.
      A patch carrying source='imported' would RAISE: the write runs in the browser as the
      signed-in admin, and guard_member_home_location() lets a staff actor claim staff_pin or
      geocoded only. Asserted by execution against the real trigger in scripts/rls/isolation.sql.
    */
    // and the patch is not empty for the right reason — it did fill something else in
    expect(patch).toHaveProperty("city");
  });
});
