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

/**
 * EVERY card, and the payload each one sends — ONE TEST PER CARD.
 *
 * These assertions used to fire one `submit` at the page's single form and inspect the one
 * payload it produced. R6 split that into five cards with five writes, so a check that only
 * looked at the first would stop covering the other four: the address card could start sending
 * `country` and nothing here would notice.
 *
 * WHY PER CARD AND NOT ALL FIVE IN ONE TEST. The first version of this did save all five and
 * assert over the union. It passed locally and TIMED OUT on CI at the 5s default — five save
 * cycles is ten `waitFor`s, and a loaded runner is enough slower to cross it. Raising the
 * timeout would have hidden that a single test was doing five tests' work; a test per card is
 * five fast tests, and a failure names the card instead of the loop.
 */
const EDITABLE_CARDS = [
  "profile-card-personal",
  "profile-card-contact",
  "profile-card-address",
  "profile-card-preferences",
  "away-card",
] as const;

/** Unlock one card, save it, and hand back the single payload it wrote. */
async function saveCard(card: string): Promise<Record<string, unknown>> {
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.click(screen.getByTestId(`${card}-edit`));
  await waitFor(() => expect(screen.getByTestId(`${card}-save`)).toBeVisible());
  fireEvent.click(screen.getByTestId(`${card}-save`));
  await waitFor(() => expect(updatePayloads.length).toBe(1));
  return updatePayloads[0];
}

/** Columns no card may ever send, and why each one matters. */
const NEVER_SENT = [
  // R7's locked identity fields. The padlock is a label; this is what the page actually does.
  "date_of_birth",
  "nie_dni",
  "email",
  "country",
  // Guarded server-side (20260904180000) and would be REFUSED, not ignored — a payload carrying
  // it would make every profile save fail.
  "status",
  // Re-parents the member record.
  "user_id",
  // Written by the photo upload alone. A text card carrying it could only clear a photo
  // somebody had just set.
  "photo_url",
] as const;

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
  for (const card of EDITABLE_CARDS) {
    it(`${card} sends none of the columns it must never send`, async () => {
      await renderProfile();
      const payload = await saveCard(card);
      const sent = Object.keys(payload);
      expect(sent.length, "the card wrote nothing at all").toBeGreaterThan(0);
      for (const column of NEVER_SENT) {
        expect(sent, `${card} must not send ${column}`).not.toContain(column);
      }
    });
  }

  it("a card writes ONLY its own columns — a second open card cannot ride along", async () => {
    /*
      THE DEFECT PER-CARD EDITING WOULD OTHERWISE INTRODUCE. Two cards can be open at once, and
      a save that posted the whole form would carry the other card's unsaved draft: a member who
      typed a new address and then saved their language would have silently saved the address.
      `CARD_COLUMNS` in the page is what prevents it, and this is the assertion that it does.
    */
    await renderProfile();
    const { fireEvent } = await import("@testing-library/react");

    // Open the address card and type into it, WITHOUT saving.
    fireEvent.click(screen.getByTestId("profile-card-address-edit"));
    await waitFor(() => expect(screen.getByTestId("profile-card-address-save")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/^Address Line 1/i), {
      target: { value: "Calle Nueva 99" },
    });

    // Now save a DIFFERENT card.
    fireEvent.click(screen.getByTestId("profile-card-preferences-edit"));
    await waitFor(() => expect(screen.getByTestId("profile-card-preferences-save")).toBeVisible());
    fireEvent.click(screen.getByTestId("profile-card-preferences-save"));
    await waitFor(() => expect(updatePayloads.length).toBe(1));

    expect(Object.keys(updatePayloads[0])).toEqual(["preferred_language"]);
    expect(updatePayloads[0]).not.toHaveProperty("address_line_1");
  });

  it("a locked identity field stays locked when its card is UNLOCKED", async () => {
    /*
      R7's lock is not the card's lock. Pressing Edit on the personal card unlocks the name
      fields beside the date of birth and the NIE; those two must not become inputs, because
      the reason they are locked — "we need to verify who you are" — does not stop applying
      because the member pressed Edit on the card they happen to sit in.
    */
    await renderProfile();
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByTestId("profile-card-personal-edit"));
    await waitFor(() => expect(screen.getByTestId("profile-card-personal-save")).toBeVisible());

    // The name beside them IS an input now — otherwise this test would pass on a card that
    // never unlocked at all.
    expect(screen.getByLabelText(/^First Name/i).tagName).toBe("INPUT");

    for (const testId of ["profile-locked-dob", "profile-locked-nie"]) {
      const field = screen.getByTestId(testId);
      expect(field.querySelector("input"), `${testId} must not become an input`).toBeNull();
      expect(field.querySelector("textarea")).toBeNull();
      // …and the reason is still on the screen, which is the half of R7 that matters.
      expect(screen.getByTestId(`${testId}-reason`)).toBeVisible();
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
