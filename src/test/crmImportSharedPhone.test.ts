// @vitest-environment node
//
// A SHARED LANDLINE IS NOT EVIDENCE THAT TWO ROWS ARE ONE PERSON.
//
// `resolveSharedEmails` exists because of one daughter looking after both her parents: keyed on
// the address she gave for both, the second row matches the first and the import patches her
// father's details onto her mother's record — one member where there are two, with one set of
// emergency contacts and one pendant between them. An SOS from the other pendant then resolves
// to a person it is not. `memberEmailOptional.test.ts` calls that the load-bearing assertion of
// its PR, and it is.
//
// It closed half the door. `dedupeKeysFor` went on keying unconditionally on the phone, and a
// married couple at one house share a landline far more often than two members share an address.
// Measured on the four karmaCRM exports queued for 19 September: `resolveSharedEmails` leaves
// ZERO rows colliding on an address, and TWENTY-ONE collide on a number — nineteen of them in
// the cancelled group, every one a couple. The Edmonds, Linderstroms, Tittershills, Bigleys,
// Bessells, Rogers, Kidds.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv, resolveSharedPhones } from "../lib/iceCrmImport";
import { planRowWrites, dedupeKeysFor } from "../lib/crmImportWriter";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const mapped = mapIceCsv(readFileSync(FIXTURE, "utf8"));

/**
 * A SECOND FIXTURE, RUN THROUGH THE WHOLE PIPELINE, and it exists because a mutation pass caught
 * the tests below testing the resolver in isolation. Deleting `resolveSharedPhones` from
 * `mapIceCsv` altogether left every one of them green: they called the function directly, so
 * nothing anywhere proved it was wired in.
 *
 * 9101 and 9102 are a couple with one landline between them. 9103 has the same landline and a
 * status that takes the EXCLUDED branch of `planRowWrites`, which builds `parsedMember` at a
 * second site — the easier of the two to forget a field in, and the other thing that survived.
 * 9104 has a number nobody else has, so the rule is shown to be conditional rather than blanket.
 */
const PIPELINE = join(process.cwd(), "src/test/fixtures/ice-export-shared-phone-fixture.csv");
const pipeline = mapIceCsv(readFileSync(PIPELINE, "utf8"));
const planned = pipeline.map(planRowWrites);
const plan = (id: string) => {
  const p = planned.find((x) => x.sourceId === id);
  if (!p) throw new Error(`no plan for ${id}`);
  return p;
};

/** Two rows off the real fixture, given one landline between them — the couple. */
const couple = (phone: string, other = phone) =>
  resolveSharedPhones([
    { ...mapped[0], phoneOwner: "member", warnings: [], member: { ...mapped[0].member, phone } },
    { ...mapped[1], phoneOwner: "member", warnings: [], member: { ...mapped[1].member, phone: other } },
  ]);

describe("resolveSharedPhones", () => {
  it("marks BOTH rows, not just the second", () => {
    // The first to appear is not more entitled to the number. If two members share a line it
    // identifies neither of them, so neither may key on it.
    const rows = couple("+34950473199");
    expect(rows[0].phoneOwner).toBe("shared");
    expect(rows[1].phoneOwner).toBe("shared");
  });

  it("leaves a number only one person has alone", () => {
    const rows = couple("+34950473199", "+34600556282");
    expect(rows[0].phoneOwner).toBe("member");
    expect(rows[1].phoneOwner).toBe("member");
  });

  it("says so in the row's warnings, so the preview shows why", () => {
    const rows = couple("+34950473199");
    expect(rows[0].warnings.join(" ")).toContain("appears on more than one row");
    expect(rows[1].warnings.join(" ")).toContain("appears on more than one row");
  });

  it("does not treat 'no phone' as a shared phone", () => {
    // Two rows with a null number are not two rows with the same number. Counting null as a key
    // would mark every phoneless row in the file shared — and most of this CRM has no landline.
    const rows = resolveSharedPhones([
      { ...mapped[0], phoneOwner: "member", warnings: [], member: { ...mapped[0].member, phone: null } },
      { ...mapped[1], phoneOwner: "member", warnings: [], member: { ...mapped[1].member, phone: null } },
    ]);
    expect(rows[0].phoneOwner).toBe("member");
    expect(rows[1].phoneOwner).toBe("member");
  });

  it("blocks nothing — a shared number is still written and still the number you ring", () => {
    const rows = couple("+34950473199");
    expect(rows[0].member.phone).toBe("+34950473199");
    expect(rows[1].member.phone).toBe("+34950473199");
  });

  it("defaults to `member` on a row mapped on its own", () => {
    expect(mapped.every((m) => m.phoneOwner === "member" || m.phoneOwner === "shared")).toBe(true);
  });
});

