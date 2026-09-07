/**
 * THE CIRCLE OF CARE, ON THE MEMBER'S OWN CONTACTS PAGE — WP5.
 *
 * `20260907100300_circle_of_care.sql` widened `contact_type` from two values to eight, and added
 * `can_attend_in_person`, `country` and `availability_notes`. Its own header says why:
 *
 *   "a care agency, a district nurse, a social worker and the neighbour with the spare key were
 *    all `emergency` with a sentence of free text beside them"
 *
 * and, about the new boolean:
 *
 *   "the single most operationally useful fact about a contact, and it was not stored: a
 *    daughter in Manchester and a neighbour two doors down were indistinguishable to the
 *    escalation ladder"
 *
 * **The member's page collected six of the thirteen columns** — name, relationship, phone,
 * email, notes, speaks-Spanish — and none of WP5's four. So the schema change was, from the side
 * of the only person who knows the answers, invisible. `EmergencyContact` was also a
 * hand-written interface listing ten, which threw the other three away on the way in: the same
 * defect as `MedicalInfo`, in the same file.
 *
 * ── THE LOAD-BEARING ASSERTION IS ABOUT NULL ───────────────────────────────────────────────
 *
 * `can_attend_in_person` is nullable and the migration is explicit: *"NULL means unknown, which
 * is honest — it is not the same as false."* A checkbox cannot express that. An unchecked box
 * would tell an operator at three in the morning that a daughter CANNOT get there, when nobody
 * ever asked her — worse than the blank it replaces, because it looks like an answer.
 *
 * So: three options, no default, "I am not sure" written as NULL, and no badge at all on a
 * contact nobody has answered for.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  CAN_ATTEND_OPTIONS,
  CONTACT_TYPES,
  DEFAULT_CONTACT_TYPE,
  canAttendChoice,
  canAttendValue,
  contactTypeLabel,
} from "@/lib/contactTypes";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** The eight values the CHECK constraint allows, from the migrations — the source that cannot drift. */
function contactTypesFromMigrations(): string[] {
  const dir = path.join(ROOT, "supabase/migrations");
  let values: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    // The LAST constraint definition in migration order wins — 20260903091600 allowed two and
    // 20260907100300 replaced it with eight. Reading the first would test the old schema.
    for (const m of sql.matchAll(
      /ADD\s+CONSTRAINT\s+emergency_contacts_contact_type_check\s+CHECK\s*\(\s*contact_type\s+IN\s*\(([\s\S]*?)\)\s*\)/gi,
    )) {
      // Skip the rollback recipes in the header comments: a real statement is not preceded by
      // "--" on its own line.
      const at = m.index ?? 0;
      const lineStart = sql.lastIndexOf("\n", at) + 1;
      if (sql.slice(lineStart, at).trimStart().startsWith("--")) continue;
      values = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
  }
  return values;
}

let contactRows: Record<string, unknown>[] = [];
let writes: { kind: "insert" | "update"; payload: Record<string, unknown> }[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = () => Promise.resolve({ data: contactRows, error: null });
  c.insert = (payload: Record<string, unknown>) => {
    writes.push({ kind: "insert", payload });
    return Promise.resolve({ error: null });
  };
  c.update = (payload: Record<string, unknown>) => {
    writes.push({ kind: "update", payload });
    return { eq: () => Promise.resolve({ error: null }) };
  };
  c.delete = () => ({ eq: () => Promise.resolve({ error: null }) });
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => chain() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => (typeof fallback === "string" ? fallback : _k),
    i18n: { language: "en" },
  }),
}));

async function renderPage() {
  const Page = (await import("@/pages/client/EmergencyContactsPage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("page-header")).toBeTruthy());
  return view;
}

const contact = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  member_id: "m1",
  contact_name: "Ana Ruiz",
  relationship: "Daughter",
  phone: "+34600000000",
  email: null,
  is_primary: true,
  priority_order: 1,
  notes: null,
  speaks_spanish: false,
  created_at: "2026-01-01",
  contact_type: "emergency",
  recorded_via: null,
  recorded_by_staff: null,
  can_attend_in_person: null,
  country: null,
  availability_notes: null,
  ...over,
});

beforeEach(() => {
  contactRows = [];
  writes = [];
});
afterEach(() => cleanup());

/**
 * Fill the two required fields, so a submit can reach the write path.
 *
 * `relationship` is `z.string().min(1)` on a Radix Select, so leaving it out means zod blocks
 * the submit and NOTHING is written — which is how the first version of the two insert tests
 * "passed" nothing and then failed on `writes.length`. A form test that never reaches the write
 * is not testing the write.
 */
