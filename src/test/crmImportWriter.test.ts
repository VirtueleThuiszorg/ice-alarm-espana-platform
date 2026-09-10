// @vitest-environment node
//
// What the import would write, decided before anything is written.
//
// Every assertion here is about a lie the previous writer told to satisfy a NOT NULL column:
//
//   email          `imported-${Date.now()}@placeholder.local`
//   phone          'N/A'
//   address/city   'N/A'
//   status         'active'  — hardcoded, for all 431 rows
//   device SIM     'TBD'     device status 'active'
//   contact phone  'N/A'     when the CRM had a name but no number
//
// The last one is the one that matters most: an operator running the escalation ladder during an
// SOS would have been handed 'N/A' to dial. The second is `status: 'active'`, which breaks
// golden rule 4 and would have activated 199 cancelled and 54 deceased people.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv, type MappedRow } from "../lib/iceCrmImport";
import { planRowWrites, summarisePlans, plansToCsv } from "../lib/crmImportWriter";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const mapped = mapIceCsv(readFileSync(FIXTURE, "utf8"));
const plans = mapped.map(planRowWrites);
const byId = (id: string) => {
  const p = plans.find((x) => x.sourceId === id);
  if (!p) throw new Error(`no plan for ${id}`);
  return p;
};

describe("the fixture produced plans at all", () => {
  it("has one plan per row", () => {
    // Guards every assertion below from passing over an empty list.
    expect(plans.length).toBe(6);
    expect(mapped.length).toBe(6);
  });
});

describe("nothing is invented to satisfy a NOT NULL column", () => {
  it("never writes a placeholder email", () => {
    for (const p of plans) {
      expect(p.member?.email ?? "").not.toMatch(/placeholder\.local/);
      expect(p.member?.email ?? "").not.toMatch(/^imported-/);
    }
  });

  it("never writes 'N/A' or 'TBD' into any planned field", () => {
    const serialised = JSON.stringify(plans);
    expect(serialised).not.toMatch(/"N\/A"/);
    expect(serialised).not.toMatch(/"TBD"/);
  });

  it("a row missing a required field becomes a CRM contact, not a member with holes", () => {
    // Every planned member has all nine required columns really filled.
    for (const p of plans.filter((x) => x.outcome === "member")) {
      const m = p.member!;
      for (const v of [
        m.first_name, m.last_name, m.email, m.phone, m.date_of_birth,
        m.address_line_1, m.city, m.province, m.postal_code,
      ]) {
        expect(v).toBeTruthy();
      }
    }
  });

  it("says WHY a row is not a member", () => {
    for (const p of plans.filter((x) => x.outcome !== "member")) {
      expect(p.blockers.length).toBeGreaterThan(0);
    }
  });
});

describe("golden rule 4: an import never activates anybody", () => {
  it("plans every member as inactive", () => {
    const statuses = new Set(plans.filter((p) => p.member).map((p) => p.member!.status));
    expect([...statuses]).toEqual(["inactive"]);
  });

  it("puts the verbatim Karma status on the CRM profile instead of losing it", () => {
    const p = byId("9001");
    expect(p.crmProfile.status).toBe("Active Member");
    // …and that string is nowhere near members.status.
    expect(p.member?.status).toBe("inactive");
  });

  it("plans no subscription at all", () => {
    // Activation is the payment webhook's job. An import that wrote a subscription row would be
    // asserting a payment this platform has never seen.
    for (const p of plans) {
      expect(Object.keys(p)).not.toContain("subscription");
    }
  });
});

describe("an emergency contact with no number is never written as one", () => {
  const p = byId("9004");

  it("writes the three contacts that DO have numbers", () => {
    expect(p.contacts.length).toBe(3);
    expect(p.contacts.map((c) => c.contact_name)).toContain("Susan Smith");
  });

  it("reads the two-space header `Contact  1 - Tel`", () => {
    // The real export has two spaces there. One space and the number is silently absent.
    const susan = p.contacts.find((c) => c.contact_name === "Susan Smith");
    expect(susan?.phone).toBe("+447700900123");
  });

  it("parses the relationship out of the brackets", () => {
    const susan = p.contacts.find((c) => c.contact_name === "Susan Smith");
    expect(susan?.relationship).toBe("Sister in UK");
  });

  it("normalises a bare 9-digit Spanish number to +34", () => {
    const peter = p.contacts.find((c) => c.contact_name === "Peter Smith");
    expect(peter?.phone).toBe("+34600987654");
  });

  it("drops a name with no number to a note, and warns", () => {
    const withNoPhone: MappedRow = {
      ...mapped[0],
      contacts: [
        { contactName: "Nameless Number", phone: null, relationship: "Son", priorityOrder: 1, contactType: "emergency" },
      ],
    };
    const plan = planRowWrites(withNoPhone);
    expect(plan.contacts).toEqual([]);
    expect(plan.contactsWithoutPhone).toEqual(["Nameless Number (Son)"]);
    expect(plan.warnings.join(" ")).toMatch(/no usable number/);
    // The name survives as a note — losing it would be the other kind of mistake.
    expect(plan.notes.join(" ")).toContain("Nameless Number");
  });

  it("marks the first emergency contact primary, and a key holder never", () => {
    const kh = byId("9003");
    expect(kh.contacts.length).toBe(1);
    expect(kh.contacts[0].contact_type).toBe("key_holder");
    expect(kh.contacts[0].is_primary).toBe(false);
  });
});

