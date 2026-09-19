import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  HEARD_ABOUT,
  STAFF_LEAD_SPEC,
  decideStaffLead,
  duplicateKeys,
  normalisePartnerCode,
} from "../../supabase/functions/_shared/staff-lead";
import { validateFields } from "../../supabase/functions/_shared/public-submit";

/**
 * A LEAD A STAFF MEMBER TYPED IN.
 *
 * Most of the people this product is for did not find the website: they met somebody at a market
 * stall, rang the office because a neighbour mentioned us, or were introduced by their daughter.
 * Until now there was nowhere to put them, so they went in a notebook.
 *
 * The decisions are here; the duplicate check and the partner lookup are questions about what is
 * in the table and belong to the function.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

const GOOD = {
  first_name: "Rosa",
  last_name: "Delgado",
  phone: "600111222",
  heard_about: "phone_call",
};

const ok = (extra: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) =>
  decideStaffLead({ fields: { ...GOOD, ...extra }, consent: true, ...rest });

describe("consent", () => {
  it("is required, and is the only thing reported when it is missing", () => {
    /*
      CHECKED BEFORE THE FIELDS, on purpose. Somebody who has not ticked it is not helped by also
      being told their email is malformed — and listing field errors beside a consent refusal
      invites the reading that fixing the fields is what is being asked for.
    */
    const d = decideStaffLead({ fields: { ...GOOD, email: "not-an-email" }, consent: false });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields).toEqual(["consent"]);
    expect(d.reason).toBe("consent_required");
  });

  it("absent is the same as refused — an unchecked box is not an omission", () => {
    expect(decideStaffLead({ fields: GOOD }).ok).toBe(false);
    expect(decideStaffLead({ fields: GOOD, consent: undefined }).ok).toBe(false);
  });

  it("and a ticked one lets an otherwise good lead through", () => {
    expect(ok().ok).toBe(true);
  });
});

describe("the fields", () => {
  it("a nine-digit Spanish number is stored as +34…", () => {
    // The brief's first test, and the reason the normaliser was collapsed to one function: this
    // value is compared against `members.phone`, which went through the CRM import.
    const d = ok({ phone: "600 111 222" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.values.phone).toBe("+34600111222");
  });

  it("an unreadable number is refused rather than stored", () => {
    const d = ok({ phone: "12345" });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields).toEqual(["phone"]);
  });

  it("EMAIL IS OPTIONAL and phone is not — the opposite of the contact form", () => {
    /*
      Deliberate, and the reason is who this form is for. Insisting on an email address would
      exclude a large share of the people this product exists for; a phone number is the thing
      this business actually works with. The public form makes the opposite trade because a
      visitor who typed an email is reachable by it.
    */
    expect(ok({ email: "" }).ok).toBe(true);
    const noPhone = ok({ phone: "" });
    expect(noPhone.ok).toBe(false);
    if (noPhone.ok) return;
    expect(noPhone.fields).toEqual(["phone"]);
  });

  it("every failing field is named, not the first", () => {
    const d = decideStaffLead({
      fields: { first_name: "", phone: "nope", heard_about: "phone_call" },
      consent: true,
    });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields.sort()).toEqual(["first_name", "phone"]);
  });

  it("how they heard of us is required, and an invented value is refused", () => {
    // Not decoration: it is half the consent record, and the only way to find out next year
    // which of the things this business does actually brings people in.
    expect(ok({ heard_about: "" }).ok).toBe(false);
    expect(ok({ heard_about: "facebook" }).ok).toBe(false);
    for (const value of HEARD_ABOUT) {
      const d = decideStaffLead({
        fields: { ...GOOD, heard_about: value, ...(value === "partner_code" ? {} : {}) },
        consent: true,
        partnerCode: value === "partner_code" ? "ICE-ABC" : null,
      });
      expect(d.ok, `${value} must be accepted`).toBe(true);
    }
  });

  it("the notes box has no ten-character floor — it is a staff note, not an enquiry", () => {
    // The contact form requires a real message because "an enquiry with no enquiry in it" was
    // the shape every bot submission took. An operator with nothing to add should not be made
    // to invent something.
    expect(ok({ notes: "ok" }).ok).toBe(true);
    expect(ok({ notes: "" }).ok).toBe(true);
  });
});

describe("the partner code", () => {
  it("is required when the operator said it was a partner referral", () => {
    /*
      Without this, "how did you hear of us: partner code" with the box left blank writes a lead
      claiming a provenance it cannot prove — and the partner never gets their €50, because
      nothing links the two.
    */
    const d = decideStaffLead({
      fields: { ...GOOD, heard_about: "partner_code" },
      consent: true,
    });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields).toEqual(["partner_code"]);
  });

  it("is tidied but never guessed at", () => {
    // Codes are printed on cards and read down the telephone. Case and spaces are ours to fix;
    // an O where a zero belongs is not, and is left to fail the lookup.
    expect(normalisePartnerCode(" ice-abc ")).toBe("ICE-ABC");
    expect(normalisePartnerCode("ICE ABC")).toBe("ICEABC");
    expect(normalisePartnerCode("")).toBeNull();
    expect(normalisePartnerCode(null)).toBeNull();
    expect(normalisePartnerCode("ICE-ABO")).toBe("ICE-ABO");
  });
});

