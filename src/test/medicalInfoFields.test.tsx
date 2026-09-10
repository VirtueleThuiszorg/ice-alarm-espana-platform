/**
 * ALL SIXTEEN FIELDS — and the two lists that must agree about them.
 *
 * `MedicalInfoPage` showed EIGHT of the sixteen columns `medical_information` holds. Three
 * separate hand-maintained copies of that table's shape were all wrong at once:
 *
 *   src/integrations/supabase/types.ts        missing TEN columns outright (fixed in #188)
 *   useMemberProfile.ts's MedicalInfo         an interface listing eight
 *   MedicalInfoPage.tsx                       583 lines of markup rendering eight
 *
 * Plus a fourth that would have silently swallowed the fix: `member-self-service`'s
 * MEDICAL_FIELDS whitelist. A member could have typed into a field the page rendered and had it
 * dropped on save — worse than a field that is absent.
 *
 * So the assertions here are about COMPLETENESS AGAINST THE SCHEMA, not about any one list.
 * The compile-time ratchet in `medicalFields.ts` catches a NEW column; these catch the ones that
 * were already there, and the two lists drifting apart.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  MEDICAL_FIELDS,
  MEDICAL_SECTIONS,
  MEDICAL_PROVENANCE_COLUMNS,
  MEMBER_ACCESS_FIELDS,
} from "@/lib/medicalFields";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** The columns the DATABASE has, from the migrations — the only source that cannot drift. */
function columnsFromMigrations(table: string): string[] {
  const dir = join(ROOT, "supabase/migrations");
  const cols = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, f), "utf8");
    const created = sql.match(
      new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"),
    );
    if (created) {
      for (const line of created[1].split("\n")) {
        const m = line.match(/^\s{2,}([a-z_]+)\s+[a-z]/i);
        if (m && !/^(constraint|primary|unique|foreign|check)$/i.test(m[1])) cols.add(m[1]);
      }
    }
    /*
      A multi-column ALTER matters here: `20260903091500_ice_medical_extras.sql` adds SEVEN of
      the eight missing columns in ONE statement —

          ALTER TABLE public.medical_information
            ADD COLUMN IF NOT EXISTS meds_location text,
            ADD COLUMN IF NOT EXISTS meds_notes    text,
            …

      so a regex that stops at the first ADD COLUMN finds one of seven and every completeness
      assertion below passes on a schema it has barely read. Which is why the first assertion in
      this file is a floor on the count.
    */
    for (const stmt of sql.matchAll(
      new RegExp(`ALTER TABLE (?:public\\.)?${table}\\b([\\s\\S]*?);`, "gi"),
    )) {
      for (const m of stmt[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_]+)/gi)) {
        cols.add(m[1]);
      }
    }
    for (const m of sql.matchAll(
      new RegExp(`ALTER TABLE (?:public\\.)?${table}\\s+DROP COLUMN (?:IF EXISTS )?([a-z_]+)`, "gi"),
    )) {
      cols.delete(m[1]);
    }
  }
  return [...cols];
}

// ── the page harness ───────────────────────────────────────────────────────
let medicalRow: Record<string, unknown> | null = null;
let accessRow: Record<string, unknown> | null = null;
let accessError: unknown = null;
let invoked: { fn: string; body: Record<string, unknown> }[] = [];

