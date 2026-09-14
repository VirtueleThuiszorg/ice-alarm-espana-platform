/**
 * THE OVERVIEW SHEET — what lands on it, and what must never.
 *
 * The sheet's whole promise is *"only the information we HAVE"*. Two failures break it and both
 * are silent: a blank field rendered as a dash (the sheet becomes a form somebody failed to
 * fill in, and the four real facts are lost among thirty empty rows), and a fact we hold left
 * off it (whoever reads the sheet concludes we do not know, and stops looking).
 *
 * So the assertions here are mostly about ABSENCE, which is the half a rendering test cannot
 * see: you cannot look at a dialog and notice the row that is not there.
 */
import { describe, it, expect } from "vitest";
import {
  buildMemberOverview,
  overviewAsDocumentSections,
  IDENTITY_NUMBER_LABELS,
  overviewDate,
  overviewFactCount,
  type MemberOverviewData,
} from "@/lib/memberOverview";
import { MEDICAL_FIELDS } from "@/lib/medicalFields";
import { CONTACT_TYPES } from "@/lib/contactTypes";

const EMPTY: MemberOverviewData = {
  member: null,
  medical: null,
  contacts: null,
  device: null,
  subscription: null,
  payer: null,
};

function rowsOf(sections: ReturnType<typeof buildMemberOverview>, key: string) {
  return sections.find((s) => s.key === key)?.rows ?? [];
}
function valueOf(sections: ReturnType<typeof buildMemberOverview>, key: string, label: string) {
  return rowsOf(sections, key).find((r) => r.label === label)?.value;
}

describe("member overview — only what we have", () => {
  it("a record we hold nothing for produces no sections at all", () => {
    const sections = buildMemberOverview(EMPTY);
    expect(sections).toEqual([]);
    expect(overviewFactCount(sections)).toBe(0);
  });

  it("never emits a placeholder for an empty field", () => {
    const sections = buildMemberOverview({
      ...EMPTY,
      member: {
        first_name: "Mary",
        last_name: "Quinn",
        nie_dni: "",
        nationality: "   ",
        gender: null,
        nickname: undefined,
        address_line_1: "Calle Mayor 1",
        city: "Marbella",
      },
    });
    const labels = sections.flatMap((s) => s.rows.map((r) => r.label));
    expect(labels).toContain("Name");
    expect(labels).not.toContain("NIE / DNI");
    expect(labels).not.toContain("Nationality");
    expect(labels).not.toContain("Gender");
    expect(labels).not.toContain("Known as");
    // The failure this guards: "—" as a value anywhere on the sheet.
    for (const s of sections) {
      for (const r of s.rows) {
        expect(r.value.trim()).not.toBe("");
        expect(r.value).not.toBe("—");
        expect(r.value).not.toBe("-");
      }
    }
  });

  it("drops a section whose every field is empty, rather than printing a bare heading", () => {
    const sections = buildMemberOverview({
      ...EMPTY,
      member: { first_name: "Mary", last_name: "Quinn" },
      device: { imei: "", status: null, is_online: null },
      subscription: { plan_type: null, status: "" },
    });
    expect(sections.map((s) => s.key)).toEqual(["identity"]);
  });

  it("a false boolean is a fact and prints; an absent one does not", () => {
    const on = buildMemberOverview({ ...EMPTY, device: { imei: "1", is_online: false } });
    expect(valueOf(on, "device", "Online now")).toBe("No");
    const off = buildMemberOverview({ ...EMPTY, device: { imei: "1", is_online: null } });
    expect(rowsOf(off, "device").map((r) => r.label)).toEqual(["IMEI"]);
  });

  it("an empty array contributes nothing, a populated one is joined", () => {
    const none = buildMemberOverview({ ...EMPTY, medical: { allergies: [] } });
    expect(none).toEqual([]);
    const some = buildMemberOverview({ ...EMPTY, medical: { allergies: ["Penicillin", " "] } });
    expect(valueOf(some, "medical", "Allergies")).toBe("Penicillin");
  });
});

