/**
 * EVERY FIELD WE CAN ASK FOR, ANSWERABLE — and nothing else writable.
 *
 * TWO FAILURES, ONE SUITE. `MemberUpdatePage` understood nine tokens while
 * `memberRequiredFields.ts` names eighteen a member can supply, so a ticked "date of birth"
 * produced a token that asked for it and a page that did not mention it: the request looked
 * sent and the field stayed empty. And `submit-member-update` spread the request body into a
 * service_role update, so the anonymous holder of a link could write ANY column on `members`.
 *
 * The first is a ratchet (a new required field with no control fails this suite); the second is
 * a whitelist, asserted by execution rather than by reading the interface that used to be
 * mistaken for one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEGACY_TOKEN_ALIASES,
  RENDERABLE_UPDATE_KEYS,
  UNSPECIFIED_REQUESTABLE_FIELDS,
  buildUpdateSubmission,
  groupUpdateFormFields,
  normaliseRequestedFields,
  requestedIncludesContacts,
  updateFormFields,
} from "@/lib/memberUpdateForm";
import { MEMBER_REQUIRED_FIELDS, requestableFields } from "@/lib/memberRequiredFields";
import {
  MEDICAL_WRITABLE_COLUMNS,
  MEMBER_PROVENANCE_COLUMNS,
  MEMBER_WRITABLE_COLUMNS,
  pickWritable,
  rejectedKeys,
} from "../../supabase/functions/_shared/member-update-writable.ts";

const SUBMIT_SRC = readFileSync(
  join(process.cwd(), "supabase/functions/submit-member-update/index.ts"),
  "utf8",
);

describe("the member's page can render everything we may ask them for", () => {
  it("no requestable required field is left without a control", () => {
    // The ratchet. If this fails, somebody added a required field a member can supply and no
    // way for them to supply it — which is the nine-of-eighteen state this replaces.
    expect(UNSPECIFIED_REQUESTABLE_FIELDS).toEqual([]);
  });

  it("covers all eighteen, and none of the three only we can do", () => {
    const requestable = requestableFields(MEMBER_REQUIRED_FIELDS).map((f) => f.key);
    expect(requestable.length).toBe(18);
    for (const key of requestable) expect(RENDERABLE_UPDATE_KEYS).toContain(key);
    for (const key of ["device_imei", "device_tested", "active_subscription"]) {
      expect(RENDERABLE_UPDATE_KEYS).not.toContain(key);
      // And asking for one anyway renders nothing rather than an unanswerable box.
      expect(updateFormFields([key])).toEqual([]);
    }
  });

  it("renders in required-field order, whatever order the token lists", () => {
    const keys = updateFormFields(["postal_code", "first_name", "blood_type"]).map((f) => f.key);
    expect(keys).toEqual(["first_name", "postal_code", "blood_type"]);
  });

  it("groups them the way the record groups them, empty groups omitted", () => {
    const groups = groupUpdateFormFields(updateFormFields(["nie_dni", "city", "allergies"]));
    expect(groups.map((g) => g.group)).toEqual(["identity", "address", "medical"]);
  });

  it("both contact requirements render ONE contact editor, not two", () => {
    /*
      `emergency_contact` and `emergency_contact_phone` are two separate required items — the
      Missing-info dialog ticks both when a member has no contacts at all — and they are
      answered by the same block. Without the guard the member gets the editor twice, adds
      their daughter in the first copy, and the second copy sits underneath looking empty.
    */
    const fields = updateFormFields(["emergency_contact", "emergency_contact_phone"]);
    expect(fields.filter((f) => f.target === "contacts")).toHaveLength(1);
    expect(requestedIncludesContacts(["emergency_contact_phone"])).toBe(true);
  });

  it("an unknown token is ignored rather than rendering a box that writes nowhere", () => {
    expect(updateFormFields(["not_a_field"])).toEqual([]);
  });
});

describe("tokens already in flight still work", () => {
  it("the old contact tokens map onto the contact editor", () => {
    expect(LEGACY_TOKEN_ALIASES.contacts_count).toBe("emergency_contact");
    expect(LEGACY_TOKEN_ALIASES.contacts_email).toBe("emergency_contact");
    expect(requestedIncludesContacts(["contacts_count"])).toBe(true);
    expect(requestedIncludesContacts(["contacts_email"])).toBe(true);
    expect(requestedIncludesContacts(["nie_dni"])).toBe(false);
  });

  it("both old tokens together do not render the contact editor twice", () => {
    const fields = updateFormFields(["contacts_count", "contacts_email"]);
    expect(fields.filter((f) => f.target === "contacts")).toHaveLength(1);
    expect(normaliseRequestedFields(["contacts_count", "contacts_email"])).toEqual([
      "emergency_contact",
    ]);
  });
});

