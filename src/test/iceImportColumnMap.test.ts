// @vitest-environment node
//
// WHERE EVERY ONE OF THE 147 COLUMNS GOES, PROVED BY RUNNING THE MAPPER.
//
// Lee asked for a table of the 147 columns → destination field / kept in raw / discarded, so he
// can check nothing he needs is dropped. A table I wrote by reading the code would be a table of
// what I believe the code does; the two are the same right up to the column that matters.
//
// So this file DERIVES the table. For each column, by INDEX rather than by name — three columns
// are called "Membership Type" and two "Policy Number", and which occurrence wins is part of
// what the table has to say — it maps a row holding a probe value in that column and nothing
// else, and diffs the result against a row that is entirely empty. Every field that CHANGED is a
// destination of that column.
//
// Diffing rather than searching for the probe string is what makes the derivation complete: it
// catches `has_pendant` becoming true, a status enum landing, a number being parsed out of
// "€35 per month" — destinations no string search would find.
//
// Several probe values are tried per column (text, a date, a phone, an email, an IMEI, an
// amount, a coordinate pair, "Yes") and the destinations are the union, because a column that
// only accepts a date shows nothing when handed the word "PROBE" — and "shows nothing" would
// have been written down as "dropped".
//
// The committed table is then asserted to match. Regenerate with:
//
//     UPDATE_COLUMN_MAP=1 npx vitest run src/test/iceImportColumnMap.test.ts
//
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv, parseCsv, REDACTED_HEADERS, SENSITIVE_PAYMENT_HEADERS } from "../lib/iceCrmImport";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const DOC = join(process.cwd(), "ICE_IMPORT_COLUMN_MAP.md");

const HEADERS = parseCsv(readFileSync(FIXTURE, "utf8")).headers;

/** Probe values. One column may only reveal itself to one of them. */
const PROBES = [
  "ZQXPROBE",
  "25/12/1940",
  "+34 655 111 222",
  "probe@example.com",
  "865513075018479",
  "35.50",
  "36.6200,-4.5000",
  "Yes",
  "Active Member",
  "Male",
  "O-",
  "Direct Debit",
  "Single",
  "Watch",
  "Monthly",
  "Annual",
];

/**
 * The baseline row is a REALISTIC row, not an empty one, and that is what makes the table
 * readable.
 *
 * Against an empty row, a column feeding `medical` makes the whole object materialise, so all
 * seventeen medical fields "changed" and `Blood Group` reads as a destination of every one of
 * them. Worse, a column the mapper genuinely reads shows NOTHING when the object it feeds is
 * only built if something else is present: `Payment Type` is read, but `subscription` is null
 * unless there is also a membership label, a join date or a pendant — so an empty-row probe
 * would have written "kept in raw only" beside a column that is read.
 *
 * With the spine present, every container already exists, and a probe changes exactly the fields
 * that column reaches.
 */
const SPINE: Record<string, string> = {
  "First Name": "Base",
  "Last Name": "Row",
  Status: "Active Member",
  Stage: "Client",
  "Membership Type": "Single",
  "Date Joined": "01/01/2020",
  "Payment Type": "Direct Debit",
  "Personal Pendant": "Yes",
  "Pendant IMEI": "865513075018479",
  "Blood Group": "A+",
  "Medical Condition 1": "Base condition",
  "Contact 1 - Name": "Base Contact (Son)",
  "Contact 1 - Tel": "+34600000001",
  "Key Holder 1 - Name": "Base Holder",
  "Home Street": "Calle Base",
  "House Number": "1",
  "Home City": "Torremolinos",
  "Home State": "Malaga",
  "Home Postal Code": "29620",
  Birthday: "01/01/1940",
  "Phone (m)": "+34600000002",
  "Email (h)": "base@example.com",
  Street: "Calle Postal",
  "City/Town": "Malaga",
  "Postal Code": "29001",
  "Funeral Plan": "Base plan",
  "Key Safe": "Under the pot / 1234",
  "Important Medical Info": "Base info",
};

/** First occurrence wins, which is also the rule the mapper follows for duplicate headers. */
const spineCells = (): string[] => {
  const cells = HEADERS.map(() => "");
  for (const [header, value] of Object.entries(SPINE)) {
    const index = HEADERS.indexOf(header);
    if (index === -1) throw new Error(`SPINE names a column that is not in the export: ${header}`);
    cells[index] = value;
  }
  return cells;
};

/**
 * Never a destination: the audit copy, and the two human-readable flag lists.
 *
 * `warnings` and `reviewReasons` quote the offending value, so almost every column would "reach"
 * them and the table would say nothing about where the data went. `sourceId` and
 * `member.crm_source_id` are NOT ignored — the `id` column is their destination, and that
 * belongs in the table.
 */
