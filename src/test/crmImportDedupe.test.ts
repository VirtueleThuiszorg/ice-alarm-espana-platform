// @vitest-environment node
//
// Running the import twice must change nothing the second time, and must never overwrite what
// a human has since corrected.
//
// Lee's one-row test is the case that matters: he imports David Evans to see what happens, then
// imports the whole file. If the second run creates a second David Evans, the platform now has
// two records for one person — and an SOS from his pendant resolves to whichever one the query
// happens to find first, with whichever set of emergency contacts that record carries.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv } from "../lib/iceCrmImport";
import {
  planRowWrites,
  dedupeKeysFor,
  normaliseNie,
  computeEmptyOnlyPatch,
  memberPatchFor,
} from "../lib/crmImportWriter";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const plans = mapIceCsv(readFileSync(FIXTURE, "utf8")).map(planRowWrites);
const byId = (id: string) => {
  const p = plans.find((x) => x.sourceId === id);
  if (!p) throw new Error(`no plan for ${id}`);
  return p;
};

describe("the three dedupe keys", () => {
  it("uses NIE, email and normalised phone", () => {
    const keys = dedupeKeysFor(byId("9006")); // David Evans: has all three
    expect(keys.nie).toBe("Y7654321X");
    expect(keys.email).toBe("david.evans@example.com");
    expect(keys.phone).toBe("+34655666777");
  });

  it("lower-cases the email, because Karma does not", () => {
    const plan = { ...byId("9006") };
    plan.parsedMember = { ...plan.parsedMember, email: "David.Evans@Example.COM" };
    expect(dedupeKeysFor(plan).email).toBe("david.evans@example.com");
  });

  it("returns nulls rather than empty strings when a key is absent", () => {
    // A key of "" would match every member with an empty column — the worst possible dedupe.
    const keys = dedupeKeysFor(byId("9008")); // no email, no NIE
    expect(keys.email).toBeNull();
    expect(keys.nie).toBeNull();
    expect(keys.phone).not.toBeNull();
  });
});

describe("NIE is compared without punctuation or case", () => {
  it.each([
    ["X-1234567-L", "X1234567L"],
    ["x1234567l", "X1234567L"],
    [" X1234567L ", "X1234567L"],
    ["X.1234567.L", "X1234567L"],
  ])("%s normalises to %s", (raw, expected) => {
    expect(normaliseNie(raw)).toBe(expected);
  });

  it("is null for nothing, rather than an empty string", () => {
    expect(normaliseNie(null)).toBeNull();
    expect(normaliseNie("")).toBeNull();
    expect(normaliseNie("---")).toBeNull();
  });

  it("treats three spellings of one NIE as the same person", () => {
    const forms = ["X-1234567-L", "x1234567l", "X 1234567 L"].map(normaliseNie);
    expect(new Set(forms).size).toBe(1);
  });
});

describe("an existing member has empty fields filled, and nothing else", () => {
  it("fills what is missing", () => {
    const existing = { first_name: "David", last_name: "Evans", city: null, postal_code: "" };
    const patch = computeEmptyOnlyPatch(existing, {
      first_name: "David",
      city: "Torremolinos",
      postal_code: "29620",
    });
    expect(patch).toEqual({ city: "Torremolinos", postal_code: "29620" });
  });

  it("NEVER overwrites a value a human may have corrected", () => {
    // The platform's record is the maintained one. The CRM is a source of what we are MISSING.
    const existing = { city: "Benalmádena", phone: "+34600000001" };
    const patch = computeEmptyOnlyPatch(existing, {
      city: "Torremolinos",
      phone: "+34655666777",
    });
    expect(patch).toEqual({});
  });

  it("does not treat the old importer's placeholders as empty", () => {
    // 'N/A' is a real value in the column. Overwriting it is a data-cleanup job with a human
    // looking at it, not something an import should do quietly.
    const existing = { city: "N/A", phone: "N/A", email: "imported-123@placeholder.local" };
    const patch = computeEmptyOnlyPatch(existing, {
      city: "Torremolinos",
      phone: "+34655666777",
      email: "david.evans@example.com",
    });
    expect(patch).toEqual({});
  });

  it("skips a desired value that is itself empty", () => {
    const patch = computeEmptyOnlyPatch({ city: null }, { city: "", province: null });
    expect(patch).toEqual({});
  });

  it("never patches status — golden rule 4", () => {
    // An import that filled an empty status would be activating somebody.
    const patch = memberPatchFor({ status: null, city: null }, byId("9006"));
    expect(Object.keys(patch)).not.toContain("status");
    expect(Object.keys(patch)).toContain("city");
  });

  it("never patches id, timestamps or user_id", () => {
    const patch = memberPatchFor(
      { id: null, created_at: null, updated_at: null, user_id: null, city: null },
      byId("9006")
    );
    for (const k of ["id", "created_at", "updated_at", "user_id"]) {
      expect(Object.keys(patch)).not.toContain(k);
    }
  });
});

describe("a row that cannot become a member can still fill a gap on one", () => {
  it("patches from the parsed fields when there is no MemberInsert", () => {
    // 9008's Birthday is unreadable, so it is a crm_contact and `plan.member` is null. (It used
    // to be 9002, blocked on "no email" — until email became optional and 9002 became a member.) If it matches a
    // member the platform already holds — by phone or NIE — the fields it DID parse are still
    // worth filling in. Returning {} here made applyRowPlan's "patch rather than shadow" branch
    // a silent no-op.
    const plan = byId("9008");
    expect(plan.member).toBeNull();
    const patch = memberPatchFor({ city: null, postal_code: null, phone: "+34677888999" }, plan);
    expect(Object.keys(patch).length).toBeGreaterThan(0);
    expect(patch.city).toBe(plan.parsedMember.city);
  });

  it("still refuses to patch status from a parsed row", () => {
    const patch = memberPatchFor({ status: null }, byId("9008"));
    expect(Object.keys(patch)).not.toContain("status");
  });
});

describe("re-running the import changes nothing", () => {
  it("produces an empty patch when the member already has everything", () => {
    // The second run of the same file. This is the whole requirement, stated once.
    const plan = byId("9006");
    const alreadyImported = { ...(plan.member as unknown as Record<string, unknown>) };
    expect(memberPatchFor(alreadyImported, plan)).toEqual({});
  });

  it("is stable across a third run too", () => {
    const plan = byId("9006");
    const existing = { ...(plan.member as unknown as Record<string, unknown>) };
    const first = memberPatchFor(existing, plan);
    const after = { ...existing, ...first };
    expect(memberPatchFor(after, plan)).toEqual({});
  });

  it("still fills a field a human later cleared", () => {
    // Not idempotence for its own sake: if somebody blanks the postcode, the next import may
    // legitimately put the CRM's back.
    const plan = byId("9006");
    const existing = { ...(plan.member as unknown as Record<string, unknown>), postal_code: null };
    expect(memberPatchFor(existing, plan)).toEqual({ postal_code: "29620" });
  });
});