describe("the device", () => {
  const p = byId("9003");

  it("takes the 15-digit IMEI and leaves the docking text behind", () => {
    expect(p.device?.imei ?? byId("9003").notes.join(" ")).toContain("865513075018479");
  });

  it("keeps the docking-station MAC as a note rather than in the IMEI", () => {
    const all = JSON.stringify(p);
    expect(all).toContain("E7:E9:C4:86:52:10");
    if (p.device) expect(p.device.imei).toBe("865513075018479");
  });

  it("is never planned 'active' — an import has witnessed no test call", () => {
    // Built explicitly rather than looked for in the fixture. The `if (plan.device)` version of
    // this test passed while the code said `status: "active"`, because no fixture row produces
    // a device at all: the one IMEI in the file has no SIM number beside it, so the plan
    // correctly records a note instead. An assertion guarded by a condition that never holds is
    // not an assertion.
    const withDevice: MappedRow = {
      ...mapped[0],
      device: {
        imei: "865513075018479",
        docking_station_mac: "E7:E9:C4:86:52:10",
        sim_phone_number: "+46719103171",
        device_type: null,
        manufacturer: null,
        unit_type: null,
        notes: null,
      },
    };
    const plan = planRowWrites(withDevice);
    expect(plan.device).not.toBeNull();
    expect(plan.device?.status).toBe("in_stock");
    // The docking MAC rides along as a note, not inside the IMEI.
    expect(plan.device?.imei).toBe("865513075018479");
    expect(plan.device?.notes).toContain("E7:E9:C4:86:52:10");
  });

  it("creates no device row when the CRM has no SIM number, and says so", () => {
    if (!p.device) {
      expect(p.warnings.join(" ")).toMatch(/no SIM number/);
      expect(p.notes.join(" ")).toContain("865513075018479");
    }
  });
});

describe("the address comes from the Home* block", () => {
  it("joins House Number and Home Street", () => {
    const p = byId("9001");
    expect(p.parsedMember.address_line_1).toBe("12 Calle Redaccion");
    expect(p.parsedMember.city).toBe("Torremolinos");
    expect(p.parsedMember.province).toBe("Málaga");
    expect(p.parsedMember.postal_code).toBe("29620");
  });
});

describe("dates are DD/MM/YYYY, explicitly", () => {
  it("reads a day past the 12th that new Date() rejects", () => {
    // 25/12/1940. `new Date("25/12/1940")` is Invalid Date.
    expect(byId("9001").parsedMember.date_of_birth).toBe("1940-12-25");
    expect(Number.isNaN(new Date("25/12/1940").getTime())).toBe(true);
  });

  it("does not silently swap day and month on an ambiguous date", () => {
    // 04/07/1945 is 4 July, not 7 April. Getting this wrong puts the wrong DOB on a medical
    // record, and nothing downstream would ever notice.
    expect(byId("9003").parsedMember.date_of_birth).toBe("1945-07-04");
  });
});

describe("multi-phone cells", () => {
  const p = byId("9002");

  it("takes the first human number as the member's phone", () => {
    expect(p.parsedMember.phone).toBe("+34952383121");
  });

  it("keeps the other numbers rather than dropping them", () => {
    expect(p.extraPhones.length).toBeGreaterThan(0);
  });

  it("does not put the pendant's own SIM in as the member's phone", () => {
    // '+46 719 …' is the device SIM. Calling it reaches the pendant, not the person.
    expect(p.parsedMember.phone).not.toMatch(/^\+46719/);
  });
});

describe("the summary answers 'why is this not a member?' at scale", () => {
  const s = summarisePlans(plans);

  it("counts outcomes", () => {
    expect(s.total).toBe(6);
    expect(s.members + s.crmContacts + s.skipped).toBe(6);
  });

  it("counts each blocker reason", () => {
    const total = Object.values(s.blockerCounts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(s.crmContacts);
  });

  it("counts contacts dropped for want of a number", () => {
    expect(typeof s.contactsDroppedNoPhone).toBe("number");
  });
});

describe("the preview CSV is the plan, not a second opinion", () => {
  const csv = plansToCsv(plans);
  const lines = csv.trimEnd().split("\r\n");

  it("has a row per plan", () => {
    expect(lines.length - 1).toBe(plans.length);
  });

  it("carries the outcome and the reason", () => {
    expect(lines[0]).toContain("outcome");
    expect(lines[0]).toContain("why_not_member");
  });

  it("quotes a field containing a semicolon-joined list with commas", () => {
    const withComma = plansToCsv([{ ...plans[0], warnings: ["one, two"] }]);
    expect(withComma).toContain('"one, two"');
  });

  it("leaks no card data", () => {
    expect(csv).not.toContain("4111");
  });
});