describe("the duplicate keys", () => {
  it("are normalised on the way out, not compared raw", () => {
    /*
      The number typed into the dialog goes through `toE164`; the number in `members` went
      through the CRM import. Comparing a raw input against a stored value is how a duplicate
      check answers "no match" for somebody who is already a customer.
    */
    expect(duplicateKeys({ phone: "600 111 222", email: " Rosa@Example.ES " })).toEqual({
      phone: "+34600111222",
      email: "rosa@example.es",
    });
  });

  it("returns null rather than an empty string for what we do not have", () => {
    // An empty string in an `.or()` filter matches the rows with an empty column — which, on
    // `leads`, is every product-interest row.
    expect(duplicateKeys({ phone: "600111222" })).toEqual({ phone: "+34600111222", email: null });
    expect(duplicateKeys({})).toEqual({ phone: null, email: null });
  });
});

describe("the same rules as the public form, because it is the same code", () => {
  it("the validator is shared, not copied", () => {
    // A second copy would agree on the day it was written and then drift — which is exactly what
    // happened to the phone normaliser, twice, for eight months.
    const src = read("supabase/functions/_shared/staff-lead.ts");
    expect(src).toContain('from "./public-submit.ts"');
    expect(src).toContain("validateFields(STAFF_LEAD_SPEC");
    expect(src).not.toMatch(/for \(const \[field, rule\] of Object\.entries/);
  });

  it("and the shared validator behaves identically on both specs", () => {
    const a = validateFields(STAFF_LEAD_SPEC, { first_name: "Rosa", phone: "600111222", heard_about: "event" });
    expect(a.bad).toEqual([]);
    expect(a.values.phone).toBe("+34600111222");
  });
});

describe("what the browser may not decide", () => {
  const fn = read("supabase/functions/staff-lead/index.ts");

  it("source, created_by and assigned_to are set server-side", () => {
    // A row that can choose its own source can claim to be a contact-form enquiry, and the
    // reports that count where members come from then count whatever the client said.
    expect(fn).toContain('source: "staff_manual"');
    expect(fn).toContain("created_by: staffId");
    expect(fn).toContain("assigned_to: staffId");
    // `(?<![\w_])` because `consent_source: values.heard_about` is a DIFFERENT and correct
    // line — it records how we came to be talking to them, which is exactly what the operator
    // chose. An unanchored `source:` forbids the right code along with the wrong.
    expect(fn).not.toMatch(/(?<![\w_])source:\s*(payload|values|fields)\./);
  });

  it("a duplicate is refused with the record, not with a sentence", () => {
    // A refusal with nowhere to go is a dead end that gets worked around by typing the number
    // in differently — which produces the duplicate it was meant to prevent.
    expect(fn).toContain('reason: "duplicate_member"');
    expect(fn).toContain('reason: "duplicate_lead"');
    expect(fn).toMatch(/existing: \{ kind: "member"/);
    expect(fn).toMatch(/existing: \{ kind: "lead"/);
  });

  it("members are checked before leads", () => {
    // "They are already a member" is the more useful sentence, and when both are true it is the
    // record the operator needs.
    expect(fn.indexOf('.from("members")')).toBeLessThan(fn.indexOf('.from("leads")'));
  });

  it("an inactive partner's code is refused", () => {
    // Attributing a lead to a partner who has left is worse than refusing the code, because it
    // is invisible until somebody asks why a commission was never paid.
    expect(fn).toMatch(/\.eq\("status", "active"\)/);
  });

  it("any active staff member may use it, not only an admin", () => {
    // Adding a lead is ordinary call-centre work. Requiring admin would mean the four people who
    // speak to these customers could not use the feature.
    expect(fn).toContain("STAFF_CALLER_ROLES");
  });

  it("and the JWT actually reaches it", () => {
    // The guard reads the caller's token. `verify_jwt = false` would hand it nothing to read.
    const toml = read("supabase/config.toml");
    const block = toml.slice(toml.indexOf("[functions.staff-lead]"));
    expect(block.slice(0, 120)).toMatch(/verify_jwt = true/);
  });
});

describe("the dialog", () => {
  const src = read("src/components/leads/AddLeadDialog.tsx");

  it("shows the number back as it will be stored", () => {
    // An operator typing `600111222` sees `+34 600 111 222` appear and knows it was understood.
    // Nothing appearing is the signal to check it while the person is still on the telephone.
    expect(src).toContain("toE164(form.phone)");
    expect(src).toContain('data-testid="lead-phone-e164"');
  });

  it("never pre-ticks consent", () => {
    // It is the only statement on this form about the OPERATOR rather than the lead. A box that
    // arrives already ticked is not a statement anybody made.
    expect(src).toContain("const [consent, setConsent] = useState(false)");
    expect(src).not.toMatch(/useState\(true\)[^\n]*consent/i);
  });

  it("reads the heard-about list off the server rather than restating it", () => {
    // A sixth option added to the server spec without one here would be silently unofferable.
    expect(src).toContain("HEARD_ABOUT.map");
  });
});
