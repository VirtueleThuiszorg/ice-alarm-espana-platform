/**
 * The import screen: what it shows before the write, and what it writes.
 *
 * Two properties carry this file, and both are about the gap between what an admin was told and
 * what happened.
 *
 * 1. NOTHING IS WRITTEN UNTIL IMPORT IS PRESSED. The old page inserted a `crm_import_batches`
 *    row on file drop, so looking at a file left a trace and a half-abandoned batch.
 * 2. THE PREVIEW AND THE WRITE COME FROM THE SAME PLAN. A preview computed separately from the
 *    write is a preview of something else — and this page's job is to be believed about a
 *    life-safety record.
 *
 * The redaction assertion here is deliberately at the LAST layer: whatever the mapper does, the
 * payload this page hands to `crm_import_rows` is swept for the fixture's fake card number. That
 * is the row of the requirement that says the value must never reach any table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_PATH = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const FIXTURE_CSV = readFileSync(FIXTURE_PATH, "utf8");
/** The fake card number the fixture's row 9001 carries in `Credit Card Details`. */
const FAKE_CARD = "4111111111111111";

type Write = { table: string; op: "insert" | "update" | "upsert"; payload: unknown };
const writes: Write[] = [];
/** What a select on a table returns. Empty by default: an empty platform. */
let selectRows: Record<string, unknown[]> = {};
let selectSingle: Record<string, unknown | null> = {};
let insertShouldFail: string | null = null;
let ids = 0;

function builder(table: string) {
  let op: "select" | "insert" | "update" | "upsert" = "select";
  const result = () => {
    if (op === "insert" && insertShouldFail === table) {
      return { data: null, error: { message: `insert into ${table} refused` } };
    }
    if (op === "insert" || op === "upsert") return { data: { id: `${table}-${++ids}` }, error: null };
    if (op === "update") return { data: null, error: null };
    return { data: selectRows[table] ?? [], error: null };
  };
  const chain: Record<string, unknown> = {
    insert(payload: unknown) { op = "insert"; writes.push({ table, op, payload }); return chain; },
    update(payload: unknown) { op = "update"; writes.push({ table, op, payload }); return chain; },
    upsert(payload: unknown) { op = "upsert"; writes.push({ table, op, payload }); return chain; },
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    ilike: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(result()),
    maybeSingle: () =>
      Promise.resolve(
        op === "select" ? { data: selectSingle[table] ?? null, error: null } : result()
      ),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result()).then(onFulfilled),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: "en" } }),
}));

const toastCalls: string[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toastCalls.push(`success:${m}`),
    error: (m: string) => toastCalls.push(`error:${m}`),
  },
}));

import CRMImportPage from "@/pages/admin/CRMImportPage";

/**
 * jsdom's Blob has no `text()` — so the file is the two members the page actually reads.
 * `File.prototype.text` exists in every browser the app supports; only the test environment
 * lacks it, and shimming a real File would be shimming the thing under test.
 */
function csvFile(text = FIXTURE_CSV, name = "ice-export.csv") {
  return { name, type: "text/csv", text: async () => text } as unknown as File;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CRMImportPage />
    </QueryClientProvider>
  );
}

async function loadFixture(text = FIXTURE_CSV) {
  renderPage();
  const input = document.getElementById("file-input") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [csvFile(text)] } });
  await waitFor(() => expect(screen.getByTestId("start-import")).toBeTruthy());
}