describe("what the page submits", () => {
  const fields = updateFormFields([
    "first_name",
    "date_of_birth",
    "postal_code",
    "blood_type",
    "allergies",
  ]);

  it("splits by table and parses the list fields", () => {
    const out = buildUpdateSubmission(fields, {
      first_name: " Mary ",
      date_of_birth: "1938-04-05",
      blood_type: "O+",
      allergies: "Penicillin, , Shellfish",
    });
    expect(out.member).toEqual({ first_name: "Mary", date_of_birth: "1938-04-05" });
    expect(out.medical).toEqual({ blood_type: "O+", allergies: ["Penicillin", "Shellfish"] });
  });

  it("a blank is never sent — filling in two of five must not blank the other three", () => {
    const out = buildUpdateSubmission(fields, { first_name: "Mary", postal_code: "   " });
    expect(out.member).toEqual({ first_name: "Mary" });
    expect("postal_code" in out.member).toBe(false);
    expect(out.medical).toEqual({});
  });

  it("a list of only separators submits nothing rather than an empty array", () => {
    expect(buildUpdateSubmission(fields, { allergies: " , , " }).medical).toEqual({});
  });

  it("only what the token asked for is submitted, whatever is in the value map", () => {
    const out = buildUpdateSubmission(updateFormFields(["first_name"]), {
      first_name: "Mary",
      // Somebody's stale state, or a tampered client. Not requested, not sent.
      email: "attacker@example.com",
    });
    expect(out.member).toEqual({ first_name: "Mary" });
  });
});

describe("what the endpoint will accept", () => {
  it("everything the form can submit is on the whitelist", () => {
    for (const field of updateFormFields(RENDERABLE_UPDATE_KEYS)) {
      if (!field.column) continue;
      const allowed =
        field.target === "member"
          ? (MEMBER_WRITABLE_COLUMNS as readonly string[])
          : (MEDICAL_WRITABLE_COLUMNS as readonly string[]);
      expect(allowed).toContain(field.column);
    }
  });

  it("drops anything not on it", () => {
    const out = pickWritable(
      { first_name: "Mary", status: "active", user_id: "u1", crm_source: "x" },
      MEMBER_WRITABLE_COLUMNS,
    );
    expect(out).toEqual({ first_name: "Mary" });
    expect(rejectedKeys({ status: "active", first_name: "Mary" }, MEMBER_WRITABLE_COLUMNS)).toEqual([
      "status",
    ]);
  });

  it("nothing that decides identity, status or provenance is writable", () => {
    for (const column of MEMBER_PROVENANCE_COLUMNS) {
      expect(MEMBER_WRITABLE_COLUMNS as readonly string[]).not.toContain(column);
    }
    // Provenance on the medical row is stamped from the derived route; a submission that could
    // set it could claim an operator keyed the data.
    expect(MEDICAL_WRITABLE_COLUMNS as readonly string[]).not.toContain("recorded_via");
    expect(MEDICAL_WRITABLE_COLUMNS as readonly string[]).not.toContain("recorded_by_staff");
  });

  it("empty and absent values are dropped, so a partial form cannot blank a record", () => {
    expect(
      pickWritable(
        { first_name: "", last_name: undefined, city: null, phone: "600", medications: [] },
        MEMBER_WRITABLE_COLUMNS,
      ),
    ).toEqual({ phone: "600" });
  });
});

describe("the endpoint applies the whitelist rather than spreading the body", () => {
  it("no raw spread of the request payload survives", () => {
    expect(SUBMIT_SRC).not.toMatch(/\.\.\.member,/);
    expect(SUBMIT_SRC).not.toMatch(/\.\.\.medical,/);
    expect(SUBMIT_SRC).toContain("pickWritable(member, MEMBER_WRITABLE_COLUMNS)");
    expect(SUBMIT_SRC).toContain("pickWritable(medical, MEDICAL_WRITABLE_COLUMNS)");
    expect(SUBMIT_SRC).toContain("...memberUpdates,");
    expect(SUBMIT_SRC).toContain("...medicalUpdates,");
  });

  it("a refused key is recorded rather than silently dropped", () => {
    expect(SUBMIT_SRC).toContain("member_keys_refused");
    expect(SUBMIT_SRC).toContain("medical_keys_refused");
    expect(SUBMIT_SRC).toContain("refused_keys");
  });
});
