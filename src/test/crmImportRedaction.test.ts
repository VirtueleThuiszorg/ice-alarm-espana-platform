// @vitest-environment node
//
// Card and bank data must not survive the import — anywhere.
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

  it("has 8 rows and really contains the card marker", () => {
    // If this fails every redaction assertion below is vacuous — the file would be proving
    // nothing was leaked from a file that never held anything.
    expect(parsed.rows.length).toBe(8);
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

  it("omits redacted keys from raw() entirely, rather than blanking them", () => {
    const raw = row.raw();
    for (const h of REDACTED_HEADERS) {
      expect(Object.keys(raw)).not.toContain(h);
    }
    // Omission, not blanking: a key that is present but empty is the kind of thing a later
    // "restore the raw row" feature would happily fill back in. (Other columns ARE legitimately
    // empty in this fixture, so the assertion is on the redacted KEYS being gone, above.)
    expect(raw["First Name"]).toBe("Sensitive");
  });
});

describe("no redacted value survives mapping, at any depth", () => {
  const mapped = mapIceCsv(csvText);
  const serialised = JSON.stringify(mapped);

  it("maps all 8 rows", () => {
    expect(mapped.length).toBe(8);
  });

  it.each(Object.entries(MARKERS))("the whole mapped output contains no %s", (_name, marker) => {
    expect(serialised).not.toContain(marker);
  });

  it("contains no 16-digit card-shaped run anywhere", () => {
    // Independent of the fixture's exact marker: catches a card number arriving through a
    // column nobody thought about.
    expect(serialised).not.toMatch(/\b(?:\d[ -]?){15,19}\d\b/);
  });

  it("private_insurer is null even though the column had a value", () => {
    const row = mapped[0];
    // The row carries an allergy, so `medical` is built at all — otherwise this would assert
    // against `undefined` and pass for the wrong reason.
    expect(row.medical).not.toBeNull();
    expect(row.medical?.private_insurer).toBeNull();
    // …and the policy number beside it, which is NOT redacted, still comes through.
    expect(row.medical?.private_policy_number).toBe("POL-12345");
  });

  it("keeps the raw row for everything else, so the archive is still useful", () => {
    const raw = mapped[0].raw;
    expect(raw["Home City"]).toBe("Torremolinos");
    expect(Object.keys(raw).length).toBeGreaterThan(100);
  });
});

describe("the batch summary says what was discarded", () => {
  const summary = summarise(mapIceCsv(csvText));

  it("counts the rows that held each redacted column", () => {
    expect(summary.discardedSensitive).toEqual({
      "Credit Card Details": 1,
      "20 Digit Bank No": 1,
      "Private Medical Details": 1,
      "Death Funeral Wishes": 1,
    });
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
