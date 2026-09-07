/**
 * THE FOUR LOCKED FIELDS ON THE PROFILE PAGE — R7, and R6's banned sentence.
 *
 * R7: *"DOB and NIE stay locked with a reason: 'Call us to change this — we need to verify who
 * you are.'"* R6: *"Never 'contact support to change'."*
 *
 * Those are not in tension. R6 bans the sentence for a field the member could perfectly well
 * edit themselves, where it is an apology for a missing feature. R7 sanctions a lock where there
 * is a real reason — and asks for the reason to be on the screen.
 *
 * `ProfilePage` had four locked fields and got all four wrong, in one of two ways:
 *
 *   date of birth   "Cannot be changed"                              what, not why
 *   NIE / DNI       "Cannot be changed"                              what, not why
 *   email           "Contact support to change your email address"   R6's banned sentence, verbatim
 *   country         nothing at all                                   locked with no reason
 *
 * THE PADLOCK IS A LABEL, NOT A RULE, and that is the finding this file records rather than
 * fixes. "Members can update own profile" is `FOR UPDATE` with no column restriction, and the
 * guard trigger from 20260904180000 names only `status` — its own comment lists NIE as an
 * ordinary self-service write. So a member can still PATCH `date_of_birth` and `nie_dni`
 * through PostgREST. The migration that closes it is a schema change, which is Lee's to apply
 * (`PENDING_FOR_LEE.md` D-14); what IS asserted here is that this application never sends them.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const locale = (l: string) =>
  JSON.parse(read(`src/i18n/locales/${l}.json`)) as Record<string, Record<string, string>>;

const profileRow = {
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
  special_instructions: null,
  photo_url: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
};

let updatePayloads: Record<string, unknown>[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.single = () => Promise.resolve({ data: profileRow, error: null });
  c.maybeSingle = () => Promise.resolve({ data: profileRow, error: null });
  c.update = (payload: Record<string, unknown>) => {
    updatePayloads.push(payload);
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
    t: (key: string, fallback?: string) => {
      const [ns, ...rest] = key.split(".");
      const table = locale("en")[ns] as Record<string, string> | undefined;
      return table?.[rest.join(".")] ?? fallback ?? key;
    },
    i18n: { language: "en" },
  }),
}));

async function renderProfile() {
  const Page = (await import("@/pages/client/ProfilePage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("page-header")).toBeTruthy());
  return view;
}

afterEach(() => {
  cleanup();
  updatePayloads = [];
});

const LOCKED = [
  "profile-locked-dob",
  "profile-locked-nie",
  "profile-locked-email",
  "profile-locked-country",
];

describe("every locked field carries a reason", () => {
  it("all four are rendered, locked", async () => {
    await renderProfile();
    for (const id of LOCKED) {
      expect(screen.getByTestId(id)).toBeVisible();
    }
  });

  it("and each one says WHY, in a sentence", async () => {
    await renderProfile();
    for (const id of LOCKED) {
      const reason = screen.getByTestId(`${id}-reason`);
      expect(reason).toBeVisible();
      // "Cannot be changed" is 17 characters and says nothing. A reason is a sentence.
      expect(reason.textContent!.trim().length, `${id} needs a reason, not a label`).toBeGreaterThan(
        25,
      );
    }
  });

  it("DOB and NIE use R7's own sentence", async () => {
    await renderProfile();
    for (const id of ["profile-locked-dob", "profile-locked-nie"]) {
      expect(screen.getByTestId(`${id}-reason`).textContent).toContain(
        "Call us to change this",
      );
      expect(screen.getByTestId(`${id}-reason`).textContent).toContain("verify who you are");
    }
  });

  it("NONE of them says 'contact support' — R6 bans that sentence", async () => {
    await renderProfile();
    for (const id of LOCKED) {
      expect(screen.getByTestId(`${id}-reason`).textContent!.toLowerCase()).not.toContain(
        "contact support",
      );
    }
  });

  it("shows an em dash rather than an empty box when we have not got the value", async () => {
    // A blank locked field reads as "there is nothing here"; on this page a member should be able
    // to tell "we never asked you" from "you left it out".
    const src = read("src/components/client/LockedIdentityField.tsx");
    expect(src).toContain('value ?? "—"');
  });

  it("`reason` is a REQUIRED prop, so a new locked field cannot omit it", () => {
    const src = read("src/components/client/LockedIdentityField.tsx");
    // `reason?:` would let the next locked field default to no explanation because nobody
    // thought about it — which is the complaint R6 is making.
    expect(src).not.toMatch(/reason\?:/);
    expect(src).toMatch(/^\s*reason: ReactNode;/m);
  });

  it("the dead 'Cannot be changed' keys are gone from all three locales", () => {
    for (const l of ["en", "es", "nl"]) {
      expect(locale(l).profile).not.toHaveProperty("dobReadOnly");
      expect(locale(l).profile).not.toHaveProperty("nieReadOnly");
    }
  });

  it("and the R6-banned email sentence is gone from all three, not just English", () => {
    for (const l of ["en", "es", "nl"]) {
      expect(locale(l).profile.emailChangeNote.toLowerCase()).not.toContain("contact support");
    }
    expect(locale("es").profile.emailChangeNote.toLowerCase()).not.toContain("contacte con");
  });
});

describe("what the page actually sends — the padlock is not the enforcement", () => {
  it("the save payload contains none of the locked columns", async () => {
    await renderProfile();
    const form = document.querySelector("form")!;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.submit(form);
    await waitFor(() => expect(updatePayloads.length).toBe(1));

    for (const column of ["date_of_birth", "nie_dni", "email", "country"]) {
      expect(Object.keys(updatePayloads[0]), `${column} must not be sent`).not.toContain(column);
    }
  });

  it("and it sends neither `status` nor `user_id` nor `photo_url`", async () => {
    /*
      `status` is guarded server-side (20260904180000) and would be REFUSED, not ignored — a
      payload carrying it would make every profile save fail. `user_id` re-parents the member
      record. `photo_url` has no upload path yet, so sending it could only clear one.
    */
    await renderProfile();
    const form = document.querySelector("form")!;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.submit(form);
    await waitFor(() => expect(updatePayloads.length).toBe(1));

    for (const column of ["status", "user_id", "photo_url"]) {
      expect(Object.keys(updatePayloads[0])).not.toContain(column);
    }
  });

  it("records honestly that the DB does not yet refuse them", () => {
    /*
      The guard trigger names only `status`, and says so in its own comment: "An ordinary profile
      update (phone, address, NIE) must stay exactly as cheap as it was." So NIE and DOB are
      writable by the member through PostgREST today. This assertion exists so that the day the
      trigger covers them, this test fails and somebody updates the claim — a stale "known
      limitation" is worse than none.
    */
    const guard = read("supabase/migrations/20260904180000_member_status_not_self_writable.sql");
    expect(guard).not.toContain("nie_dni");
    expect(guard).not.toContain("date_of_birth");
    expect(read("PENDING_FOR_LEE.md")).toContain("D-14");
  });
});