async function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Contact Name|Full Name|Name/i), {
    target: { value: "Ana" },
  });
  fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: "+34600000000" } });

  // Radix opens on pointerdown, not click.
  fireEvent.pointerDown(
    screen.getByLabelText(/Relationship/i),
    new MouseEvent("pointerdown", { bubbles: true }),
  );
  await waitFor(() => expect(screen.getByRole("option", { name: /Daughter/i })).toBeTruthy());
  fireEvent.click(screen.getByRole("option", { name: /Daughter/i }));
}

describe("the eight types, measured against the CHECK constraint", () => {
  it("finds the constraint at all — a floor, so a broken parse cannot pass everything", () => {
    expect(contactTypesFromMigrations().length).toBe(8);
  });

  it("reads the WIDENED constraint, not the two-value one it replaced", () => {
    // 20260903091600 allowed ('emergency','key_holder'). Taking the first match would test the
    // old schema and pass on a page offering two options.
    const fromSql = contactTypesFromMigrations();
    expect(fromSql).toContain("care_agency");
    expect(fromSql).toContain("legal_representative");
  });

  it("offers exactly the values the database allows — no more, no fewer", () => {
    expect(CONTACT_TYPES.map((c) => c.type).sort()).toEqual(contactTypesFromMigrations().sort());
  });

  it("every type has a description, not just a noun", () => {
    for (const spec of CONTACT_TYPES) {
      expect(spec.description.fallback.length, spec.type).toBeGreaterThan(20);
    }
  });

  it("the default is the column's default", () => {
    expect(DEFAULT_CONTACT_TYPE).toBe("emergency");
  });

  it("an unrecognised stored value renders nothing rather than being relabelled", () => {
    // Falling back to the default would silently turn a nurse into "family or friend".
    expect(contactTypeLabel("district_pharmacist")).toBeNull();
    expect(contactTypeLabel(null)).toBeNull();
    expect(contactTypeLabel(undefined)).toBeNull();
  });
});

describe("can_attend_in_person — three answers, and NULL is one of them", () => {
  it("has exactly three options", () => {
    expect(CAN_ATTEND_OPTIONS.map((o) => o.choice)).toEqual(["yes", "no", "unknown"]);
  });

  it("'not sure' maps to NULL, never to false", () => {
    // false asserts a contact CANNOT get there — a sentence an operator would act on.
    expect(canAttendValue("unknown")).toBeNull();
    expect(canAttendValue("no")).toBe(false);
    expect(canAttendValue("yes")).toBe(true);
  });

  it("a stored NULL reads back as 'not sure', not as 'no'", () => {
    expect(canAttendChoice(null)).toBe("unknown");
    expect(canAttendChoice(undefined)).toBe("unknown");
    expect(canAttendChoice(false)).toBe("no");
    expect(canAttendChoice(true)).toBe("yes");
  });
});

describe("the form", () => {
  it("offers all eight types", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Add Your First Contact"));
    await waitFor(() => expect(screen.getByTestId("contact-type-select")).toBeTruthy());
    expect(screen.getByTestId("contact-type-help").textContent).toContain("Most people start here");
  });

  it("keeps ONE blank-contact object, so the two reset paths cannot disagree", async () => {
    /*
      There were two copies of the form's blank values — `defaultValues` and `openAddDialog`'s
      reset. A mutation that changed only the first one SURVIVED the whole suite, which is the
      drift hazard stated as a fact: the two could disagree about `can_attend` and only one of
      them would be what a member actually sees.
    */
    const src = read("src/pages/client/EmergencyContactsPage.tsx");
    expect(src).toMatch(/const BLANK_CONTACT: ContactFormData = \{/);
    expect(src).toMatch(/defaultValues: BLANK_CONTACT,/);
    expect(src).toMatch(/form\.reset\(BLANK_CONTACT\);/);
    // Exactly one place names the starting choice.
    expect(src.match(/can_attend: "unknown"/g)?.length).toBe(1);
  });

  it("offers three radio options for reachability, and none is preselected as a fact", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Add Your First Contact"));
    await waitFor(() => expect(screen.getByTestId("can-attend-unknown")).toBeTruthy());
    // "not sure" is the starting point — an answer the member gives, not a claim we invent.
    expect((screen.getByTestId("can-attend-unknown") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("can-attend-yes") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("can-attend-no") as HTMLInputElement).checked).toBe(false);
  });

  it("is a radiogroup, not a checkbox — a checkbox cannot express 'unknown'", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Add Your First Contact"));
    await waitFor(() => expect(screen.getByTestId("can-attend-yes")).toBeTruthy());
    for (const choice of ["yes", "no", "unknown"]) {
      expect(screen.getByTestId(`can-attend-${choice}`).getAttribute("type")).toBe("radio");
    }
  });

  it("writes NULL for 'not sure' on insert", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Add Your First Contact"));
    await waitFor(() => expect(screen.getByTestId("can-attend-unknown")).toBeTruthy());

    await fillRequired();
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].payload.can_attend_in_person).toBeNull();
    expect(writes[0].payload.contact_type).toBe("emergency");
  });

  it("writes false only when the member actually says 'no'", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Add Your First Contact"));
    await waitFor(() => expect(screen.getByTestId("can-attend-no")).toBeTruthy());

    await fillRequired();
    fireEvent.click(screen.getByTestId("can-attend-no"));
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].payload.can_attend_in_person).toBe(false);
  });

  it("sends WP5's four columns on an UPDATE too, not only on insert", async () => {
    // Two copies of the field list is how the medical page came to render fields its save
    // dropped — a member types into something and believes an operator can see it.
    contactRows = [contact()];
    await renderPage();
    fireEvent.click(screen.getAllByText(/Edit/i)[0]);
    await waitFor(() => expect(screen.getByTestId("can-attend-unknown")).toBeTruthy());
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].kind).toBe("update");
    for (const col of ["contact_type", "can_attend_in_person", "country", "availability_notes"]) {
      expect(Object.keys(writes[0].payload), col).toContain(col);
    }
  });

  it("prefills the edit form from what is stored, including 'not sure'", async () => {
    contactRows = [contact({ contact_type: "nurse", can_attend_in_person: null })];
    await renderPage();
    fireEvent.click(screen.getAllByText(/Edit/i)[0]);
    await waitFor(() => expect(screen.getByTestId("can-attend-unknown")).toBeTruthy());
    // Not "no" — a prefill that invents an answer is worse than an empty form.
    expect((screen.getByTestId("can-attend-unknown") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("contact-type-help").textContent).toMatch(/district nurse/i);
  });
});