describe("member overview — the medical block cannot drift from the Medical tab", () => {
  it("renders every column medicalFields.ts declares, under its own label", () => {
    // A value for every column, so a field this sheet forgot shows up as a missing row rather
    // than as a fixture nobody wrote. This is the runtime half of the compile-time ratchet in
    // medicalFields.ts: that one catches a NEW column, this one catches a DROPPED render.
    const medical: Record<string, unknown> = {};
    for (const f of MEDICAL_FIELDS) {
      medical[f.column] = f.kind === "list" ? [`${f.column}-value`] : `${f.column}-value`;
    }
    const sections = buildMemberOverview({ ...EMPTY, medical });
    const labels = rowsOf(sections, "medical").map((r) => r.label);
    expect(labels).toEqual(MEDICAL_FIELDS.map((f) => f.label.fallback));
    expect(labels.length).toBeGreaterThanOrEqual(16);
  });
});

describe("member overview — emergency contacts", () => {
  it("names the relationship, and falls back to the contact type when there is none", () => {
    const sections = buildMemberOverview({
      ...EMPTY,
      contacts: [
        { contact_name: "Ann Quinn", relationship: "Daughter", phone: "600111222", is_primary: true },
        { contact_name: "Pepe", contact_type: "neighbour", phone: "600333444" },
      ],
    });
    const rows = rowsOf(sections, "contacts");
    expect(rows[0].value).toContain("Ann Quinn");
    expect(rows[0].value).toContain("Daughter");
    expect(rows[0].value).toContain("primary");
    const neighbour = CONTACT_TYPES.find((t) => t.type === "neighbour")!.label.fallback;
    expect(rows[1].value).toContain(neighbour);
    // Not the raw enum value — nobody reading a printout should meet "neighbour" as a code.
    expect(rows[1].value).not.toContain("contact_type");
  });

  it("drops a nameless contact rather than telling an operator to ring a stranger", () => {
    const sections = buildMemberOverview({
      ...EMPTY,
      contacts: [{ contact_name: "  ", phone: "600000000" }],
    });
    expect(sections).toEqual([]);
  });

  it("can_attend_in_person is tri-state: unknown stays unsaid", () => {
    const said = (v: boolean | null) =>
      rowsOf(
        buildMemberOverview({
          ...EMPTY,
          contacts: [{ contact_name: "Ann", can_attend_in_person: v }],
        }),
        "contacts",
      )[0].value;
    expect(said(true)).toContain("can attend in person");
    expect(said(false)).toContain("cannot attend in person");
    // The failure mode the migration named: an unknown rendered as "cannot" is worse than a
    // blank, because it looks like an answer.
    expect(said(null)).not.toContain("attend");
  });
});

describe("member overview — payer", () => {
  it("appears only when somebody else pays", () => {
    const alone = buildMemberOverview({ ...EMPTY, member: { first_name: "Mary" } });
    expect(alone.map((s) => s.key)).not.toContain("payer");
    const paid = buildMemberOverview({
      ...EMPTY,
      member: { first_name: "Mary" },
      payer: { full_name: "Ann Quinn", relationship: "Daughter" },
    });
    expect(valueOf(paid, "payer", "Name")).toBe("Ann Quinn");
  });
});

describe("member overview — dates and money", () => {
  it("reads as a date, not an ISO string", () => {
    expect(overviewDate("1938-04-05")).toMatch(/April 1938/);
    expect(overviewDate("1938-04-05")).not.toContain("1938-04-05");
  });

  it("spells the month in the reader's language, on the sheet as well as alone", () => {
    /*
      LONG FORM IN THREE LANGUAGES, and the reason is not politeness. `05/04/1938` and
      `04/05/1938` are the same eight characters and different days: a British member, a Spanish
      clinic and a Dutch relative each read that ordering as their own, and this sheet is handed
      between exactly those three. A month spelt out cannot be misread.
    */
    expect(overviewDate("1938-04-05", "es-ES")).toMatch(/abril/);
    expect(overviewDate("1938-04-05", "nl-NL")).toMatch(/april/);
    expect(overviewDate("1938-04-05", "es-ES")).toContain("1938");

    const spanish = buildMemberOverview(
      { ...EMPTY, member: { first_name: "Mary", date_of_birth: "1938-04-05" } },
      "es-ES",
    );
    expect(valueOf(spanish, "identity", "Date of birth")).toMatch(/abril/);
  });

  it("defaults to en-GB, so a caller that does not care is unchanged", () => {
    const sections = buildMemberOverview({
      ...EMPTY,
      member: { first_name: "Mary", date_of_birth: "1938-04-05" },
    });
    expect(valueOf(sections, "identity", "Date of birth")).toBe("5 April 1938");
  });

  it("an unparseable or absent date contributes nothing", () => {
    expect(overviewDate("not a date")).toBeNull();
    expect(overviewDate("")).toBeNull();
    expect(overviewDate(null)).toBeNull();
    const sections = buildMemberOverview({
      ...EMPTY,
      member: { first_name: "Mary", date_of_birth: "not a date" },
    });
    expect(rowsOf(sections, "identity").map((r) => r.label)).toEqual(["Name"]);
  });

  it("prints an amount as money and zero as a fact", () => {
    const sections = buildMemberOverview({
      ...EMPTY,
      subscription: { plan_type: "standard", amount: 34.5 },
    });
    expect(valueOf(sections, "membership", "Amount")).toBe("€34.50");
    const free = buildMemberOverview({ ...EMPTY, subscription: { plan_type: "standard", amount: 0 } });
    expect(valueOf(free, "membership", "Amount")).toBe("€0.00");
  });
});