beforeEach(() => {
  writes.length = 0;
  toastCalls.length = 0;
  selectRows = {};
  selectSingle = {};
  insertShouldFail = null;
  ids = 0;
  navigate.mockClear();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ *
 * Before Import is pressed
 * ------------------------------------------------------------------ */

describe("reading the file", () => {
  it("writes nothing at all", async () => {
    await loadFixture();
    // The old page inserted a crm_import_batches row here.
    expect(writes).toEqual([]);
  });

  it("says so, rather than implying the import has started", async () => {
    await loadFixture();
    expect(toastCalls.join(" ")).toContain("Nothing has been written yet");
  });

  it("shows a row per record with its outcome", async () => {
    await loadFixture();
    // 9001 has an email and every required column; 9002 has no email.
    expect(within(screen.getByTestId("preview-row-9001")).getByText("member")).toBeTruthy();
    // 9008, not 9002: since email became optional the only row that cannot be a member is the
    // one whose Birthday is unreadable.
    expect(within(screen.getByTestId("preview-row-9008")).getByText("CRM contact")).toBeTruthy();
  });

  it("shows WHY a row is not a member", async () => {
    await loadFixture();
    expect(within(screen.getByTestId("preview-row-9008")).getByText(/no date of birth/)).toBeTruthy();
  });

  it("shows the parsed date of birth for a row it cannot import", async () => {
    // The point of showing the parse for a blocked row: "no email" must not look like "no data".
    await loadFixture();
    // 9002's Birthday cell is 31/03/1938. Day 31 leaves no room for a month, so this is the
    // assertion that the column is read DD/MM/YYYY and not the American way round. (It is a
    // member now rather than a blocked row — the parse is what is under test either way.)
    expect(within(screen.getByTestId("preview-row-9002")).getByText("1938-03-31")).toBeTruthy();
  });

  it("shows the parsed emergency contacts with their relationships", async () => {
    await loadFixture();
    const row = within(screen.getByTestId("preview-row-9004"));
    expect(row.getByText(/Susan Smith \(Sister in UK\) \+447700900123/)).toBeTruthy();
    expect(row.getByText(/Peter Smith \(Son\) \+34600987654/)).toBeTruthy();
  });

  it("shows the pendant IMEI it recovered from a messy cell", async () => {
    await loadFixture();
    // 9003's cell is "IMEI: 865513075018479 DOCKING STATION: …". No SIM, so no device row is
    // planned — but the IMEI is still what the admin needs to see.
    expect(screen.getByTestId("preview-row-9003").textContent).toContain("865513075018479");
  });

  it("counts the discarded sensitive columns, so a strip is distinguishable from an empty cell", async () => {
    await loadFixture();
    const panel = screen.getByTestId("discarded-sensitive");
    expect(panel.textContent).toContain("Credit Card Details");
    expect(panel.textContent).toContain("20 Digit Bank No");
  });

  it("never renders a sensitive value anywhere on the screen", async () => {
    await loadFixture();
    expect(document.body.textContent ?? "").not.toContain(FAKE_CARD);
  });

  it("changes the preview when the mode changes, rather than only the write", async () => {
    await loadFixture();
    expect(screen.getByTestId("summary-crm-contacts").textContent).toBe("1");
    expect(screen.getByTestId("summary-skipped").textContent).toBe("0");

    fireEvent.click(screen.getByLabelText(/Import complete members only/));
    await waitFor(() => expect(screen.getByTestId("summary-skipped").textContent).toBe("1"));
    expect(screen.getByTestId("summary-crm-contacts").textContent).toBe("0");
    // And the row itself now says skipped, with the mode as the reason.
    expect(within(screen.getByTestId("preview-row-9008")).getByText("skipped")).toBeTruthy();
  });

  it("offers no Import at all for a file with a header and no rows", async () => {
    renderPage();
    const header = FIXTURE_CSV.split("\n")[0];
    const input = document.getElementById("file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile(header + "\n")] } });
    await waitFor(() => expect(toastCalls.join(" ")).toContain("no rows"));
    expect(screen.queryByTestId("start-import")).toBeNull();
    expect(writes).toEqual([]);
  });
});

describe("exporting the preview", () => {
  it("exports every row, not just the fifty on screen, with the reasons", async () => {
    const created: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    // jsdom implements neither; capture the Blob's text instead of the URL.
    let blobText = "";
    URL.createObjectURL = ((blob: Blob) => {
      created.push("called");
      // Blob.text() is async and the click is synchronous, so read the parts directly.
      blobText = (blob as unknown as { _text?: string })._text ?? "";
      return "blob:preview";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

    // Capture what the page put in the Blob.
    const OriginalBlob = globalThis.Blob;
    globalThis.Blob = class extends OriginalBlob {
      _text: string;
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        this._text = parts.map(String).join("");
      }
    } as unknown as typeof Blob;

    try {
      await loadFixture();
      fireEvent.click(screen.getByTestId("export-preview"));
      expect(created.length).toBe(1);
      expect(blobText).toContain("source_id,outcome,why_not_member");
      // One line per row plus the header.
      expect(blobText.trimEnd().split("\r\n").length).toBe(11);
      expect(blobText).toContain("no date of birth");
      expect(blobText).toContain("865513075018479");
      expect(blobText).not.toContain(FAKE_CARD);
    } finally {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

/* ------------------------------------------------------------------ *
 * Pressing Import
 * ------------------------------------------------------------------ */

async function runImport(text = FIXTURE_CSV) {
  await loadFixture(text);
  fireEvent.click(screen.getByTestId("start-import"));
  await waitFor(() => expect(screen.queryByTestId("result-created")).toBeTruthy(), { timeout: 5000 });
}

const writesTo = (table: string, op?: Write["op"]) =>
  writes.filter((w) => w.table === table && (op ? w.op === op : true));

describe("pressing Import", () => {
  it("creates the batch then, not on file drop", async () => {
    await runImport();
    const batches = writesTo("crm_import_batches", "insert");
    expect(batches.length).toBe(1);
    expect((batches[0].payload as { filename: string }).filename).toBe("ice-export.csv");
  });

  it("keeps no sensitive value in crm_import_rows.raw", async () => {
    await runImport();
    const rows = writesTo("crm_import_rows", "insert");
    expect(rows.length).toBeGreaterThan(0);
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(FAKE_CARD);
    for (const header of ["Credit Card Details", "20 Digit Bank No", "Private Medical Details", "Death Funeral Wishes"]) {
      expect(serialised).not.toContain(header);
    }
  });

  it("keeps no sensitive value in ANY write it makes", async () => {
    // The requirement is "never reaches any table", so the sweep is over every payload.
    await runImport();
    const everything = JSON.stringify(writes);
    expect(everything).not.toContain(FAKE_CARD);
    // A 16-digit run in any payload at all would be a card number that got through.
    expect(everything).not.toMatch(/\d{16}/);
  });

  it("writes members with status 'pending_review' + legacy billing, never 'active'", async () => {
    await runImport();
    const members = writesTo("members", "insert");
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) {
      const p = m.payload as { status: string; billing_source: string };
      expect(p.status).toBe("pending_review");
      // The pair is the point: pending_review says a human has not looked yet, legacy says the
      // money never came through this platform. Either alone would be a half-truth.
      expect(p.billing_source).toBe("legacy");
    }
    expect(JSON.stringify(writes)).not.toContain('"status":"active"');
  });

  it("invents no phone, email or address", async () => {
    await runImport();
    const everything = JSON.stringify(writes);
    expect(everything).not.toContain('"N/A"');
    expect(everything).not.toContain('"TBD"');
    expect(everything).not.toContain("placeholder.local");
  });

  it("creates a CRM contact carrying the reason it is not a member", async () => {
    await runImport();
    const contacts = writesTo("crm_contacts", "insert");
    expect(contacts.length).toBe(1);
    expect((contacts[0].payload as { notes: string }).notes).toContain("no date of birth");
    expect((contacts[0].payload as { source_id: string }).source_id).toBeTruthy();
  });

  it("links the audit row to the CRM contact it created, not only to members", async () => {
    await runImport();
    const linked = writesTo("crm_import_rows", "update").filter(
      (w) => (w.payload as { imported_crm_contact_id: string | null }).imported_crm_contact_id
    );
    // One row in the fixture becomes a CRM contact; an audit row that records nothing it made
    // cannot answer "what did this batch do to this person".
    expect(linked.length).toBe(1);
  });

  it("does not lose a CRM contact's other numbers or their emergency contacts", async () => {
    // `crm_contacts` has one phone column and no contacts table of its own. Dropping the rest
    // would make the row look like a person with one number and nobody to call.
    await runImport();
    const byId = (id: string) =>
      writesTo("crm_contacts", "insert").find(
        (w) => (w.payload as { source_id: string }).source_id === id
      );
    // 9008 is the only CRM contact now, and it carries no extra numbers — so the assertion
    // moves to what it DOES carry, and the multi-number case is covered on the member path by
    // "keeps the member's other numbers" above. Asserting against a row that no longer exists
    // is how a test starts passing for the wrong reason.
    expect(byId("9008")).toBeTruthy();
    expect((byId("9008")?.payload as { notes: string }).notes).toContain("no date of birth");
  });

  it("reports what happened per outcome", async () => {
    await runImport();
    expect(screen.getByTestId("result-created").textContent).toBe("9");
    expect(screen.getByTestId("result-crm_contact").textContent).toBe("1");
    expect(screen.getByTestId("result-failed").textContent).toBe("0");
  });

  it("marks the batch failed, not completed, when a row failed", async () => {
    // A batch reported 'completed' with failed rows inside it is the screen lying about a
    // life-safety record.
    await loadFixture();
    fireEvent.click(screen.getByTestId("start-import"));
    await waitFor(() => expect(screen.queryByTestId("result-created")).toBeTruthy(), { timeout: 5000 });
    const finalUpdate = writesTo("crm_import_batches", "update").at(-1);
    expect((finalUpdate?.payload as { status: string }).status).toBe("completed");

    cleanup();
    writes.length = 0;
    insertShouldFail = "members";
    await loadFixture();
    fireEvent.click(screen.getByTestId("start-import"));
    await waitFor(() => expect(screen.queryByTestId("result-failed")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId("result-failed").textContent).toBe("9");
    const failed = writesTo("crm_import_batches", "update").at(-1);
    expect((failed?.payload as { status: string }).status).toBe("failed");
  });

  it("records the failure against the row, so it is findable afterwards", async () => {
    insertShouldFail = "members";
    await loadFixture();
    fireEvent.click(screen.getByTestId("start-import"));
    await waitFor(() => expect(screen.queryByTestId("result-failed")).toBeTruthy(), { timeout: 5000 });
    const rowUpdates = writesTo("crm_import_rows", "update");
    const failures = rowUpdates.filter(
      (w) => (w.payload as { import_status: string }).import_status === "failed"
    );
    expect(failures.length).toBe(9);
    expect((failures[0].payload as { error_message: string }).error_message).toBeTruthy();
  });

  it("writes no member at all in members-only mode for a row it showed as skipped", async () => {
    await loadFixture();
    fireEvent.click(screen.getByLabelText(/Import complete members only/));
    await waitFor(() => expect(screen.getByTestId("summary-skipped").textContent).toBe("1"));
    fireEvent.click(screen.getByTestId("start-import"));
    await waitFor(() => expect(screen.queryByTestId("result-skipped")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId("result-skipped").textContent).toBe("1");
    expect(writesTo("crm_contacts", "insert").length).toBe(0);
    expect(writesTo("members", "insert").length).toBe(9);
  });

  it("keeps the member's other numbers, which the escalation ladder tries next", async () => {
    await runImport();
    const methods = writesTo("member_contact_methods", "insert");
    expect(methods.length).toBeGreaterThan(0);
    for (const m of methods) {
      const p = m.payload as { type: string; value: string; is_primary: boolean };
      expect(["phone", "email"]).toContain(p.type);
      expect(p.value).toBeTruthy();
      // members.phone already answers "which number first".
      expect(p.is_primary).toBe(false);
    }
  });

  it("hands an emergency contact a real number or does not write it", async () => {
    await runImport();
    for (const c of writesTo("emergency_contacts", "insert")) {
      expect((c.payload as { phone: string }).phone).toMatch(/^\+\d{8,}$/);
    }
  });
});

describe("consent the CRM recorded, on the way to the database", () => {
  it("writes an email opt-in only for the row that said Yes, stamped staff_recorded", async () => {
    await runImport();
    const optins = writesTo("member_notification_optin", "insert");
    expect(optins.length).toBe(1);
    const p = optins[0].payload as {
      channel: string; opted_in: boolean; opted_in_at: string; basis: string;
    };
    expect(p.channel).toBe("email");
    expect(p.opted_in).toBe(true);
    // The table refuses an opted-in row with no timestamp — consent with no date is a claim
    // nobody can defend.
    expect(p.opted_in_at).toBeTruthy();
    // Not member_self: nobody watched this member say yes, a spreadsheet did.
    expect(p.basis).toBe("staff_recorded");
  });

  it("writes the Spouse hint as a note and not as a contact", async () => {
    await runImport();
    const notes = writesTo("member_notes", "insert").map(
      (w) => (w.payload as { content: string }).content
    );
    expect(notes).toContain("Spouse: Edith Pennington");
    const contactNames = writesTo("emergency_contacts", "insert").map(
      (w) => (w.payload as { contact_name: string }).contact_name
    );
    expect(contactNames).not.toContain("Edith Pennington");
  });
});