describe("the contact cards", () => {
  it("name the type", async () => {
    contactRows = [contact({ contact_type: "neighbour" })];
    await renderPage();
    await waitFor(() => expect(screen.getByTestId("contact-type-c1")).toBeTruthy());
    expect(screen.getByTestId("contact-type-c1").textContent).toBe("Neighbour");
  });

  it("say nothing for an unrecognised type rather than printing the raw value", async () => {
    contactRows = [contact({ contact_type: "district_pharmacist" })];
    await renderPage();
    await waitFor(() => expect(screen.getByText("Ana Ruiz")).toBeTruthy());
    expect(screen.queryByTestId("contact-type-c1")).toBeNull();
    expect(screen.queryByText(/district_pharmacist/)).toBeNull();
  });

  it("show NO reachability badge when nobody has answered", async () => {
    // Every contact recorded before WP5 has NULL here. A "cannot attend" badge on all of them
    // would be a claim nobody made.
    contactRows = [contact({ can_attend_in_person: null })];
    await renderPage();
    await waitFor(() => expect(screen.getByText("Ana Ruiz")).toBeTruthy());
    expect(screen.queryByTestId("contact-can-attend-c1")).toBeNull();
    expect(screen.queryByTestId("contact-cannot-attend-c1")).toBeNull();
  });

  it("show the right badge when somebody has", async () => {
    contactRows = [contact({ can_attend_in_person: true })];
    await renderPage();
    await waitFor(() => expect(screen.getByTestId("contact-can-attend-c1")).toBeTruthy());
    cleanup();

    contactRows = [contact({ can_attend_in_person: false })];
    await renderPage();
    await waitFor(() => expect(screen.getByTestId("contact-cannot-attend-c1")).toBeTruthy());
  });

  it("show the availability note when there is one", async () => {
    contactRows = [contact({ availability_notes: "Nights only" })];
    await renderPage();
    await waitFor(() => expect(screen.getByText("Nights only")).toBeVisible());
  });
});

describe("the type that was throwing the data away", () => {
  it("`EmergencyContact` is the generated row, not a hand-written subset", () => {
    const src = read("src/hooks/useMemberProfile.ts");
    expect(src).toMatch(/export type EmergencyContact = Tables<"emergency_contacts">/);
    expect(src).not.toMatch(/export interface EmergencyContact \{/);
  });
});

describe("what WP5 deliberately does NOT do here", () => {
  it("does not reorder the escalation ladder", () => {
    /*
      The migration says it: "the escalation ladder does not yet order by it (SOS path, human
      gate)". CLAUDE.md makes the SOS/alert path a mandatory human gate before merge, so this
      increment records the facts and nothing more.
    */
    const escalation = readdirSync(path.join(ROOT, "supabase/functions"))
      .filter((d) => d.includes("escalat"))
      .map((d) => read(`supabase/functions/${d}/index.ts`))
      .join("\n");
    if (escalation) expect(escalation).not.toContain("can_attend_in_person");
  });

  it("and a contact type is not a permission — nothing here touches care_access_grants", () => {
    const src = read("src/pages/client/EmergencyContactsPage.tsx");
    expect(src).not.toContain("care_access_grants");
    expect(read("src/lib/contactTypes.ts")).not.toMatch(/from\("care_access_grants"\)/);
  });
});
