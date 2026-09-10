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
  overviewAsPrintHtml,
  overviewAsText,
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

describe("member overview — copy and print", () => {
  const sections = buildMemberOverview({
    ...EMPTY,
    member: { first_name: "Mary", last_name: "Quinn", city: "Marbella" },
  });

  it("copies as plain text with a heading and every row", () => {
    const out = overviewAsText(sections, "Mary Quinn — member record");
    expect(out).toContain("Mary Quinn — member record");
    expect(out).toContain("IDENTITY");
    expect(out).toContain("Name: Mary Quinn");
    expect(out).toContain("Town or city: Marbella");
    expect(out.endsWith("\n")).toBe(false);
  });

  it("the print document escapes free text instead of letting it become markup", () => {
    const risky = buildMemberOverview({
      ...EMPTY,
      member: { first_name: "Mary", last_name: "O'Brien & <Sons>" },
      medical: { additional_notes: '<script>alert("x")</script>' },
    });
    const html = overviewAsPrintHtml(risky, "Mary O'Brien & <Sons>", "Printed today");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;Sons&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Printed today");
    expect(html).toContain("break-inside:avoid");
  });

  it("counts the facts on the sheet", () => {
    expect(overviewFactCount(sections)).toBe(2);
    expect(overviewFactCount([])).toBe(0);
  });
});