describe("the dedupe key", () => {
  it("NEVER uses a shared landline — the couple cannot collapse into one member", () => {
    // The load-bearing assertion. Keyed on the phone, the husband would match his wife and be
    // patched onto her record, and an SOS from his pendant would name her.
    const [a, b] = couple("+34950473199").map(planRowWrites);
    expect(dedupeKeysFor(a).phone).toBeNull();
    expect(dedupeKeysFor(b).phone).toBeNull();
  });

  it("still uses a number that is genuinely one member's", () => {
    const [a, b] = couple("+34950473199", "+34600556282").map(planRowWrites);
    expect(dedupeKeysFor(a).phone).toBe("+34950473199");
    expect(dedupeKeysFor(b).phone).toBe("+34600556282");
  });

  it("carries phone_owner onto the plan for a row that cannot become a member", () => {
    // `planRowWrites` returns from two separate places. A field set in one and not the other is
    // a silent hole, and the early return for an excluded row is the easier one to forget.
    for (const plan of mapped.map(planRowWrites)) {
      expect(plan.phoneOwner, `plan ${plan.sourceId}`).toMatch(/^(member|shared)$/);
    }
  });

  it("keeps the marker OFF parsedMember, because that object is spread into an UPDATE", () => {
    // `memberPatchFor` does `{ ...(plan.member ?? plan.parsedMember) }` and hands the result to
    // `patchMember`. A field in there that is not a `members` column makes the import write a
    // column that does not exist. The first version of this change put it there, and
    // `crmImportApply.test.ts` went red on a crm_contact row that matched an existing member.
    for (const plan of mapped.map(planRowWrites)) {
      expect(Object.keys(plan.parsedMember)).not.toContain("phone_owner");
      expect(Object.keys(plan.parsedMember)).not.toContain("phoneOwner");
    }
  });
});

describe("wired into mapIceCsv, not just callable", () => {
  it("marks the couple shared when the file goes through the real entry point", () => {
    // Kills the mutant that dropped resolveSharedPhones from mapIceCsv: every direct-call test
    // above stayed green without it.
    expect(pipeline.find((m) => m.member.first_name === "Geoffray")?.phoneOwner).toBe("shared");
    expect(pipeline.find((m) => m.member.first_name === "Patricia")?.phoneOwner).toBe("shared");
  });

  it("leaves the resident with her own number alone", () => {
    expect(pipeline.find((m) => m.member.first_name === "Solo")?.phoneOwner).toBe("member");
  });

  it("neither of the couple keys on the landline, end to end", () => {
    expect(dedupeKeysFor(plan("9101")).phone).toBeNull();
    expect(dedupeKeysFor(plan("9102")).phone).toBeNull();
    expect(dedupeKeysFor(plan("9104")).phone).toBe("+34611999888");
  });

  it("the EXCLUDED branch carries the real phone_owner, not a hardcoded default", () => {
    // `planRowWrites` returns early for a staff or building record and builds `parsedMember`
    // separately there. That copy took `"member"` unconditionally in a surviving mutant.
    const excluded = plan("9103");
    expect(excluded.outcome).toBe("skip");
    expect(excluded.phoneOwner).toBe("shared");
  });
});
