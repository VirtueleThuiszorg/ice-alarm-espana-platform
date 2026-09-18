// @vitest-environment node
//
// Card data must not survive the import — anywhere. Bank, key safe, private-insurance and
// funeral data must survive it into exactly one place each, and never into the staff-readable
// archive.
//
// THIS FILE CHANGED ON 18 SEPTEMBER 2026 and the change is the point of it. The original
// version pinned FOUR columns as discarded. Two of them should never have been on that list:
// `Private Medical Details` is about private health INSURANCE, not a medical record, and
// `Death Funeral Wishes` is the funeral director's name and telephone — the thing the office
// rings when a member dies. Both had admin-only tables built for them and both were being
// dropped because I swept them up with the card column. A third, the bank account, was
// discarded and is now imported to a new admin-only table by Lee's decision.
//
// So the assertions below are no longer "none of these four appears anywhere". They are, per
// column, exactly where the value is allowed to be and nowhere else — which is a stronger
// statement than the old one, and the one that was actually wanted.
//
// The importer used to keep them deliberately: this module's own header said card and bank
// columns "stay in crm_import_rows.raw for admin review, exactly as before — that behaviour was
// correct". It was not. `raw` is a jsonb column on a table staff can read; 94 rows of the real
// export carry card details and 85 a 20-digit bank number. Storing them means holding card data
// the platform has no reason to hold, cannot protect to PCI standard, and would have to disclose
// in a breach.
//
// Written as a SWEEP rather than a field-by-field check. Asserting `raw["Credit Card Details"]`
// is undefined only proves the one key I thought of; the card number could still be sitting in
// `special_instructions` because some other column concatenated it. So the test looks for the
// marker string anywhere in the serialised output, at any depth.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCsv,
  IceRow,
  mapIceCsv,
  summarise,
  REDACTED_HEADERS,
  RESTRICTED_HEADERS,
  ARCHIVE_EXCLUDED_HEADERS,
  normaliseHeader,
} from "../lib/iceCrmImport";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const csvText = readFileSync(FIXTURE, "utf8");

/** The exact values the fixture puts in the four redacted columns. */
const MARKERS = {
  card: "4111111111111111",
  cardTail: "cvv 123",
  bank: "ES9121000418450200051332",
  privateMedical: "SANITAS-PRIVATE-INSURER-MARKER",
  wishes: "FUNERAL-WISHES-MARKER",
} as const;

describe("the fixture is the real shape", () => {
  const parsed = parseCsv(csvText);

  it("has the exact 147-column header, duplicates included", () => {
    expect(parsed.headers.length).toBe(147);
    const count = (name: string) =>
      parsed.headers.filter((h) => h === normaliseHeader(name)).length;
    expect(count("Membership Type")).toBe(3);
    expect(count("Company")).toBe(2);
    expect(count("Policy Number")).toBe(2);
  });

  it("has 10 rows and really contains the card marker", () => {
    // If this fails every redaction assertion below is vacuous — the file would be proving
    // nothing was leaked from a file that never held anything.
    expect(parsed.rows.length).toBe(10);
    expect(csvText).toContain(MARKERS.card);
    expect(csvText).toContain(MARKERS.bank);
    expect(csvText).toContain(MARKERS.privateMedical);
    expect(csvText).toContain(MARKERS.wishes);
  });
});

describe("IceRow refuses to read a redacted column", () => {
  const parsed = parseCsv(csvText);
  const row = new IceRow(parsed.headers, parsed.rows[0]);

  it.each(REDACTED_HEADERS)("get(%s) returns empty", (header) => {
    expect(row.get(header)).toBe("");
  });

  it("still reports that the column HELD something", () => {
    // Presence without value: this is what lets the summary be honest.
    for (const h of REDACTED_HEADERS) {
      expect(row.redactedPresent(h)).toBe(true);
    }
  });

  it("reports absence when a redacted column is genuinely empty", () => {
    const other = new IceRow(parsed.headers, parsed.rows[1]);
    expect(other.redactedPresent("Credit Card Details")).toBe(false);
  });

  it("reads a NON-redacted column normally, so the guard is not just breaking get()", () => {
    expect(row.get("First Name")).toBe("Sensitive");
    expect(row.get("Home City")).toBe("Torremolinos");
  });

  it("refuses a RESTRICTED column through get(), but hands it over when asked by name", () => {
    // The distinction the whole design rests on: no new mapping can pick up a bank account by
    // adding an ordinary line, but the one mapping that needs it can ask.
    expect(row.get("20 Digit Bank No")).toBe("");
    expect(row.restricted("20 Digit Bank No")).toContain(MARKERS.bank);
  });

  it("omits every sensitive key from raw() entirely, rather than blanking them", () => {
    const raw = row.raw();
    for (const h of [...REDACTED_HEADERS, ...RESTRICTED_HEADERS, ...ARCHIVE_EXCLUDED_HEADERS]) {
      expect(Object.keys(raw), `${h} must not be archived`).not.toContain(h);
    }
    // Omission, not blanking: a key that is present but empty is the kind of thing a later
    // "restore the raw row" feature would happily fill back in. (Other columns ARE legitimately
    // empty in this fixture, so the assertion is on the redacted KEYS being gone, above.)
    expect(raw["First Name"]).toBe("Sensitive");
  });
});

