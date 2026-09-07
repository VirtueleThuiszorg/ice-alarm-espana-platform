/**
 * THE ADDRESS AN AMBULANCE CAN FIND, AND TELLING US YOU ARE AWAY — WP5, CC6.
 *
 * `20260907100300_circle_of_care.sql` added seven columns to `members` and made the argument for
 * each in one sentence:
 *
 *   the address   "An ambulance crew with the street but not the portal is standing outside a
 *                  gated development at night. This is where the minutes go."
 *   the pendant   "A device gone quiet and a device in a drawer in Birmingham are different
 *                  problems."
 *   away status   "Member-writable by design: someone going to the UK for a month should be able
 *                  to say so without ringing the office."
 *
 * Nothing rendered any of them.
 *
 * ── AND THE COMPILER FOUND A SECOND DEFECT ON THE WAY ──────────────────────────────────────
 *
 * `MemberProfile` was the third hand-written subset of a table's shape in `useMemberProfile.ts`,
 * after `MedicalInfo` and `EmergencyContact`. Correcting it to `Tables<"members">` produced a
 * type error that was not about the new columns at all: it declared
 * `preferred_language: "en" | "es"` for a **nullable three-value** column, and the form's schema
 * was `z.enum(["en", "es"])`.
 *
 * So **a member whose row says `nl` could not be loaded into their own profile form** — and
 * `nl.json` is a complete translation that `localeParse` enforces key-for-key. Dutch was
 * storable, translated, tested, and unreachable from the running application, because two
 * separate hard-coded arrays each offered two of the three.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  MEMBER_LANGUAGES,
  DEFAULT_MEMBER_LANGUAGE,
  memberLanguage,
  memberLanguageSpec,
} from "@/lib/memberLanguages";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

let profileRow: Record<string, unknown> = {};
let updates: Record<string, unknown>[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.single = () => Promise.resolve({ data: profileRow, error: null });
  c.maybeSingle = () => Promise.resolve({ data: profileRow, error: null });
  c.update = (payload: Record<string, unknown>) => {
    updates.push(payload);
    return { eq: () => Promise.resolve({ error: null }) };
  };
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => chain() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1", isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/gdpr/GdprSettingsSection", () => ({ GdprSettingsSection: () => null }));
vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

const BASE = {
  id: "m1",
  user_id: "u1",
  first_name: "Ana",
  last_name: "Ruiz",
  email: "ana@example.test",
  phone: "+34600000000",
  date_of_birth: "1943-04-11",
  address_line_1: "Calle Mayor 1",
  address_line_2: null,
  city: "Almería",
  province: "Almería",
  postal_code: "04001",
  country: "Spain",
  nie_dni: "X1234567L",
  preferred_language: "es",
  photo_url: null,
  special_instructions: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  urbanizacion: null,
  bloque: null,
  portal: null,
  escalera: null,
  away_from: null,
  away_until: null,
  pendant_with_member: null,
};

async function renderProfile() {
  const Page = (await import("@/pages/client/ProfilePage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
  /*
    WAIT FOR THE FORM TO HOLD THE PROFILE, not for the page shell to paint.

    `page-header` appears the moment `profileLoading` goes false — but the fields are filled by
    react-hook-form's `values` option, which applies in an effect on a LATER render. Between the
    two, every input still reads "". Assertions here that check a stored value immediately after
    this helper were therefore racing, and won only because the gap was short.

    It stopped being short: `NotificationPreferences` (WP3 N9) added two more queries to this
    page, and on a loaded CI runner "shows what is already stored" read `""` and failed. The
    fix is the wait condition, not the page — `first_name` is "Ana" in every fixture here, so
    its presence is the signal that `values` has actually been applied.
  */
  await screen.findByDisplayValue("Ana");
  return view;
}

const save = async () => {
  fireEvent.submit(document.querySelector("form")!);
  await waitFor(() => expect(updates.length).toBeGreaterThan(0));
  return updates[0];
};

beforeEach(() => {
  profileRow = { ...BASE };
  updates = [];
});
afterEach(() => cleanup());