const IGNORED_PREFIXES = ["raw", "warnings", "reviewReasons"];

function flatten(value: unknown, path = "", out: Map<string, string> = new Map()) {
  if (value === null || value === undefined) {
    out.set(path, "∅");
  } else if (Array.isArray(value)) {
    if (value.length === 0) out.set(path, "[]");
    else value.forEach((v, i) => flatten(v, `${path}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, path ? `${path}.${k}` : k, out);
    }
  } else {
    out.set(path, String(value));
  }
  return out;
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function mapProbeRow(columnIndex: number | null, probe: string, withSpine = true) {
  const cells = withSpine ? spineCells() : HEADERS.map(() => "");
  if (columnIndex !== null) cells[columnIndex] = probe;
  const csv = [HEADERS.map(csvCell).join(","), cells.map(csvCell).join(",")].join("\r\n");
  const rows = mapIceCsv(csv);
  expect(rows.length).toBe(1);
  return flatten(rows[0]);
}

/**
 * Paths that differ between the baseline row and the same row with one column probed.
 *
 * `withSpine: false` probes against an EMPTY row instead, which is how a fallback column shows
 * itself: `Joined Date` and the second and third `Membership Type` are read only when the column
 * that usually supplies the field is empty, and against the spine they change nothing at all.
 * Materialisation noise is filtered there — an empty row has no `medical` object, so a probe
 * that creates one would otherwise "reach" all seventeen of its fields.
 */
function destinationsFor(columnIndex: number, withSpine = true): string[] {
  const found = new Set<string>();
  for (const probe of PROBES) {
    const baseline = mapProbeRow(null, probe, withSpine);
    const probed = mapProbeRow(columnIndex, probe, withSpine);
    for (const [path, value] of probed) {
      if (IGNORED_PREFIXES.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`))) continue;
      if (baseline.get(path) === value) continue;
      // An object that merely came into existence is not a destination of every field it holds.
      if (!withSpine && (value === "∅" || value === "[]")) continue;
      found.add(path.replace(/\[\d+\]/g, "[]"));
    }
    // A path that exists only in the baseline (a field the probe removed) counts too.
    for (const path of baseline.keys()) {
      if (IGNORED_PREFIXES.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`))) continue;
      if (!probed.has(path)) found.add(path.replace(/\[\d+\]/g, "[]"));
    }
  }
  return [...found].sort();
}

const REDACTED = new Set<string>(REDACTED_HEADERS);
const SENSITIVE = new Set<string>(SENSITIVE_PAYMENT_HEADERS);

/**
 * The unmapped columns worth a decision, and why. This is the one hand-written part of the
 * document, and it is a judgement rather than a derivation — so a test asserts every name here
 * really is unmapped, and the prose says which part is which.
 */
const NOTABLE: Record<string, string> = {
  Dob: "a SECOND date-of-birth column beside `Birthday`. If some rows have one and not the other, this is the difference between a member with a date of birth and a member without.",
  Name: "the full name, where the import uses `First Name` + `Last Name`. Only matters for rows where the split columns are empty and this one is not.",
  Spouse: "who else lives there. Not an emergency contact today, and arguably should be one.",
  "Wellbeing Appt Date": "if wellbeing appointments are still run, this is the schedule.",
  Company: "appears twice. Empty for a private client; may hold the residence for a partner one.",
  "Lead Recieved": "when the enquiry arrived — the only record of how long somebody waited.",
  "Contact Friend for Email": "reads like a consent flag about contacting a relative by email. Consent is not something to guess at.",
};

/** Karma's own layout artefacts: section headings exported as columns. */
const SECTION_HEADERS = [
  "Membership Information",
  "Home Address",
  "Postal Address (If Different)",
  "Personal Information",
  "Emergency Contacts",
];

interface Row {
  index: number;
  header: string;
  verdict: string;
  destinations: string[];
}

function buildRows(): Row[] {
  return HEADERS.map((header, index) => {
    if (REDACTED.has(header)) {
      return { index, header, verdict: "discarded — never reaches raw or any table", destinations: [] };
    }
    const destinations = destinationsFor(index);
    if (destinations.length > 0) return { index, header, verdict: "mapped", destinations };
    const fallback = destinationsFor(index, false);
    if (fallback.length > 0) {
      return { index, header, verdict: "fallback only", destinations: fallback };
    }
    return { index, header, verdict: "kept in raw only", destinations };
  });
}

function renderDoc(rows: Row[]): string {
  const mapped = rows.filter((r) => r.verdict === "mapped");
  const fallback = rows.filter((r) => r.verdict === "fallback only");
  const rawOnly = rows.filter((r) => r.verdict === "kept in raw only");
  const discarded = rows.filter((r) => r.verdict.startsWith("discarded"));
  const lines: string[] = [];
  lines.push("# The 147 columns, and where each one goes");
  lines.push("");
  lines.push(
    "**Generated, not written.** `src/test/iceImportColumnMap.test.ts` maps a row holding a probe"
  );
  lines.push(
    "value in one column and nothing else, diffs the result against an entirely empty row, and"
  );
  lines.push(
    "records every field that changed. The test then asserts this file matches — so it cannot go"
  );
  lines.push("stale without CI saying so. Regenerate with:");
  lines.push("");
  lines.push("```");
  lines.push("UPDATE_COLUMN_MAP=1 npx vitest run src/test/iceImportColumnMap.test.ts");
  lines.push("```");
  lines.push("");
  lines.push(
    `Columns: **${rows.length}** · mapped **${mapped.length}** · read only as a fallback **${fallback.length}** · kept in raw only **${rawOnly.length}** · discarded **${discarded.length}**`
  );
  lines.push("");
  lines.push("Three things the numbering shows that a name-keyed table cannot: `Membership Type`");
  lines.push("appears three times, `Policy Number` twice and `Company` twice. The column number is the");
  lines.push("position in the export (0-based), and the destinations tell you which occurrence is read.");
  lines.push("");
  lines.push("Column names are as `normaliseHeader` sees them: the export carries stray whitespace");
  lines.push("(`Allergies `, `Nationality `, `Contact  1 - Tel` with a double space) and it is collapsed");
  lines.push("once on read, so the table reads the way the column reads.");
  lines.push("");
  lines.push("`address_line_1` is `House Number` + `Home Street`, in that order — an ambulance is given");
  lines.push("line 1, and a house number sitting on line 2 is a number the driver may never see.");
  lines.push("");
  lines.push("## Discarded before anything is stored");
  lines.push("");
  lines.push("Not written to `members`, not written to `crm_contacts`, and **not kept in");
  lines.push("`crm_import_rows.raw`** — the accessor returns an empty string for them and `raw()` omits");
  lines.push("the keys, so there is no copy anywhere. Only the fact that a row HELD one is recorded, as");
  lines.push("a count in the batch summary.");
  lines.push("");
  lines.push("| # | Column |");
  lines.push("|---|---|");
  for (const r of discarded) lines.push(`| ${r.index} | \`${r.header}\` |`);
  lines.push("");
  lines.push("Payment columns that are read as a BOOLEAN only — \"this row had payment data\" — and never");
  lines.push("for their value: " + [...SENSITIVE].map((h) => `\`${h}\``).join(", ") + ".");
  lines.push("");
  lines.push("## Mapped");
  lines.push("");
  lines.push("| # | Column | Destination |");
  lines.push("|---|---|---|");
  for (const r of mapped) {
    lines.push(`| ${r.index} | \`${r.header}\` | ${r.destinations.map((d) => `\`${d}\``).join(", ")} |`);
  }
  lines.push("");
  lines.push("## Read only as a fallback");
  lines.push("");
  lines.push("These columns are read, but only when the column that usually supplies the field is");
  lines.push("empty. Three of them are the duplicate headers: `Membership Type` appears three times and");
  lines.push("the first occurrence that is not a bare number wins, so the second and third are read only");
  lines.push("when the first is blank. `Joined Date` is the same relationship with `Date Joined`.");
  lines.push("");
  lines.push("| # | Column | Destination when it is used |");
  lines.push("|---|---|---|");
  for (const r of fallback) {
    lines.push(`| ${r.index} | \`${r.header}\` | ${r.destinations.map((d) => `\`${d}\``).join(", ")} |`);
  }
  lines.push("");
  lines.push("## Kept in `crm_import_rows.raw` only");
  lines.push("");
  lines.push("Nothing reads these. They are not lost — every import keeps the whole row (minus the");
  lines.push("discarded columns above) in `crm_import_rows.raw`, so anything here can be mapped later");
  lines.push("without re-exporting from Karma. **If one of these matters, say which and it gets a");
  lines.push("destination.**");
  lines.push("");
  lines.push("| # | Column |");
  lines.push("|---|---|");
  for (const r of rawOnly) lines.push(`| ${r.index} | \`${r.header}\` |`);
  lines.push("");
  lines.push("### Of those, the ones worth a decision");
  lines.push("");
  lines.push("Everything above this line is derived by running the mapper. THIS list is a judgement —");
  lines.push("which unmapped columns look like they matter — and the test only checks that each one is");
  lines.push("genuinely unmapped, not that the reasoning is right. Say the word on any of them and it");
  lines.push("gets a destination.");
  lines.push("");
  for (const [header, why] of Object.entries(NOTABLE)) {
    lines.push(`- **\`${header}\`** — ${why}`);
  }
  lines.push("");
  lines.push(
    "The rest are Karma's own layout artefacts (" +
      SECTION_HEADERS.map((h) => `\`${h}\``).join(", ") +
      " are section headings exported as columns), the work/other-address and social-media blocks"
  );
  lines.push("that a Spanish care client does not have, and Karma's own bookkeeping (`Attachments`,");
  lines.push("`Tasks`, `Note last added at`, `Updated at`).");
  lines.push("");
  return lines.join("\n");
}

