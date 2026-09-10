// @vitest-environment node
//
// Lee's ruling of 2026-09-10 on the four columns nothing read (PENDING_FOR_LEE D-19 item 4).
//
//   Dob                      -> fallback for date_of_birth when Birthday is blank
//   Spouse                   -> a member note, couple-plan hint only
//   Wellbeing Appt Date      -> stays in raw
//   Contact Friend for Email -> the email notification consent flag, on an unambiguous yes only
//
// The two that carry risk are the first and the last, and for opposite reasons. A wrong date of
// birth is what an ambulance crew is told. A consent flag set on a guess is a permission nobody
// can defend later — so "not a clear yes" and "empty" must land in the same place.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv, parseCsv, parseUnambiguousYes, type MappedRow } from "../lib/iceCrmImport";
import { planRowWrites } from "../lib/crmImportWriter";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const CSV = readFileSync(FIXTURE, "utf8");
const HEADERS = parseCsv(CSV).headers;
const rows = mapIceCsv(CSV);
const byId = (id: string): MappedRow => {
  const r = rows.find((x) => x.sourceId === id);
  if (!r) throw new Error(`no fixture row ${id}`);
  return r;
};

/** A row of the real 147-column shape with only the named columns filled. */
function rowWith(values: Record<string, string>): MappedRow {
  const cells = HEADERS.map((h) => values[h] ?? "");
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [HEADERS.map(cell).join(","), cells.map(cell).join(",")].join("\r\n");
  const mapped = mapIceCsv(csv);
  expect(mapped.length).toBe(1);
  return mapped[0];
}

describe("Dob is a fallback, not a second opinion", () => {
  it("is used when Birthday is blank", () => {
    // 9007: Birthday empty, Dob 30/06/1937. Day 30 leaves no room for a month, so this also
    // proves the fallback goes through the same DD/MM parser rather than Date.parse.
    expect(byId("9007").member.date_of_birth).toBe("1937-06-30");
  });

  it("is NOT used when Birthday holds something the parser refused", () => {
    // 9008: Birthday is "not sure, ask daughter"; Dob is 01/01/1940. A value we could not read
    // is a value to LOOK AT. Quietly preferring the other column buries it, and the record then
    // carries a date nobody checked.
    const r = byId("9008");
    expect(r.member.date_of_birth).toBeNull();
    expect(r.reviewReasons.join(" ")).toMatch(/Unparseable birthday/);
  });

  it("reports the unreadable column by name when Birthday was the empty one", () => {
    const r = rowWith({ id: "9100", "First Name": "Test", Dob: "the war years" });
    expect(r.member.date_of_birth).toBeNull();
    expect(r.reviewReasons.join(" ")).toMatch(/Unparseable Dob "the war years" \(Birthday was empty\)/);
  });

  it("still rejects an ambiguous Dob rather than guessing the month", () => {
    // 04/07 could be either way round. The rule for Birthday is the rule here.
    const ambiguous = rowWith({ id: "9101", "First Name": "Test", Dob: "04/07/1945" });
    const unambiguous = rowWith({ id: "9102", "First Name": "Test", Dob: "22/07/1945" });
    expect(unambiguous.member.date_of_birth).toBe("1945-07-22");
    // Whatever the mapper does with 04/07, it must do the SAME thing it does for Birthday —
    // asserted against Birthday itself so the two cannot drift apart.
    const viaBirthday = rowWith({ id: "9103", "First Name": "Test", Birthday: "04/07/1945" });
    expect(ambiguous.member.date_of_birth).toBe(viaBirthday.member.date_of_birth);
  });
});

describe("Spouse is a note and nothing else", () => {
  it("keeps the name verbatim on the row", () => {
    expect(byId("9007").spouse).toBe("Edith Pennington");
  });

  it("becomes one member note with a stable prefix", () => {
    const plan = planRowWrites(byId("9007"));
    expect(plan.notes.some((n) => n === "Spouse: Edith Pennington")).toBe(true);
  });

  it("never becomes a member, an emergency contact or a couple plan", () => {
    const r = byId("9007");
    const plan = planRowWrites(r);
    expect(plan.contacts.map((c) => c.contact_name)).not.toContain("Edith Pennington");
    // A couple plan is a paid thing; a name in a spreadsheet cell is not evidence of one.
    expect(r.subscription?.plan_type ?? null).not.toBe("couple");
    expect(plan.member?.first_name).toBe("Arthur");
  });
});

describe("Wellbeing Appt Date stays in raw", () => {
  it("reaches no mapped field", () => {
    const r = rowWith({ id: "9104", "First Name": "Test", "Wellbeing Appt Date": "12/12/2026" });
    const { raw, ...mappedOnly } = r;
    expect(JSON.stringify(mappedOnly)).not.toContain("12/12/2026");
    // And it IS kept, so this is "not mapped", not "thrown away".
    expect(raw["Wellbeing Appt Date"]).toBe("12/12/2026");
  });
});

describe("Contact Friend for Email is consent only when it is unambiguous", () => {
  it("accepts the tokens that can only mean yes", () => {
    for (const yes of ["yes", "Yes", "YES", "y", "si", "Sí", "sí", "true", "1", " yes "]) {
      expect(parseUnambiguousYes(yes), `"${yes}" should be a yes`).toBe(true);
    }
  });

  it("refuses everything else, including a sentence that starts with yes", () => {
    for (const no of ["", "no", "No", "maybe", "yes if she is in", "Margaret", "0", "false", "y/n"]) {
      expect(parseUnambiguousYes(no), `"${no}" is not consent`).toBe(false);
    }
  });

  it("sets the flag on the row that said Yes and not on the one that did not", () => {
    expect(byId("9007").emailContactConsent).toBe(true);
    // 9008's cell reads "only if Margaret is in" — a condition, not a permission.
    expect(byId("9008").emailContactConsent).toBe(false);
  });

  it("keeps the refused value in raw, so a human can read what it said", () => {
    expect(byId("9008").raw["Contact Friend for Email"]).toBe("only if Margaret is in");
  });

  it("carries onto the plan, so the preview shows consent before Import is pressed", () => {
    expect(planRowWrites(byId("9007")).emailContactConsent).toBe(true);
    expect(planRowWrites(byId("9008")).emailContactConsent).toBe(false);
  });

  it("is false for every other fixture row, so no row gets consent by accident", () => {
    for (const r of rows) {
      if (r.sourceId === "9007") continue;
      expect(r.emailContactConsent, `${r.sourceId} must not carry consent`).toBe(false);
    }
  });
});