describe("the sheet as a document — presentation only, never a second builder", () => {
  const OPTIONS = { includeIdentityNumbers: false, redactedLabel: "Held — not printed" };

  const sections = buildMemberOverview({
    ...EMPTY,
    member: {
      first_name: "Mary",
      last_name: "Quinn",
      city: "Marbella",
      phone: "+34600000001",
      nie_dni: "X1234567L",
      passport_number: "PA0099887",
      an_ss_number: "28/12345678-90",
      special_instructions: "Key safe left of the gate.\nDog in the yard.",
    },
  });

  const fieldOf = (key: string, label: string) =>
    overviewAsDocumentSections(sections, OPTIONS)
      .find((s) => s.key === key)
      ?.fields.find((f) => f.label === label);

  it("withholds all three identity numbers by default, on every surface that prints", () => {
    for (const label of IDENTITY_NUMBER_LABELS) {
      expect(fieldOf("identity", label)?.value).toBe("Held — not printed");
    }
  });

  it("prints them in full only when somebody asked for them", () => {
    const withIds = overviewAsDocumentSections(sections, {
      ...OPTIONS,
      includeIdentityNumbers: true,
    });
    const identity = withIds.find((s) => s.key === "identity")!;
    expect(identity.fields.find((f) => f.label === "NIE / DNI")?.value).toBe("X1234567L");
    expect(identity.fields.find((f) => f.label === "Passport")?.value).toBe("PA0099887");
    expect(identity.fields.find((f) => f.label === "Social security number")?.value).toBe(
      "28/12345678-90",
    );
  });

  it("REDACTS rather than removes — the row and the fact count are unchanged", () => {
    // "We hold a NIE and did not print it" and "we hold no NIE" are different facts, and the
    // sheet's whole promise is that it says which. A count that moved with a print option would
    // also make "21 details on file" mean nothing.
    const off = overviewAsDocumentSections(sections, OPTIONS);
    const on = overviewAsDocumentSections(sections, { ...OPTIONS, includeIdentityNumbers: true });
    expect(off.map((s) => s.fields.length)).toEqual(on.map((s) => s.fields.length));
    expect(off.find((s) => s.key === "identity")!.fields.map((f) => f.label)).toContain("Passport");
  });

  it("never withholds anything else — a redaction that matched everything would be silent", () => {
    expect(fieldOf("identity", "Name")?.value).toBe("Mary Quinn");
    expect(fieldOf("address", "Town or city")?.value).toBe("Marbella");
  });

  it("groups a phone number so it can be read down a line", () => {
    expect(fieldOf("contact", "Phone")?.value).toBe("+34 600 000 001");
  });

  it("gives a paragraph its own full-width box instead of the value column", () => {
    const notes = fieldOf("address", "Access notes");
    expect(notes?.note).toBe(true);
    expect(notes?.value).toContain("Dog in the yard.");
  });

  it("keeps every section, in order, with nothing added", () => {
    const docSections = overviewAsDocumentSections(sections, OPTIONS);
    expect(docSections.map((s) => s.key)).toEqual(sections.map((s) => s.key));
    expect(docSections.map((s) => s.fields.length)).toEqual(sections.map((s) => s.rows.length));
  });
});

describe("member overview — the fact count", () => {
  const sections = buildMemberOverview({
    ...EMPTY,
    member: { first_name: "Mary", last_name: "Quinn", city: "Marbella" },
  });

  it("counts the facts on the sheet", () => {
    expect(overviewFactCount(sections)).toBe(2);
    expect(overviewFactCount([])).toBe(0);
  });
});