const rows = buildRows();

describe("the derivation itself", () => {
  it("probed all 147 columns", () => {
    expect(rows.length).toBe(147);
    expect(HEADERS.length).toBe(147);
  });

  it("found destinations for the columns a member record cannot do without", () => {
    // A guard on the probe, not on the mapper: if the diff stopped detecting anything, every
    // column would read "kept in raw only" and the table would be confidently wrong.
    const dest = (header: string) => rows.find((r) => r.header === header)?.destinations ?? [];
    expect(dest("First Name")).toContain("member.first_name");
    expect(dest("Birthday")).toContain("member.date_of_birth");
    expect(dest("Home Postal Code")).toContain("member.postal_code");
    expect(dest("House Number")).toContain("member.address_line_1");
    expect(dest("Home Street")).toContain("member.address_line_1");
    expect(dest("Pendant IMEI")).toContain("device.imei");
    expect(dest("Contact 1 - Name")).toContain("contacts[].contactName");
    // "Contact  1 - Tel" in the export, with a double space — `normaliseHeader` collapses it,
    // which is why the table reads the way a human reads the column.
    expect(dest("Contact 1 - Tel")).toContain("contacts[].phone");
    expect(dest("Key Holder 1 - Name")).toContain("contacts[].contactName");
  });

  it("finds a boolean destination a string search would miss", () => {
    const dest = rows.find((r) => r.header === "Personal Pendant")?.destinations ?? [];
    expect(dest).toContain("subscription.has_pendant");
  });

  it("reports every redacted column as discarded, with no destination", () => {
    for (const header of REDACTED_HEADERS) {
      const row = rows.find((r) => r.header === header);
      expect(row, `${header} is not in the export header`).toBeTruthy();
      expect(row!.verdict).toContain("discarded");
      expect(row!.destinations).toEqual([]);
    }
  });

  it("reads the sensitive payment columns as a boolean and never as a value", () => {
    // These are not redacted — the free-of-charge signal is recovered from them — but the only
    // field they may reach is that boolean. Asserted as the DIFF rather than by searching the
    // output for the probe string: the spine row carries an IMEI, so a probe value that happens
    // to look like an IMEI would be "found" in `device.imei` and read as a leak.
    // `discardedSensitive` holds column NAMES, never values — it is how the batch summary can
    // say "94 rows had card data, discarded" and be believed.
    const allowed = new Set(["subscription.is_free_of_charge", "discardedSensitive", "discardedSensitive[]"]);
    for (const header of SENSITIVE_PAYMENT_HEADERS) {
      const index = HEADERS.indexOf(header);
      if (index === -1) continue;
      for (const path of destinationsFor(index)) {
        expect(allowed.has(path), `${header} reaches ${path}`).toBe(true);
      }
    }
  });
});

describe("the hand-written part", () => {
  it("only flags columns that really are unmapped", () => {
    const rawOnly = new Set(rows.filter((r) => r.verdict === "kept in raw only").map((r) => r.header));
    for (const header of [...Object.keys(NOTABLE), ...SECTION_HEADERS]) {
      expect(rawOnly.has(header), `${header} is not in the unmapped list — the prose is stale`).toBe(true);
    }
  });
});

describe("ICE_IMPORT_COLUMN_MAP.md", () => {
  it("matches the mapper", () => {
    const doc = renderDoc(rows);
    if (process.env.UPDATE_COLUMN_MAP) {
      writeFileSync(DOC, doc);
    }
    const committed = readFileSync(DOC, "utf8");
    expect(
      committed,
      "ICE_IMPORT_COLUMN_MAP.md is out of date. Regenerate: UPDATE_COLUMN_MAP=1 npx vitest run src/test/iceImportColumnMap.test.ts"
    ).toBe(doc);
  });
});