function chain(table: string) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  const result =
    table === "member_access"
      ? { data: accessRow, error: accessError }
      : { data: medicalRow, error: null };
  c.maybeSingle = () => Promise.resolve(result);
  c.single = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => chain(table),
    functions: {
      invoke: (fn: string, opts: { body: Record<string, unknown> }) => {
        invoked.push({ fn, body: opts.body });
        return Promise.resolve({ data: { success: true }, error: null });
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

async function renderPage() {
  const Page = (await import("@/pages/client/MedicalInfoPage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invoked = [];
  accessError = null;
  medicalRow = { id: "mi1", member_id: "m1" };
  accessRow = null;
});
afterEach(() => cleanup());

describe("completeness against the schema", () => {
  it("finds the columns in the migrations at all", () => {
    const cols = columnsFromMigrations("medical_information");
    expect(cols.length).toBeGreaterThanOrEqual(20);
    // The eight that were missing from the page. Named, so this cannot pass on a regex that
    // matched something else.
    for (const c of [
      "meds_location",
      "meds_notes",
      "mobility",
      "hearing_notes",
      "vision_notes",
      "doctor_location",
      "private_insurer",
      "private_policy_number",
    ]) {
      expect(cols, `${c} not found in the migrations`).toContain(c);
    }
  });

  it("EVERY member-editable column is placed in a section", () => {
    const cols = columnsFromMigrations("medical_information");
    const placed = new Set(MEDICAL_FIELDS.map((f) => f.column as string));
    const provenance = new Set<string>(MEDICAL_PROVENANCE_COLUMNS);
    const missing = cols.filter((c) => !placed.has(c) && !provenance.has(c));
    expect(missing, "these columns exist and no section shows them").toEqual([]);
  });

  it("no section names a column the table does not have", () => {
    const cols = new Set(columnsFromMigrations("medical_information"));
    const phantom = MEDICAL_FIELDS.map((f) => f.column as string).filter((c) => !cols.has(c));
    expect(phantom).toEqual([]);
  });

  it("the seven sections the brief names are all present", () => {
    expect(MEDICAL_SECTIONS.map((s) => s.key)).toEqual([
      "conditions",
      "allergies",
      "senses",
      "doctor",
      "insurance",
      "other",
    ]);
    // The seventh, "Getting into your home", is a different TABLE and read-only, so it is not
    // in MEDICAL_SECTIONS. It is rendered separately and asserted below.
    expect(MEMBER_ACCESS_FIELDS.length).toBe(4);
  });
});

describe("the save path accepts everything the page renders", () => {
  const fnSrc = () => read("supabase/functions/member-self-service/index.ts");

  function whitelist(): string[] {
    const m = fnSrc().match(/const MEDICAL_FIELDS = \[([\s\S]*?)\] as const;/);
    expect(m, "MEDICAL_FIELDS not found in the edge function").not.toBeNull();
    return [...m![1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  }

  it("the two lists match exactly, in both directions", () => {
    /*
      THE FOURTH COPY. A member could type into a field the page rendered and have it silently
      dropped on save, which is worse than a field that is absent — they would believe the
      operator can see it.
    */
    expect([...whitelist()].sort()).toEqual(
      [...MEDICAL_FIELDS.map((f) => f.column as string)].sort(),
    );
  });

  it("provenance columns stay OFF the whitelist", () => {
    // A member's own save must not be able to claim the information came in by phone from a
    // named staff member.
    for (const c of ["recorded_via", "recorded_by_staff", "member_id", "id"]) {
      expect(whitelist(), `${c} is member-writable`).not.toContain(c);
    }
  });

  it("the list columns are validated as arrays, not as strings", () => {
    const m = fnSrc().match(/const MEDICAL_LIST_FIELDS = \[([\s\S]*?)\] as const;/);
    expect(m).not.toBeNull();
    const lists = [...m![1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
    expect([...lists].sort()).toEqual(
      MEDICAL_FIELDS.filter((f) => f.kind === "list")
        .map((f) => f.column as string)
        .sort(),
    );
  });
});

describe("the page renders all of them", () => {
  it("every field has a row on the page", async () => {
    await renderPage();
    for (const f of MEDICAL_FIELDS) {
      expect(
        await screen.findByTestId(`medical-field-${f.column}`),
        `${f.column} is not on the page`,
      ).toBeTruthy();
    }
  });

  it("an empty field says 'Not added' rather than rendering blank", async () => {
    // On this page a blank line is indistinguishable from a field that failed to load — and
    // this is the page whose subtitle promises it is exactly what an operator sees.
    await renderPage();
    await waitFor(() => expect(screen.queryAllByTestId("not-added").length).toBeGreaterThan(10));
  });

  it("the subtitle is the promise the completeness has to keep", async () => {
    await renderPage();
    expect(
      await screen.findByText(/exactly what an operator sees the moment you press your pendant/i),
    ).toBeTruthy();
  });

  it("sends EVERY field on save, with empties as null", async () => {
    /*
      Omitting an empty field would make "I cleared this" indistinguishable from "I did not
      touch it", and the member who stops taking a medication needs it gone from what the
      operator reads.

      SAVED FROM ONE CARD, and it still sends all sixteen. R6 split the page into six cards
      (`medical-section-<key>`), each with its own Edit and Save — but the write is an upsert of
      the whole row, so every column has to be on every payload. What changes per card is where
      each VALUE comes from, which the next test pins.
    */
    medicalRow = { id: "mi1", member_id: "m1", doctor_name: "Dr Ruiz" };
    await renderPage();
    fireEvent.click(await screen.findByTestId("medical-section-doctor-edit"));
    fireEvent.click(await screen.findByTestId("medical-section-doctor-save"));
    await waitFor(() => expect(invoked.length).toBe(1));

    const body = invoked[0].body;
    expect(body.action).toBe("save_medical_info");
    for (const f of MEDICAL_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(body, f.column), `${f.column} not sent`).toBe(
        true,
      );
    }
    expect(body.doctor_name).toBe("Dr Ruiz");
    expect(body.mobility).toBeNull();
    expect(body.medical_conditions).toBeNull();
  });

  it("each card is its own Edit and its own Save — one button no longer opens all sixteen", async () => {
    /*
      R6: *"Edit per section, then Save."* It was one page-level button, so a member correcting
      a typo in their doctor's phone number had their allergies, blood group and mobility live
      at the same time.
    */
    await renderPage();
    for (const section of ["conditions", "allergies", "senses", "doctor", "insurance", "other"]) {
      expect(
        await screen.findByTestId(`medical-section-${section}-edit`),
        `${section} needs its own Edit`,
      ).toBeVisible();
      // Locked, so it carries the padlock and no Save.
      expect(screen.getByTestId(`medical-section-${section}-lock`)).toBeTruthy();
      expect(screen.queryByTestId(`medical-section-${section}-save`)).toBeNull();
    }
    // And unlocking one leaves the other five locked.
    fireEvent.click(screen.getByTestId("medical-section-doctor-edit"));
    await waitFor(() => expect(screen.getByTestId("medical-section-doctor-save")).toBeVisible());
    expect(screen.queryByTestId("medical-section-allergies-save")).toBeNull();
  });

  it("saving one card does NOT carry another open card's unsaved draft", async () => {
    /*
      THE DEFECT PER-CARD EDITING WOULD OTHERWISE INTRODUCE, and the reason `saveSection` reads
      the RECORD for every column outside its own section. The write sends all sixteen columns,
      so without that a member who typed a new allergy and then saved their doctor would have
      silently saved the allergy too — on the page an operator reads out to an ambulance crew.
    */
    medicalRow = { id: "mi1", member_id: "m1", doctor_name: "Dr Ruiz" };
    await renderPage();

    // Type a hospital into the doctor card, and leave it open and unsaved.
    fireEvent.click(await screen.findByTestId("medical-section-doctor-edit"));
    const hospital = await screen.findByTestId("medical-field-hospital_preference");
    fireEvent.change(hospital.querySelector("input")!, { target: { value: "Torrecárdenas" } });

    // Save a DIFFERENT card.
    fireEvent.click(screen.getByTestId("medical-section-insurance-edit"));
    fireEvent.click(await screen.findByTestId("medical-section-insurance-save"));
    await waitFor(() => expect(invoked.length).toBe(1));

    // The doctor card's draft did not ride along; the record's value went instead.
    expect(invoked[0].body.hospital_preference).toBeNull();
    expect(invoked[0].body.doctor_name).toBe("Dr Ruiz");
  });
});

describe("getting into your home — read-only, masked, with a reason", () => {
  it("shows the section even when the member has no access row", async () => {
    // A member with no key safe still needs to know the section exists and that it is not
    // theirs to fill in.
    await renderPage();
    expect(await screen.findByTestId("medical-section-access")).toBeTruthy();
    for (const f of MEMBER_ACCESS_FIELDS) {
      expect(screen.getByTestId(`access-field-${f.column}`)).toBeTruthy();
    }
  });

  it("masks the codes and offers no edit", async () => {
    accessRow = {
      key_safe_location: "Under the meter box",
      key_safe_code: "4821",
      gate_code: "1234",
      access_notes: "Dog in the kitchen",
    };
    await renderPage();
    await screen.findByTestId("medical-section-access");
    await waitFor(() => expect(screen.queryAllByTestId("reveal-secret").length).toBe(2));
    // The code is not in the DOM as text until Show is pressed.
    expect(screen.queryByText("4821")).toBeNull();
    expect(screen.getByText("Under the meter box")).toBeTruthy();
  });

  it("reveals a code only when Show is pressed, and hides it again", async () => {
    accessRow = { key_safe_location: null, key_safe_code: "4821", gate_code: null, access_notes: null };
    await renderPage();
    const toggle = (await screen.findAllByTestId("reveal-secret"))[0];
    fireEvent.click(toggle);
    expect(await screen.findByText("4821")).toBeTruthy();
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByText("4821")).toBeNull());
  });

  it("gives the REASON it is locked — R7's pattern, not R6's banned sentence", async () => {
    /*
      R6 bans "contact support to change". R7 sanctions a locked field WITH A REASON, and this
      is that class: a key-safe code the account holder can change is one anyone who gets into
      the account can change, and the operator would then read a number a stranger typed.
    */
    accessRow = { key_safe_location: "Porch", key_safe_code: null, gate_code: null, access_notes: null };
    await renderPage();
    const reason = await screen.findByText(/we check who you are before we alter/i);
    expect(reason).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/contact support/i);
  });

  it("a failed read says so, and is NOT rendered as an empty section", async () => {
    accessError = { message: "permission denied" };
    await renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not read this section/i);
    expect(alert.textContent).toMatch(/not empty/i);
  });
});

describe("the ratchet is real, not decorative", () => {
  it("MEDICAL_SECTIONS is `as const satisfies`, not an annotated const", () => {
    /*
      IT WAS DECORATIVE, and a mutation test is what found it. Declared
      `: readonly MedicalSection[] = […] as const`, the annotation WIDENS the type — so
      `[number]["fields"][number]["column"]` resolved to every non-provenance column regardless
      of what the array contained, `Uncovered` was always `never`, and deleting an entire field
      from a section produced ZERO type errors.

      Asserted at source level because the whole point is a check the compiler performs: a test
      cannot observe a type error in a file that compiles.
    */
    const src = read("src/lib/medicalFields.ts");
    expect(src).toContain("] as const satisfies readonly MedicalSection[];");
    expect(src).not.toMatch(/export const MEDICAL_SECTIONS: readonly MedicalSection\[\]/);
    expect(src).toContain("] as const satisfies readonly MemberAccessField[];");
    expect(src).not.toMatch(/export const MEMBER_ACCESS_FIELDS: readonly MemberAccessField\[\]/);
  });

  it("every access field states whether it is secret — none by omission", () => {
    // `secret` is required rather than optional, so a new field cannot default to visible
    // because nobody thought about it.
    for (const f of MEMBER_ACCESS_FIELDS) {
      expect(typeof f.secret, `${f.column} does not say whether it is secret`).toBe("boolean");
    }
    expect(MEMBER_ACCESS_FIELDS.filter((f) => f.secret).map((f) => f.column)).toEqual([
      "key_safe_code",
      "gate_code",
    ]);
  });
});

describe("the hand-written copies of this table's shape are gone", () => {
  it("useMemberProfile types MedicalInfo from the generated row", () => {
    // It was an interface listing eight columns — the third hand-maintained copy of the table.
    // The query already said select("*"), so the data was always arriving; the TYPE threw it
    // away.
    const src = read("src/hooks/useMemberProfile.ts");
    expect(src).toContain('export type MedicalInfo = Tables<"medical_information">');
    expect(src).not.toMatch(/export interface MedicalInfo \{/);
  });

  it("the page renders from the field list rather than hand-rolled markup", () => {
    const src = read("src/pages/client/MedicalInfoPage.tsx");
    expect(src).toContain("MEDICAL_SECTIONS.map");
    // The old page hardcoded these. If they come back, so does eight-of-sixteen.
    expect(src).not.toContain('form.watch("blood_type")');
    expect(src).not.toMatch(/setConditions|setMedications|setAllergies/);
  });
});