describe("the structured Spanish address", () => {
  it("renders all four parts", async () => {
    await renderProfile();
    expect(screen.getByTestId("structured-address")).toBeVisible();
    for (const label of [/Urbanización/, /Bloque/, /Portal/, /Escalera/]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
  });

  it("saves what the member types", async () => {
    await renderProfile();
    fireEvent.change(screen.getByLabelText(/Portal/), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText(/Bloque/), { target: { value: "3" } });
    const payload = await save();
    expect(payload.portal).toBe("B");
    expect(payload.bloque).toBe("3");
  });

  it("writes NULL for a part they leave blank, never an empty string", async () => {
    // An empty string in `portal` reads as "the portal is called nothing" to anybody querying it.
    await renderProfile();
    const payload = await save();
    for (const col of ["urbanizacion", "bloque", "portal", "escalera"]) {
      expect(payload[col], col).toBeNull();
    }
  });

  it("shows what is already stored", async () => {
    profileRow = { ...BASE, urbanizacion: "Los Naranjos", escalera: "2" };
    await renderProfile();
    expect((screen.getByLabelText(/Urbanización/) as HTMLInputElement).value).toBe("Los Naranjos");
    expect((screen.getByLabelText(/Escalera/) as HTMLInputElement).value).toBe("2");
  });

  it("is optional — a member on an ordinary street can save without it", async () => {
    // Requiring a bloque somebody does not have is how a form teaches people to type "n/a".
    await renderProfile();
    const payload = await save();
    expect(payload.first_name).toBe("Ana"); // the save went through
  });
});

describe("away status", () => {
  it("offers both dates and the pendant question", async () => {
    await renderProfile();
    expect(screen.getByTestId("away-card")).toBeVisible();
    expect(screen.getByTestId("away-from")).toBeVisible();
    expect(screen.getByTestId("away-until")).toBeVisible();
    expect(screen.getByTestId("pendant-with-member")).toBeVisible();
  });

  it("writes NULL for an empty date, not an empty string", async () => {
    /*
      `away_from` and `away_until` are `date` columns. Posting "" is a Postgres error, so a
      member who typed a date and then cleared it could not save their profile AT ALL — the
      failure would look like "saving is broken", not "that date is empty".
    */
    await renderProfile();
    const payload = await save();
    expect(payload.away_from).toBeNull();
    expect(payload.away_until).toBeNull();
  });

  it("saves the dates a member gives", async () => {
    await renderProfile();
    fireEvent.change(screen.getByTestId("away-from"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByTestId("away-until"), { target: { value: "2026-10-21" } });
    const payload = await save();
    expect(payload.away_from).toBe("2026-10-01");
    expect(payload.away_until).toBe("2026-10-21");
  });

  it("defaults 'pendant with me' to TRUE for a row that has never been asked", async () => {
    // NULL means nobody asked. The normal case is that a pendant is with its member, and the
    // question only matters while they are away.
    profileRow = { ...BASE, pendant_with_member: null };
    await renderProfile();
    const payload = await save();
    expect(payload.pendant_with_member).toBe(true);
  });

  it("keeps a stored FALSE rather than resetting it on the next save", async () => {
    profileRow = { ...BASE, pendant_with_member: false };
    await renderProfile();
    const payload = await save();
    expect(payload.pendant_with_member).toBe(false);
  });
});

describe("the language a member is allowed to be in", () => {
  it("offers every value the database enum allows", () => {
    const dir = path.join(ROOT, "supabase/migrations");
    let fromSql: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(path.join(dir, f), "utf8");
      const created = sql.match(
        /CREATE\s+TYPE\s+(?:public\.)?preferred_language\s+AS\s+ENUM\s*\(([^)]*)\)/i,
      );
      if (created) fromSql = [...created[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      for (const m of sql.matchAll(
        /ALTER\s+TYPE\s+(?:public\.)?preferred_language\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi,
      )) {
        if (!fromSql.includes(m[1])) fromSql.push(m[1]);
      }
    }
    expect(fromSql.length, "the enum was not found in the migrations").toBeGreaterThanOrEqual(3);
    expect(MEMBER_LANGUAGES.map((l) => l.code).sort()).toEqual(fromSql.sort());
  });

  it("includes Dutch, which the app translates and could not select", () => {
    expect(MEMBER_LANGUAGES.map((l) => l.code)).toContain("nl");
  });

  it("both selectors read the SAME list — two arrays is how they drifted", () => {
    const selector = read("src/components/LanguageSelector.tsx");
    const profile = read("src/pages/client/ProfilePage.tsx");
    expect(selector).toContain("MEMBER_LANGUAGES");
    expect(profile).toContain("MEMBER_LANGUAGES");
    // Neither may keep its own literal list any more.
    expect(selector).not.toMatch(/\{ code: "en", label: "English"/);
    expect(profile).not.toMatch(/<SelectItem value="en">English<\/SelectItem>/);
  });

  it("a NULL preferred_language resolves to a real code rather than nothing", () => {
    expect(memberLanguage(null)).toBe(DEFAULT_MEMBER_LANGUAGE);
    expect(memberLanguage(undefined)).toBe(DEFAULT_MEMBER_LANGUAGE);
    expect(memberLanguage("")).toBe(DEFAULT_MEMBER_LANGUAGE);
  });

  it("an i18n tag like en-GB resolves to its base language", () => {
    // `i18n.language` reports the tag; the column stores the base.
    expect(memberLanguage("en-GB")).toBe("en");
    expect(memberLanguage("nl-NL")).toBe("nl");
  });

  it("an unknown code resolves to the default rather than being written back", () => {
    expect(memberLanguage("de")).toBe(DEFAULT_MEMBER_LANGUAGE);
  });

  it("every language has an endonym label", () => {
    for (const lang of MEMBER_LANGUAGES) {
      expect(memberLanguageSpec(lang.code).label.length).toBeGreaterThan(2);
    }
  });

  it("A MEMBER WHOSE ROW SAYS nl CAN OPEN AND SAVE THEIR PROFILE", async () => {
    // The defect the type correction exposed: the form's enum was ["en","es"], so this member
    // could not be loaded into it at all.
    profileRow = { ...BASE, preferred_language: "nl" };
    await renderProfile();
    const payload = await save();
    expect(payload.preferred_language).toBe("nl");
  });

  it("and a member with NO language does not have one silently invented differently", async () => {
    profileRow = { ...BASE, preferred_language: null };
    await renderProfile();
    const payload = await save();
    expect(payload.preferred_language).toBe(DEFAULT_MEMBER_LANGUAGE);
  });
});

describe("the third hand-written subset of a table's shape", () => {
  it("`MemberProfile` is the generated row", () => {
    const src = read("src/hooks/useMemberProfile.ts");
    expect(src).toMatch(/export type MemberProfile = Tables<"members">/);
    expect(src).not.toMatch(/export interface MemberProfile \{/);
  });

  it("and so are the other two, so this file keeps no hand-written row types", () => {
    const src = read("src/hooks/useMemberProfile.ts");
    for (const name of ["MedicalInfo", "EmergencyContact", "MemberProfile"]) {
      expect(src, name).toMatch(new RegExp(`export type ${name} = Tables<`));
    }
  });
});