describe("the card never survives mapping, at any depth", () => {
  const mapped = mapIceCsv(csvText);
  const serialised = JSON.stringify(mapped);

  it("maps all 10 rows", () => {
    expect(mapped.length).toBe(10);
  });

  it.each([MARKERS.card, MARKERS.cardTail])("the whole mapped output contains no %s", (marker) => {
    expect(serialised).not.toContain(marker);
  });

  it("contains no 16-digit card-shaped run anywhere", () => {
    // Independent of the fixture's exact marker: catches a card number arriving through a
    // column nobody thought about.
    expect(serialised).not.toMatch(/\b(?:\d[ -]?){15,19}\d\b/);
  });

  it("keeps the words from a card cell that holds no digits, and nothing else", () => {
    // 11 rows of the real export say how somebody pays rather than what their card is. The
    // rule is "no run of two or more digits anywhere in the cell", so a cell that is half a
    // card and half an instruction is refused whole — see IceRow.paymentMethodHint.
    const parsed = parseCsv(csvText);
    const withCard = new IceRow(parsed.headers, parsed.rows[0]);
    expect(withCard.paymentMethodHint()).toBe("");
  });
});

describe("the three restored columns land in exactly one place each", () => {
  const mapped = mapIceCsv(csvText);
  const row = mapped[0];

  it("the bank account reaches `bank` and nothing else", () => {
    expect(row.bank?.iban).toBe(MARKERS.bank);
    // Everywhere except `bank`: the marker must not have leaked into a note, an address, the
    // archive, or a field some other column concatenated it into.
    const withoutBank = JSON.stringify({ ...row, bank: null });
    expect(withoutBank).not.toContain(MARKERS.bank);
  });

  it("private medical INSURANCE reaches medical.private_insurer", () => {
    // The row carries an allergy, so `medical` is built at all — otherwise this would assert
    // against `undefined` and pass for the wrong reason.
    expect(row.medical).not.toBeNull();
    expect(row.medical?.private_insurer).toBe(MARKERS.privateMedical);
    // …and the policy number beside it still comes through, as it always did.
    expect(row.medical?.private_policy_number).toBe("POL-12345");
  });

  it("funeral wishes reach endOfLife.wishes", () => {
    expect(row.endOfLife?.wishes).toContain(MARKERS.wishes);
  });

  it("none of the four sensitive columns reaches the staff-readable archive", () => {
    // `crm_import_rows.raw` is jsonb on a table every staff role can read. The admin-only
    // tables above exist to withhold exactly this, and copying it into `raw` on the way past
    // would hand it to the whole call centre.
    const archive = JSON.stringify(row.raw);
    for (const marker of Object.values(MARKERS)) {
      expect(archive, `${marker} must not be in crm_import_rows.raw`).not.toContain(marker);
    }
  });

  it("keeps the raw row for everything else, so the archive is still useful", () => {
    expect(row.raw["Home City"]).toBe("Torremolinos");
    expect(Object.keys(row.raw).length).toBeGreaterThan(100);
  });
});

describe("the batch summary says what was discarded", () => {
  const summary = summarise(mapIceCsv(csvText));

  it("counts the rows that held each redacted column", () => {
    // One column, not four. The other three are imported now, each to a table only admins
    // can read — the screen should say what was DISCARDED, and only the card is.
    expect(summary.discardedSensitive).toEqual({ "Credit Card Details": 1 });
  });

  it("does not list a column no row carried", () => {
    // Reporting "0 rows had card data" invites the reader to conclude the check ran and found
    // nothing, when the column might simply be absent from a different export.
    const oneCleanRow = parseCsv(csvText);
    const header = oneCleanRow.headers.join(",");
    const clean = `${header}\r\n${new Array(147).fill("").join(",")}`;
    expect(summarise(mapIceCsv(clean)).discardedSensitive).toEqual({});
  });
});
